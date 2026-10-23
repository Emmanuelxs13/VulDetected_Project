import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dbCalls, dbQueue, resetDbMock } from '@test/db-mock';

import { DomainNotVerifiedError, requireVerifiedDomain } from './guard';

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

describe('requireVerifiedDomain', () => {
  it('returns the domain when a verified row exists for the user', async () => {
    dbQueue.push([{ id: 'domain-1' }]);

    await expect(requireVerifiedDomain('user-1', 'Example.com')).resolves.toEqual({
      domainId: 'domain-1',
      normalizedHostname: 'example.com',
    });
  });

  it('throws when no verified row matches (DO-5)', async () => {
    dbQueue.push([]);

    await expect(requireVerifiedDomain('user-1', 'example.com')).rejects.toBeInstanceOf(
      DomainNotVerifiedError,
    );
  });

  it('throws for an unparseable hostname without querying the database', async () => {
    await expect(requireVerifiedDomain('user-1', 'https://example.com')).rejects.toBeInstanceOf(
      DomainNotVerifiedError,
    );
    expect(dbCalls).toHaveLength(0);
  });
});
