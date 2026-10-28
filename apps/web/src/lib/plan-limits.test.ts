import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dbQueue, resetDbMock } from '@test/db-mock';

import {
  checkDomainAllowance,
  checkScanAllowance,
  checkScheduleAllowance,
  readPlanUsage,
  startOfMonthUtc,
} from './plan-limits';

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

/**
 * Usage counters, in the order `readPlanUsage` builds its four chains: domains,
 * scans this month, active scans, schedules.
 */
function pushUsage(input: {
  domains: number;
  monthly: number;
  active: number;
  schedules: number;
}): void {
  dbQueue.push([{ value: input.domains }]);
  dbQueue.push([{ value: input.monthly }]);
  dbQueue.push([{ value: input.active }]);
  dbQueue.push([{ value: input.schedules }]);
}

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

describe('startOfMonthUtc', () => {
  it('returns the first instant of the month in UTC, not local time', () => {
    expect(startOfMonthUtc(new Date('2026-03-17T23:59:59.000Z')).toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );
  });
});

describe('readPlanUsage', () => {
  it('reports all four counters as numbers', async () => {
    pushUsage({ domains: 3, monthly: 12, active: 1, schedules: 2 });

    await expect(readPlanUsage('user-1')).resolves.toEqual({
      domains: 3,
      scansThisMonth: 12,
      activeScans: 1,
      schedules: 2,
    });
  });
});

describe('checkScanAllowance', () => {
  it('refuses when the account is already at its concurrency ceiling', async () => {
    dbQueue.push([{ subscriptionPlan: 'free' }]);
    pushUsage({ domains: 1, monthly: 5, active: 2, schedules: 0 });

    await expect(checkScanAllowance('user-1')).resolves.toBe('concurrent_scan_limit');
  });

  it('refuses when the monthly allowance is used up', async () => {
    dbQueue.push([{ subscriptionPlan: 'free' }]);
    pushUsage({ domains: 1, monthly: 60, active: 0, schedules: 0 });

    await expect(checkScanAllowance('user-1')).resolves.toBe('monthly_scan_limit');
  });

  it('allows the scan when both ceilings still have room', async () => {
    dbQueue.push([{ subscriptionPlan: 'pro' }]);
    pushUsage({ domains: 4, monthly: 399, active: 4, schedules: 0 });

    await expect(checkScanAllowance('user-1')).resolves.toBeNull();
  });

  it('treats a null monthly cap as unlimited', async () => {
    dbQueue.push([{ subscriptionPlan: 'business' }]);
    pushUsage({ domains: 40, monthly: 100_000, active: 14, schedules: 0 });

    await expect(checkScanAllowance('user-1')).resolves.toBeNull();
  });

  it('falls back to the Free plan when the user row is missing', async () => {
    dbQueue.push([]);
    pushUsage({ domains: 0, monthly: 0, active: 2, schedules: 0 });

    await expect(checkScanAllowance('user-1')).resolves.toBe('concurrent_scan_limit');
  });
});

describe('checkDomainAllowance', () => {
  it('refuses a new hostname at the cap', async () => {
    dbQueue.push([
      { subscriptionPlan: 'free', domainCount: 3, alreadyOwned: 0, ownedByAnotherAccount: 0 },
    ]);

    await expect(checkDomainAllowance('user-1', 'new.example.com')).resolves.toBe('domain_limit');
  });

  it('lets the owner re-verify a domain they already own', async () => {
    dbQueue.push([
      { subscriptionPlan: 'free', domainCount: 3, alreadyOwned: 1, ownedByAnotherAccount: 0 },
    ]);

    await expect(checkDomainAllowance('user-1', 'example.com')).resolves.toBeNull();
  });

  it('does not blame the plan for a hostname another account owns', async () => {
    dbQueue.push([
      { subscriptionPlan: 'free', domainCount: 3, alreadyOwned: 0, ownedByAnotherAccount: 1 },
    ]);

    await expect(checkDomainAllowance('user-1', 'taken.example.com')).resolves.toBeNull();
  });
});

describe('checkScheduleAllowance', () => {
  it('refuses one more schedule at the cap', async () => {
    dbQueue.push([{ subscriptionPlan: 'free' }]);
    pushUsage({ domains: 1, monthly: 0, active: 0, schedules: 1 });

    await expect(checkScheduleAllowance('user-1')).resolves.toBe('schedule_limit');
  });
});
