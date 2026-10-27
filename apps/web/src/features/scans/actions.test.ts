import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTxt } from 'node:dns/promises';

import { requireUser } from '@/features/auth/session';
import { requestScanCancellation } from '@/lib/scan-cancellation';
import { safeFetch } from '@/lib/ssrf';
import { dbCalls, dbQueue, resetDbMock } from '@test/db-mock';

import {
  cancelScanAction,
  requestOwnershipChallengeAction,
  retryScanAction,
  verifyOwnershipAction,
} from './actions';
import { enqueueScanForDomain } from './enqueue';

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

vi.mock('@/features/auth/session', () => ({
  requireUser: vi.fn(async () => ({ session: { user: { id: 'user-1' } }, userId: 'user-1' })),
}));

vi.mock('node:dns/promises', () => ({
  resolveTxt: vi.fn(async () => [] as string[][]),
}));

vi.mock('@/lib/ssrf', () => ({
  safeFetch: vi.fn(async () => new Response('missing', { status: 404 })),
}));

vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: vi.fn(async () => undefined),
  RateLimitError: class RateLimitError extends Error {},
}));

vi.mock('@/lib/scan-cancellation', () => ({
  requestScanCancellation: vi.fn(async () => true),
}));

vi.mock('./enqueue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./enqueue')>();
  return { ...actual, enqueueScanForDomain: vi.fn(async () => ({ ok: true, scanId: 'scan-2' })) };
});

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

const TOKEN = 'b'.repeat(64);
const PENDING_TOKEN = { id: 'token-1', value: TOKEN };

/**
 * The single row `checkDomainAllowance` reads: plan, domains owned, and whether
 * this hostname is one of them. Values chosen so the common case is allowed.
 */
const ALLOWED = {
  subscriptionPlan: 'free' as const,
  domainCount: 1,
  alreadyOwned: 0,
  ownedByAnotherAccount: 0,
};

describe('requestOwnershipChallengeAction', () => {
  it('stores a domain_ownership token and returns publish instructions (DO-3)', async () => {
    const result = await requestOwnershipChallengeAction('ExAmPle.COM');

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.hostname).toBe('ExAmPle.COM');
    expect(result.data.normalizedHostname).toBe('example.com');
    expect(result.data.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.data.txtName).toBe('_vuldetected.example.com');
    expect(result.data.wellKnownUrl).toBe('https://example.com/.well-known/vuldetected.txt');

    const insert = dbCalls.find((call) => call.method === 'values');
    expect(insert?.args[0]).toMatchObject({
      purpose: 'domain_ownership',
      identifier: 'example.com',
      value: result.data.token,
    });
  });

  it('rejects an invalid hostname without touching the database', async () => {
    const result = await requestOwnershipChallengeAction('https://example.com');

    expect(result.success).toBe(false);
    expect(dbCalls).toHaveLength(0);
  });

  it('requires a session (redirects are the auth layer’s contract, mocked here)', async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error('NEXT_REDIRECT'));

    await expect(requestOwnershipChallengeAction('example.com')).rejects.toThrow('NEXT_REDIRECT');
    expect(dbCalls).toHaveLength(0);
  });
});

