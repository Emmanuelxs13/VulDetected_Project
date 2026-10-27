import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dbCalls, dbQueue, resetDbMock } from '@test/db-mock';

import { enqueueScanForDomain } from './enqueue';

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

vi.mock('@/lib/audit', () => ({
  audit: vi.fn(async () => undefined),
}));

vi.mock('@/lib/celery', () => ({
  enqueueScanJob: vi.fn(async () => undefined),
}));

vi.mock('@/lib/env', () => ({
  getEnv: () => ({
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    AUTH_URL: 'http://localhost:3000',
  }),
}));

vi.mock('@/lib/plan-limits', () => ({
  checkScanAllowance: vi.fn(async () => null),
}));

/**
 * Declared inside the factory because `vi.mock` is hoisted: a module-scope class
 * would not exist yet when the factory runs, and `enqueue.ts` uses
 * `instanceof` on this exact reference.
 */
vi.mock('@/lib/credentials/store', () => {
  class CredentialUnavailableError extends Error {
    constructor(
      message: string,
      readonly reason: string,
    ) {
      super(message);
      this.name = 'CredentialUnavailableError';
    }
  }

  return {
    CredentialUnavailableError,
    activeCredentialForScan: vi.fn(async () => null),
    markCredentialUsed: vi.fn(async () => undefined),
  };
});

const DOMAIN = { id: 'domain-1', userId: 'user-1' };

const TARGET = {
  url: 'https://example.com',
  scheme: 'https' as const,
  host: 'example.com',
  port: 443,
  baseUrl: 'https://example.com',
};

const INPUT = {
  domainId: DOMAIN.id,
  target: TARGET,
  actorUserId: 'user-1',
  source: 'manual' as const,
};

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

describe('enqueueScanForDomain', () => {
  it('reports a missing domain without inserting anything', async () => {
    dbQueue.push([]);

    const outcome = await enqueueScanForDomain(INPUT);

    expect(outcome).toEqual({ ok: false, error: 'domain_missing' });
    expect(dbCalls.filter((call) => call.method === 'insert')).toHaveLength(0);
  });

  it('enforces the plan limit at the choke point both callers pass through', async () => {
    const { checkScanAllowance } = await import('@/lib/plan-limits');
    vi.mocked(checkScanAllowance).mockResolvedValueOnce('concurrent_scan_limit');
    dbQueue.push([DOMAIN]);

    const outcome = await enqueueScanForDomain(INPUT);

    expect(outcome).toEqual({ ok: false, error: 'concurrent_scan_limit' });
    expect(dbCalls.filter((call) => call.method === 'insert')).toHaveLength(0);
    expect(dbCalls.filter((call) => call.method === 'values')).toHaveLength(0);
  });

  it('enqueues an anonymous scan when the domain has no credential', async () => {
    dbQueue.push([DOMAIN]);
    dbQueue.push([{ id: 'scan-1' }]);

    const outcome = await enqueueScanForDomain(INPUT);

    expect(outcome).toEqual({ ok: true, scanId: 'scan-1' });

    const values = dbCalls.find((call) => call.method === 'values')?.args[0] as
      Record<string, unknown> | undefined;
    expect(values?.credentialId).toBeNull();

    const { enqueueScanJob } = await import('@/lib/celery');
    const payload = vi.mocked(enqueueScanJob).mock.calls[0]?.[0];

    expect(payload).toBeDefined();
    expect(payload && 'credentials' in payload).toBe(false);
  });

  it('attaches a resolved credential to the row and the published job', async () => {
    const { activeCredentialForScan, markCredentialUsed } = await import('@/lib/credentials/store');
    vi.mocked(activeCredentialForScan).mockResolvedValueOnce({
      credentialId: 'credential-1',
      payload: { kind: 'bearer', token: 'abc' },
    });

    dbQueue.push([DOMAIN]);
    dbQueue.push([{ id: 'scan-1' }]);

    const outcome = await enqueueScanForDomain(INPUT);

    expect(outcome).toEqual({ ok: true, scanId: 'scan-1' });

    const values = dbCalls.find((call) => call.method === 'values')?.args[0] as
      Record<string, unknown> | undefined;
    expect(values?.credentialId).toBe('credential-1');

    const { enqueueScanJob } = await import('@/lib/celery');
    expect(vi.mocked(enqueueScanJob).mock.calls[0]?.[0].credentials).toEqual({
      kind: 'bearer',
      token: 'abc',
    });

    expect(vi.mocked(markCredentialUsed)).toHaveBeenCalledWith('credential-1');
  });

  it('refuses the scan when the stored credential cannot be used', async () => {
    const { CredentialUnavailableError, activeCredentialForScan } =
      await import('@/lib/credentials/store');
    vi.mocked(activeCredentialForScan).mockRejectedValueOnce(
      new CredentialUnavailableError('unknown key version', 'unknown_key_version'),
    );

    dbQueue.push([DOMAIN]);

    const outcome = await enqueueScanForDomain(INPUT);

    expect(outcome).toEqual({ ok: false, error: 'credential_unavailable' });
    // No scan row: the problem is fixed in settings, not by retrying.
    expect(dbCalls.filter((call) => call.method === 'insert')).toHaveLength(0);

    const { audit } = await import('@/lib/audit');
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scan.failed',
        metadata: expect.objectContaining({ reason: 'credential_unavailable' }),
      }),
    );
  });

  it('marks the row failed when publication throws, so the gap stays visible', async () => {
    const { enqueueScanJob } = await import('@/lib/celery');
    vi.mocked(enqueueScanJob).mockRejectedValueOnce(new Error('broker down'));

    dbQueue.push([DOMAIN]);
    dbQueue.push([{ id: 'scan-1' }]);
    dbQueue.push([]); // update

    const outcome = await enqueueScanForDomain(INPUT);

    expect(outcome).toEqual({ ok: false, error: 'enqueue_failed' });

    const set = dbCalls.find((call) => call.method === 'set')?.args[0] as
      Record<string, unknown> | undefined;
    expect(set).toEqual({ status: 'failed', error: 'enqueue_failed' });
  });
});
