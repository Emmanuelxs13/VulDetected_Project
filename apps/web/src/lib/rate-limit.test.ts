import { beforeEach, describe, expect, it, vi } from 'vitest';

import { consumeRateLimit, RateLimitError, resetRateLimitMemoryForTesting } from './rate-limit';

/**
 * The limiter has two backends: Redis, and a process-local window used when Redis
 * cannot be reached. Both must actually limit, and the fallback must be the one
 * that runs when the connection fails — otherwise "degrade gracefully" is a
 * comment rather than a behaviour.
 */

const incr = vi.fn<(key: string) => Promise<number>>(async () => 1);
const expire = vi.fn<(key: string, seconds: number) => Promise<boolean>>(async () => true);
const log = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  getLogger: () => log,
}));

vi.mock('@/lib/redis', () => ({
  withRedis: (fn: (client: unknown) => Promise<unknown>) =>
    fn({ incr: (key: string) => incr(key), expire: (key: string, sec: number) => expire(key, sec) }),
}));

beforeEach(() => {
  resetRateLimitMemoryForTesting();
  vi.clearAllMocks();
});

describe('consumeRateLimit (Redis backend)', () => {
  it('allows a request under the limit', async () => {
    incr.mockResolvedValueOnce(1);

    await expect(consumeRateLimit({ key: 'k', limit: 2, windowSec: 60 })).resolves.toBeUndefined();
  });

  it('sets a TTL on the first hit only', async () => {
    incr.mockResolvedValueOnce(1);
    await consumeRateLimit({ key: 'k', limit: 5, windowSec: 60 });

    incr.mockResolvedValueOnce(2);
    await consumeRateLimit({ key: 'k', limit: 5, windowSec: 60 });

    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith(expect.stringContaining('rl:k:'), 120);
  });

  it('refuses the request past the limit', async () => {
    incr.mockResolvedValueOnce(3);

    await expect(consumeRateLimit({ key: 'k', limit: 2, windowSec: 60 })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});

describe('consumeRateLimit (Redis unavailable)', () => {
  beforeEach(() => {
    incr.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379'));
  });

  it('still limits instead of taking the endpoint down', async () => {
    await consumeRateLimit({ key: 'fallback', limit: 2, windowSec: 3600 });
    await consumeRateLimit({ key: 'fallback', limit: 2, windowSec: 3600 });

    await expect(
      consumeRateLimit({ key: 'fallback', limit: 2, windowSec: 3600 }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('keeps separate budgets per key', async () => {
    await consumeRateLimit({ key: 'a', limit: 1, windowSec: 3600 });
    await consumeRateLimit({ key: 'a', limit: 1, windowSec: 3600 }).catch(() => undefined);

    await expect(
      consumeRateLimit({ key: 'b', limit: 1, windowSec: 3600 }),
    ).resolves.toBeUndefined();
  });

  it('warns once, not once per request', async () => {
    await consumeRateLimit({ key: 'warn', limit: 10, windowSec: 3600 });
    await consumeRateLimit({ key: 'warn', limit: 10, windowSec: 3600 });

    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});
