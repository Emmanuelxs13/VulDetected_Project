import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireUser } from '@/features/auth/session';
import { dbCalls, dbQueue, resetDbMock } from '@test/db-mock';

import { listCredentialsAction, revokeCredentialAction, saveCredentialAction } from './actions';

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

vi.mock('@/features/auth/session', () => ({
  requireUser: vi.fn(async () => ({ session: { user: { id: 'user-1' } }, userId: 'user-1' })),
}));

vi.mock('@/lib/audit', () => ({
  audit: vi.fn(async () => undefined),
}));

/**
 * The store is mocked so these tests are about the action's decisions — who may
 * write, what leaves the database, what is audited — and not about AES. The
 * error class is declared INSIDE the factory: `vi.mock` is hoisted above the
 * module scope, so a reference to a class declared below would be a TDZ error.
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
    sealCredential: vi.fn(() => ({ ciphertext: 'sealed-blob', keyVersion: 1 })),
    listActiveCredentials: vi.fn(async () => []),
  };
});

const DOMAIN_ID = '11111111-1111-4111-8111-111111111111';

const VALID_INPUT = {
  domainId: DOMAIN_ID,
  label: 'Production',
  secret: { kind: 'basic' as const, username: 'admin', password: 'hunter2' },
};

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

describe('saveCredentialAction', () => {
  it('refuses an unauthenticated caller before touching the database', async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error('no session'));

    const result = await saveCredentialAction(VALID_INPUT);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(dbCalls).toHaveLength(0);
  });

  it('rejects a malformed payload without a query', async () => {
    const result = await saveCredentialAction({ domainId: 'nope', label: '', secret: {} });

    expect(result).toEqual({ success: false, error: 'invalid_credential' });
    expect(dbCalls).toHaveLength(0);
  });

  it('refuses a domain that is not verified on this account', async () => {
    dbQueue.push([]);

    const result = await saveCredentialAction(VALID_INPUT);

    expect(result).toEqual({ success: false, error: 'domain_not_verified' });
    expect(dbCalls.filter((call) => call.method === 'insert')).toHaveLength(0);
  });

  it('revokes the previous credential and inserts the sealed one in one transaction', async () => {
    dbQueue.push([{ id: DOMAIN_ID }]); // domain lookup
    dbQueue.push([]); // update (revoke previous)
    dbQueue.push([{ id: 'credential-1' }]); // insert returning

    const result = await saveCredentialAction(VALID_INPUT);

    expect(result).toEqual({ success: true, data: { id: 'credential-1' } });

    const values = dbCalls.find((call) => call.method === 'values')?.args[0] as
      Record<string, unknown> | undefined;

    expect(values).toMatchObject({
      domainId: DOMAIN_ID,
      userId: 'user-1',
      label: 'Production',
      kind: 'basic',
      ciphertext: 'sealed-blob',
      keyVersion: 1,
    });
    // The plaintext must never reach the row.
    expect(JSON.stringify(values)).not.toContain('hunter2');

    const { audit } = await import('@/lib/audit');
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'scan_credential.created', targetId: 'credential-1' }),
    );
  });

  it('reports missing encryption configuration as storage trouble, not a bad credential', async () => {
    const { CredentialUnavailableError, sealCredential } = await import('@/lib/credentials/store');
    vi.mocked(sealCredential).mockImplementationOnce(() => {
      throw new CredentialUnavailableError('no key', 'keyring_unconfigured');
    });

    dbQueue.push([{ id: DOMAIN_ID }]);

    const result = await saveCredentialAction(VALID_INPUT);

    expect(result).toEqual({ success: false, error: 'storage_unavailable' });
    expect(dbCalls.filter((call) => call.method === 'transaction')).toHaveLength(0);
  });

  it('reports storage trouble when the insert returns no row', async () => {
    dbQueue.push([{ id: DOMAIN_ID }]);
    dbQueue.push([]);
    dbQueue.push([]);

    const result = await saveCredentialAction(VALID_INPUT);

    expect(result).toEqual({ success: false, error: 'storage_unavailable' });
  });
});

describe('revokeCredentialAction', () => {
  it('cannot revoke a credential that is not the caller’s', async () => {
    dbQueue.push([]);

    const result = await revokeCredentialAction('credential-from-another-account');

    expect(result).toEqual({ success: false, error: 'credential_not_found' });

    const { audit } = await import('@/lib/audit');
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it('soft-revokes and audits', async () => {
    dbQueue.push([{ id: 'credential-1' }]);

    const result = await revokeCredentialAction('credential-1');

    expect(result).toEqual({ success: true, data: null });

    const set = dbCalls.find((call) => call.method === 'set')?.args[0] as
      Record<string, unknown> | undefined;
    expect(set?.revokedAt).toBeInstanceOf(Date);

    const { audit } = await import('@/lib/audit');
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'scan_credential.revoked', targetId: 'credential-1' }),
    );
  });
});

describe('listCredentialsAction', () => {
  it('returns what the store returns, scoped to the caller', async () => {
    const { listActiveCredentials } = await import('@/lib/credentials/store');
    vi.mocked(listActiveCredentials).mockResolvedValueOnce([
      {
        id: 'credential-1',
        domainId: DOMAIN_ID,
        hostname: 'example.com',
        label: 'Production',
        kind: 'basic',
        lastUsedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const result = await listCredentialsAction();

    expect(result.success).toBe(true);
    expect(vi.mocked(listActiveCredentials)).toHaveBeenCalledWith('user-1');
  });
});