describe('verifyOwnershipAction', () => {
  it('verifies via DNS TXT and persists method, record and verified_at (DO-2/DO-4)', async () => {
    dbQueue.push([PENDING_TOKEN]);
    vi.mocked(resolveTxt).mockResolvedValueOnce([[TOKEN]]);
    dbQueue.push([ALLOWED]);
    dbQueue.push([{ id: 'domain-1' }]);
    dbQueue.push([1]);

    const result = await verifyOwnershipAction({ hostname: 'Example.com', method: 'dns_txt' });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.verificationMethod).toBe('dns_txt');
    expect(result.data.normalizedHostname).toBe('example.com');
    expect(new Date(result.data.verifiedAt).getTime()).not.toBeNaN();

    const insert = dbCalls.find((call) => call.method === 'values');
    expect(insert?.args[0]).toMatchObject({
      userId: 'user-1',
      hostname: 'Example.com',
      normalizedHostname: 'example.com',
      verified: true,
      verificationMethod: 'dns_txt',
      verificationRecord: TOKEN,
    });

    // The matched token is consumed in the same transaction (single-use).
    expect(dbCalls.some((call) => call.method === 'transaction')).toBe(true);
    expect(dbCalls.some((call) => call.method === 'delete')).toBe(true);
  });

  it('matches any unexpired challenge, not only the newest', async () => {
    dbQueue.push([
      { id: 'older', value: 'a'.repeat(64) },
      { id: 'newer', value: TOKEN },
    ]);
    vi.mocked(resolveTxt).mockResolvedValueOnce([['a'.repeat(64)]]);
    dbQueue.push([ALLOWED]);
    dbQueue.push([{ id: 'domain-1' }]);
    dbQueue.push([1]);

    const result = await verifyOwnershipAction({ hostname: 'example.com', method: 'dns_txt' });

    expect(result.success).toBe(true);
  });

  it('fails without writing when the TXT record does not match (DO-2)', async () => {
    dbQueue.push([PENDING_TOKEN]);
    vi.mocked(resolveTxt).mockResolvedValueOnce([['not-the-token']]);

    const result = await verifyOwnershipAction({ hostname: 'example.com', method: 'dns_txt' });

    expect(result.success).toBe(false);
    expect(dbCalls.some((call) => call.method === 'transaction')).toBe(false);
    expect(dbCalls.some((call) => call.method === 'delete')).toBe(false);
  });

  it('fails when the TXT record cannot be read', async () => {
    dbQueue.push([PENDING_TOKEN]);
    vi.mocked(resolveTxt).mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await verifyOwnershipAction({ hostname: 'example.com', method: 'dns_txt' });

    expect(result.success).toBe(false);
    expect(dbCalls.some((call) => call.method === 'transaction')).toBe(false);
  });

  it('fails before any proof lookup when no unexpired challenge exists', async () => {
    dbQueue.push([]);

    const result = await verifyOwnershipAction({ hostname: 'example.com', method: 'dns_txt' });

    expect(result.success).toBe(false);
    expect(vi.mocked(resolveTxt)).not.toHaveBeenCalled();
  });

  it('verifies via the well-known file and stores the path as the record (DO-2/DO-4)', async () => {
    dbQueue.push([PENDING_TOKEN]);
    vi.mocked(safeFetch).mockResolvedValueOnce(new Response(TOKEN, { status: 200 }));
    dbQueue.push([ALLOWED]);
    dbQueue.push([{ id: 'domain-1' }]);
    dbQueue.push([1]);

    const result = await verifyOwnershipAction({ hostname: 'example.com', method: 'well_known' });

    expect(result.success).toBe(true);
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      'https://example.com/.well-known/vuldetected.txt',
    );

    const insert = dbCalls.find((call) => call.method === 'values');
    expect(insert?.args[0]).toMatchObject({
      verificationMethod: 'well_known',
      verificationRecord: '/.well-known/vuldetected.txt',
    });
  });

  it('fails gracefully when the well-known fetch is refused by the SSRF gate', async () => {
    dbQueue.push([PENDING_TOKEN]);
    vi.mocked(safeFetch).mockRejectedValueOnce(new Error('blocked_address'));

    const result = await verifyOwnershipAction({ hostname: 'example.com', method: 'well_known' });

    expect(result.success).toBe(false);
    expect(dbCalls.some((call) => call.method === 'transaction')).toBe(false);
  });

  it('refuses a domain verified by another account without consuming the token', async () => {
    dbQueue.push([PENDING_TOKEN]);
    vi.mocked(resolveTxt).mockResolvedValueOnce([[TOKEN]]);
    dbQueue.push([{ ...ALLOWED, ownedByAnotherAccount: 1 }]);
    // The upsert writes nothing: the unique row belongs to another user.
    dbQueue.push([]);

    const result = await verifyOwnershipAction({ hostname: 'example.com', method: 'dns_txt' });

    expect(result).toEqual({
      success: false,
      error: 'This domain is already verified by another account.',
    });
    expect(dbCalls.some((call) => call.method === 'delete')).toBe(false);
  });

  it('refuses a new domain over the plan cap without consuming the token', async () => {
    dbQueue.push([PENDING_TOKEN]);
    vi.mocked(resolveTxt).mockResolvedValueOnce([[TOKEN]]);
    dbQueue.push([{ ...ALLOWED, domainCount: 3 }]);

    const result = await verifyOwnershipAction({ hostname: 'new.example.com', method: 'dns_txt' });

    expect(result).toEqual({ success: false, error: 'domain_limit' });
    expect(dbCalls.some((call) => call.method === 'transaction')).toBe(false);
    expect(dbCalls.some((call) => call.method === 'delete')).toBe(false);
  });

  it('does not charge a slot to re-verify a domain the account already owns', async () => {
    dbQueue.push([PENDING_TOKEN]);
    vi.mocked(resolveTxt).mockResolvedValueOnce([[TOKEN]]);
    dbQueue.push([{ ...ALLOWED, domainCount: 3, alreadyOwned: 1 }]);
    dbQueue.push([{ id: 'domain-1' }]);
    dbQueue.push([1]);

    const result = await verifyOwnershipAction({ hostname: 'example.com', method: 'dns_txt' });

    expect(result.success).toBe(true);
  });

  it('rejects unknown methods: the action is a public endpoint', async () => {
    const result = await verifyOwnershipAction({
      hostname: 'example.com',
      method: 'http_fetch' as 'dns_txt',
    });

    expect(result.success).toBe(false);
    expect(dbCalls).toHaveLength(0);
  });
});

