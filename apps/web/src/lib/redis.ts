import 'server-only';

import { createClient, type RedisClientType } from 'redis';

import { getEnv } from './env';

/**
 * Redis client wrapper (Sprint 2).
 *
 * The client is created lazily on first use to avoid module-scope evaluation
 * during `next build`. All operations are performed via `redisClient()` which
 * memoizes a single instance per process.
 *
 * ## Failures evict the cached client
 *
 * A failed `connect()` leaves the instance cached in a broken state: the next
 * caller sees `isReady === false`, calls `connect()` again on a client whose
 * socket already gave up, and the error surfaces in a place that has nothing to
 * do with the original outage. Dropping the cache on the way out means the next
 * call builds a fresh client, so a Redis restart heals without an app restart.
 *
 * ## The connect timeout is not optional
 *
 * A host that accepts the TCP handshake and then never speaks (a firewall that
 * DROPs instead of REJECTs) would otherwise hold `connect()` open for the
 * operating system's default, which is minutes. Every caller here sits in a
 * request path — registration, password reset, scan enqueue — so a bounded wait
 * is the difference between "degraded" and "the app is down".
 */

const CONNECT_TIMEOUT_MS = 3_000;

let cached: RedisClientType | null = null;

export function redisClient(): RedisClientType {
  if (cached !== null) {
    return cached;
  }

  const env = getEnv();
  const url = env.REDIS_URL ?? 'redis://localhost:6379/0';

  cached = createClient({
    url,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      /**
       * Give up after a few retries instead of reconnecting forever. A cached
       * client that keeps retrying in the background holds timers and keeps the
       * process from exiting in tests; a few attempts cover a rolling restart,
       * and beyond that the caller is better served by the error.
       */
      reconnectStrategy: (retries) => (retries > 5 ? new Error('Redis is unreachable') : Math.min(retries * 200, 1_000)),
    },
  });

  return cached;
}

export async function withRedis<T>(fn: (client: RedisClientType) => Promise<T>): Promise<T> {
  const client = redisClient();

  if (!client.isReady) {
    try {
      await client.connect();
    } catch (error) {
      try {
        cached?.destroy();
      } catch {
        // Already destroyed: nothing left to clean up.
      }
      cached = null;
      throw error;
    }
  }

  return fn(client);
}

/** Test seam: forget the memoised client so the next call reconnects. */
export function resetRedisForTesting(): void {
  try {
    cached?.destroy();
  } catch {
    // Already destroyed.
  }
  cached = null;
}
