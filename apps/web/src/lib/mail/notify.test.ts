import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dbQueue, resetDbMock } from '@test/db-mock';

import { alertsEnabledForScan, type ScanMailContext } from './notify';

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

const BASE: ScanMailContext = {
  scanId: 'scan-1',
  domainId: 'domain-1',
  source: 'schedule',
  targetUrl: 'http://127-0-0-1.nip.io:8099',
  hostname: '127-0-0-1.nip.io',
  userEmail: 'demo.pro@vuldetected.local',
  locale: 'es',
};

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

describe('Sprint 2 · HU-07 · CA-25 — the per-schedule alert switch', () => {
  it('CA-25: a manual scan always alerts, because the user just asked for it', async () => {
    const enabled = await alertsEnabledForScan({ ...BASE, source: 'manual' });

    expect(enabled).toBe(true);
  });

  it('CA-25: a scheduled scan alerts when the schedule keeps the default', async () => {
    dbQueue.push([{ alertOnNewCritical: true }]);

    expect(await alertsEnabledForScan(BASE)).toBe(true);
  });

  it('CA-25: a scheduled scan stays silent when the schedule muted alerts', async () => {
    dbQueue.push([{ alertOnNewCritical: false }]);

    expect(await alertsEnabledForScan(BASE)).toBe(false);
  });

  it('CA-25: a schedule row that disappeared defaults to alerting, not to silence', async () => {
    dbQueue.push([]);

    expect(await alertsEnabledForScan(BASE)).toBe(true);
  });
});
