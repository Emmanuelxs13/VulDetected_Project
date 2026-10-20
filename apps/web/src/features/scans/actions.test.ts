import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTxt } from 'node:dns/promises';

import { requireUser } from '@/features/auth/session';
import { safeFetch } from '@/lib/ssrf';
import { dbCalls, dbQueue, resetDbMock } from '@test/db-mock';

import { requestOwnershipChallengeAction, verifyOwnershipAction } from './actions';

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

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

const TOKEN = 'b'.repeat(64);
const PENDING_TOKEN = { id: 'token-1', value: TOKEN };

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
    // The upsert writes nothing: the unique row belongs to another user.
    dbQueue.push([]);

    const result = await verifyOwnershipAction({ hostname: 'example.com', method: 'dns_txt' });

    expect(result).toEqual({
      success: false,
      error: 'This domain is already verified by another account.',
    });
    expect(dbCalls.some((call) => call.method === 'delete')).toBe(false);
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
