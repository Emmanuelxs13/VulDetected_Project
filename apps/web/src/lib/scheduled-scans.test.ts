import { beforeEach, describe, expect, it, vi } from 'vitest';

import { enqueueScanForDomain } from '@/features/scans/enqueue';
import { dbCalls, dbQueue, resetDbMock } from '@test/db-mock';

import { runDueSchedules } from './scheduled-scans';

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

vi.mock('@/features/scans/enqueue', () => ({
  enqueueScanForDomain: vi.fn(async () => ({ ok: true, scanId: 'scan-1' })),
  scheduleTarget: vi.fn((hostname: string) => ({
    url: `https://${hostname}`,
    scheme: 'https',
    host: hostname,
    port: 443,
    baseUrl: `https://${hostname}`,
  })),
}));

const NOW = new Date('2026-01-02T00:00:00.000Z');

const ROW = {
  id: 'schedule-1',
  domainId: 'domain-1',
  userId: 'user-1',
  interval: 'daily',
  enabled: true,
  nextRunAt: new Date('2026-01-01T00:00:00.000Z'),
  hostname: 'example.com',
  verified: true,
};

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

describe('runDueSchedules', () => {
  it('claims a due schedule, advances its clock and enqueues one scan', async () => {
    dbQueue.push([ROW]); // due rows
    dbQueue.push([{ id: ROW.id }]); // claim

    const result = await runDueSchedules(NOW);

    expect(result).toEqual({ due: 1, enqueued: 1, failed: 0, skipped: 0 });

    const set = dbCalls.find((call) => call.method === 'set')?.args[0] as
      Record<string, unknown> | undefined;

    expect(set?.lastRunAt).toEqual(NOW);
    // Daily interval, calculated from the tick instant and not from the old one:
    // a runner that was down for a week must not replay the missed days.
    expect(set?.nextRunAt).toEqual(new Date('2026-01-03T00:00:00.000Z'));

    expect(vi.mocked(enqueueScanForDomain)).toHaveBeenCalledWith({
      domainId: ROW.domainId,
      target: expect.objectContaining({ host: ROW.hostname, scheme: 'https', port: 443 }),
      actorUserId: ROW.userId,
      source: 'schedule',
    });
  });

  it('does not fire a row that is no longer due', async () => {
    dbQueue.push([{ ...ROW, nextRunAt: new Date('2026-02-01T00:00:00.000Z') }]);

    const result = await runDueSchedules(NOW);

    expect(result).toEqual({ due: 1, enqueued: 0, failed: 0, skipped: 1 });
    expect(dbCalls.filter((call) => call.method === 'update')).toHaveLength(0);
    expect(vi.mocked(enqueueScanForDomain)).not.toHaveBeenCalled();
  });

  it('does not fire a disabled row', async () => {
    dbQueue.push([{ ...ROW, enabled: false }]);

    const result = await runDueSchedules(NOW);

    expect(result.skipped).toBe(1);
    expect(vi.mocked(enqueueScanForDomain)).not.toHaveBeenCalled();
  });

  it('claims an unverified domain so it cannot starve the queue, but does not scan it', async () => {
    dbQueue.push([{ ...ROW, verified: false }]);
    dbQueue.push([{ id: ROW.id }]);

    const result = await runDueSchedules(NOW);

    expect(result).toEqual({ due: 1, enqueued: 0, failed: 0, skipped: 1 });
    // Claimed: its clock moved forward even though no scan was queued.
    expect(dbCalls.filter((call) => call.method === 'update')).toHaveLength(1);
    expect(vi.mocked(enqueueScanForDomain)).not.toHaveBeenCalled();
  });

  it('skips a row another overlapping pass already claimed', async () => {
    dbQueue.push([ROW]);
    dbQueue.push([]); // claim matched zero rows

    const result = await runDueSchedules(NOW);

    expect(result).toEqual({ due: 1, enqueued: 0, failed: 0, skipped: 1 });
    expect(vi.mocked(enqueueScanForDomain)).not.toHaveBeenCalled();
  });

  it('counts a refused enqueue as failed without rolling the claim back', async () => {
    vi.mocked(enqueueScanForDomain).mockResolvedValueOnce({
      ok: false,
      error: 'monthly_scan_limit',
    });

    dbQueue.push([ROW]);
    dbQueue.push([{ id: ROW.id }]);

    const result = await runDueSchedules(NOW);

    expect(result).toEqual({ due: 1, enqueued: 0, failed: 1, skipped: 0 });
    // The claim stands: one missed run is visible, a burst on recovery is not.
    expect(dbCalls.filter((call) => call.method === 'set')).toHaveLength(1);
  });
});
