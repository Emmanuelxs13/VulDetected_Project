import 'server-only';

import { withRedis } from './redis';

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

export async function consumeRateLimit(config: RateLimitConfig): Promise<void> {
  const { key, limit, windowSec } = config;
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;

  try {
    const count = await withRedis(async (client) => {
      const current = await client.incr(bucket);
      if (current === 1) {
        await client.expire(bucket, windowSec + 60);
      }
      return current;
    });

    if (count > limit) {
      throw new RateLimitError('Rate limit exceeded');
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw err;
    }
    // Fail closed as per design D4
    throw new RateLimitError('Rate limit unavailable');
  }
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
