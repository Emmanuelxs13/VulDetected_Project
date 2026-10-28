import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as health } from '../health/route';
import { GET as ready } from './route';

/**
 * The probes are the contract between this app and whatever runs it. A wrong
 * answer here either restarts healthy containers or keeps sending traffic to an
 * instance that cannot read its own database.
 */

const mocks = vi.hoisted(() => ({
  execute: vi.fn<(query: unknown) => Promise<unknown>>(async () => [{ '?column?': 1 }]),
  ping: vi.fn<() => Promise<string>>(async () => 'PONG'),
}));

vi.mock('@/lib/db', () => ({
  db: () => ({ execute: (query: unknown) => mocks.execute(query) }),
}));

vi.mock('@/lib/redis', () => ({
  withRedis: (fn: (client: { ping: () => Promise<string> }) => Promise<unknown>) =>
    fn({ ping: () => mocks.ping() }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: () => undefined }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue([{ '?column?': 1 }]);
  mocks.ping.mockResolvedValue('PONG');
});

describe('GET /api/health', () => {
  it('answers 200 without touching a dependency', async () => {
    const response = await health();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: 'ok', service: 'vuldetected-web' });
    expect(typeof body.uptimeSeconds).toBe('number');

    // Liveness must not fail because a dependency is down: restarting this
    // process cannot fix Postgres.
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.ping).not.toHaveBeenCalled();
  });
});

describe('GET /api/ready', () => {
  it('answers 200 when the database and Redis both answer', async () => {
    const response = await ready();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      checks: Record<string, { ok: boolean; ms: number }>;
    };
    expect(body.status).toBe('ok');
    expect(body.checks.database?.ok).toBe(true);
    expect(body.checks.redis?.ok).toBe(true);
    expect(typeof body.checks.database?.ms).toBe('number');
  });

  it('answers 503 when the database is unreachable', async () => {
    mocks.execute.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const response = await ready();

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      status: string;
      checks: Record<string, { ok: boolean; error?: string }>;
    };
    expect(body.status).toBe('unavailable');
    expect(body.checks.database).toMatchObject({ ok: false, error: 'unreachable' });

    // The payload is public: a driver message would publish the database host.
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
  });

  it('stays ready but degraded when Redis is down', async () => {
    mocks.ping.mockRejectedValue(new Error('Redis is unreachable'));

    const response = await ready();

    // Redis absent costs the queue and the shared limiter, not the dashboards.
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      checks: Record<string, { ok: boolean }>;
    };
    expect(body.status).toBe('degraded');
    expect(body.checks.redis?.ok).toBe(false);
  });

  it('never lets a cache keep a readiness answer', async () => {
    const response = await ready();

    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