describe('cancelScanAction', () => {
  it('cancels an owned active scan and signals the worker', async () => {
    dbQueue.push([{ id: 'scan-1' }]);
    dbQueue.push([{ id: 'scan-1' }]);

    const result = await cancelScanAction('scan-1');

    expect(result.success).toBe(true);
    expect(vi.mocked(requestScanCancellation)).toHaveBeenCalledWith('scan-1');
  });

  it('refuses when the scan already left the active states', async () => {
    dbQueue.push([]);

    const result = await cancelScanAction('scan-1');

    expect(result).toEqual({ success: false, error: 'scan_not_cancellable' });
    expect(vi.mocked(requestScanCancellation)).not.toHaveBeenCalled();
  });
});

describe('retryScanAction', () => {
  it('queues a new scan for the same target and records the retry', async () => {
    dbQueue.push([
      { domainId: 'domain-1', targetUrl: 'https://example.com', status: 'failed' as const },
    ]);

    const result = await retryScanAction('scan-1');

    expect(result).toEqual({ success: true, data: { scanId: 'scan-2' } });
    expect(vi.mocked(enqueueScanForDomain)).toHaveBeenCalledWith({
      domainId: 'domain-1',
      target: {
        url: 'https://example.com',
        scheme: 'https',
        host: 'example.com',
        port: 443,
        baseUrl: 'https://example.com',
      },
      actorUserId: 'user-1',
      source: 'manual',
    });
  });

  it('refuses a scan that is not failed or cancelled', async () => {
    dbQueue.push([]);

    const result = await retryScanAction('scan-1');

    expect(result).toEqual({ success: false, error: 'scan_not_retryable' });
    expect(vi.mocked(enqueueScanForDomain)).not.toHaveBeenCalled();
  });

  it('surfaces the plan limit instead of pretending the retry started', async () => {
    dbQueue.push([
      { domainId: 'domain-1', targetUrl: 'https://example.com', status: 'cancelled' as const },
    ]);
    vi.mocked(enqueueScanForDomain).mockResolvedValueOnce({
      ok: false,
      error: 'concurrent_scan_limit',
    });

    const result = await retryScanAction('scan-1');

    expect(result).toEqual({ success: false, error: 'concurrent_scan_limit' });
  });
});
