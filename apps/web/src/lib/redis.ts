import 'server-only';

import { createClient } from 'redis';

import { getEnv } from './env';

/**
 * Redis client wrapper (Sprint 2).
 *
 * The client is created lazily on first use to avoid module-scope evaluation
 * during `next build`. All operations are performed via `redisClient()` which
 * memoizes a single instance per process.
 */

let cached: ReturnType<typeof createClient> | null = null;

export function redisClient() {
  if (cached !== null) {
    return cached;
  }

  const env = getEnv();
  const url = env.REDIS_URL ?? 'redis://localhost:6379/0';

  cached = createClient({ url });
  return cached;
}

export async function withRedis<T>(
  fn: (client: ReturnType<typeof createClient>) => Promise<T>,
): Promise<T> {
  const client = redisClient();
  if (!client.isReady) {
    await client.connect();
  }
  return fn(client);
}
