import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The instrumentation hook is the only path a *server* error takes to the log:
 * `app/error.tsx` is a Client Component and can only reach the browser console.
 * These tests pin the two things that can silently regress — the logger being
 * skipped, and the Edge runtime being handed a Node-only module.
 */

const log = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  getLogger: () => log,
}));

const RUNTIME = 'NEXT_RUNTIME';

const CONTEXT = {
  routerKind: 'App Router',
  routePath: '/dashboard',
  routeType: 'render',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  delete process.env[RUNTIME];
});

describe('instrumentation', () => {
  it('logs one structured line at boot, in the Node runtime', async () => {
    process.env[RUNTIME] = 'nodejs';
    const { register } = await import('./instrumentation');

    await register();

    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info.mock.calls[0]?.[1]).toBe('server started');
    expect(log.info.mock.calls[0]?.[0]).toMatchObject({ env: expect.any(String) });
  });

  it('does not touch the logger in the Edge runtime', async () => {
    process.env[RUNTIME] = 'edge';
    const { register, onRequestError } = await import('./instrumentation');

    await register();
    await onRequestError(new Error('boom'), { path: '/x', method: 'GET' }, CONTEXT);

    // Edge cannot bundle pino; the guard is what keeps the build working.
    expect(log.info).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('reports an unhandled error with the route and the digest', async () => {
    process.env[RUNTIME] = 'nodejs';
    const { onRequestError } = await import('./instrumentation');

    const error = Object.assign(new Error('database exploded'), { digest: '1234567890' });
    await onRequestError(error, { path: '/dashboard', method: 'GET' }, CONTEXT);

    expect(log.error).toHaveBeenCalledTimes(1);
    const [fields, message] = log.error.mock.calls[0] ?? [];
    expect(message).toBe('unhandled request error');
    expect(fields).toMatchObject({
      err: error,
      // The digest is what the user sees on the error page: it is the only way
      // to join a screenshot to this line.
      digest: '1234567890',
      path: '/dashboard',
      method: 'GET',
      routePath: '/dashboard',
      routeType: 'render',
      routerKind: 'App Router',
    });
  });

  it('still logs an error that carries no digest', async () => {
    process.env[RUNTIME] = 'nodejs';
    const { onRequestError } = await import('./instrumentation');

    await onRequestError(new Error('no digest'), { path: '/', method: 'POST' }, CONTEXT);

    expect(log.error.mock.calls[0]?.[0]).toMatchObject({ digest: undefined });
  });
});
