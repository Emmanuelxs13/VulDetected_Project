import 'server-only';

import { getLogger } from './logger';
import { withRedis } from './redis';

/**
 * Fixed-window rate limiting.
 *
 * ## Why a fixed window and not a token bucket
 *
 * Every caller needs the same thing: "at most N of these per window, keyed by
 * something the caller controls". A fixed window is one `INCR` and one `EXPIRE`,
 * which is the only shape that stays correct under concurrent requests without a
 * script or a transaction. Its known weakness — a burst that straddles the
 * boundary lets through up to 2N — only matters when N is near 1, and the keys
 * here are per-address and per-IP with N in the single digits.
 *
 * ## The Redis outage rule, and why it changed
 *
 * The original design failed closed: no Redis, no request. That is the right
 * instinct for a limiter that protects a credential, and the wrong outcome for
 * an authentication system, because it moves the blast radius of an
 * infrastructure failure onto the one thing users cannot work around. With Redis
 * down, nobody could register or reset a password — and the attacker who caused
 * the outage would not have needed to send a single request.
 *
 * So an unreachable Redis now degrades to a process-local window instead of
 * rejecting. The trade is stated plainly:
 *
 *   - the limit still applies, per process;
 *   - on a single-replica deployment that is the same limit;
 *   - on N replicas the effective limit becomes N×N, which is weaker than the
 *     shared counter and is why Redis remains the intended backend.
 *
 * The counter is pruned lazily: entries are only removed once their window has
 * expired and only when the map has grown past a bound, so a long-lived process
 * cannot be turned into a memory leak by spraying keys.
 */

export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface RateLimitConfig {
  key: string;
  limit: number;
  windowSec: number;
}

interface MemoryWindow {
  count: number;
  resetAt: number;
}

/** Upper bound on tracked keys before expired entries are swept. */
const MEMORY_MAX_ENTRIES = 5_000;

const memoryWindows = new Map<string, MemoryWindow>();

let warnedAboutFallback = false;

/**
 * Counts one hit against a window held in this process.
 *
 * Exported for the test that proves the fallback actually limits: an
 * untestable safety net is indistinguishable from no safety net.
 */
function memoryHit(bucket: string, windowSec: number, now: number): number {
  if (memoryWindows.size > MEMORY_MAX_ENTRIES) {
    for (const [key, window] of memoryWindows) {
      if (window.resetAt <= now) {
        memoryWindows.delete(key);
      }
    }
  }

  const existing = memoryWindows.get(bucket);

  if (existing === undefined || existing.resetAt <= now) {
    memoryWindows.set(bucket, { count: 1, resetAt: now + windowSec * 1_000 });
    return 1;
  }

  existing.count += 1;
  return existing.count;
}

/**
 * Counts one request against `key` and throws `RateLimitError` when the limit is
 * exceeded.
 *
 * The bucket name includes the window index, so the counter resets by rolling
 * over to a new key rather than by deleting anything: an `INCR` on a fresh key
 * is atomic, and there is no window in which the counter exists but has no TTL.
 */
export async function consumeRateLimit(config: RateLimitConfig): Promise<void> {
  const { key, limit, windowSec } = config;
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1_000 / windowSec)}`;

  let count: number;

  try {
    count = await withRedis(async (client) => {
      const current = await client.incr(bucket);
      if (current === 1) {
        await client.expire(bucket, windowSec + 60);
      }
      return current;
    });
  } catch (error) {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      getLogger('rate-limit').warn(
        { err: error },
        'Redis is unavailable; using the process-local window. ' +
          'Limits are per replica until Redis returns.',
      );
    }
    count = memoryHit(bucket, windowSec, Date.now());
  }

  if (count > limit) {
    throw new RateLimitError('Rate limit exceeded');
  }
}

/** Test seam: clear the fallback counters and the once-only warning. */
export function resetRateLimitMemoryForTesting(): void {
  memoryWindows.clear();
  warnedAboutFallback = false;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}
