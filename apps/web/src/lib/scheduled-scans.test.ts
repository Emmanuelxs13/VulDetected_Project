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
  /**
   * Faithful stand-in for the real helper. The real implementation is tested in
   * `enqueue.test.ts`; here it only has to behave like it, because this suite is
   * about the runner's claim/enqueue ordering.
   */
  scheduleTargetFor: vi.fn((hostname: string, storedTargetUrl: string | null) =>
    storedTargetUrl === null
      ? {
          url: `https://${hostname}`,
          scheme: 'https',
          host: hostname,
          port: 443,
          baseUrl: `https://${hostname}`,
        }
      : {
          url: storedTargetUrl,
          scheme: 'http',
          host: hostname,
          port: 8099,
          baseUrl: storedTargetUrl,
        },
  ),
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
  targetUrl: null,
};

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

describe('runDueSchedules', () => {
  it('claims a due schedule, advances its clock and enqueues one scan', async () => {
    dbQueue.push([ROW]); // due rows
    dbQueue.push([{ id: ROW.id }]); // claim
    dbQueue.push([]); // no scan currently active for this domain

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
    dbQueue.push([]); // no active scan

    const result = await runDueSchedules(NOW);

    expect(result).toEqual({ due: 1, enqueued: 0, failed: 1, skipped: 0 });
    // The claim stands: one missed run is visible, a burst on recovery is not.
    expect(dbCalls.filter((call) => call.method === 'set')).toHaveLength(1);
  });

  it('Sprint 2 CA-23: skips the window when a scan for the same domain is still active', async () => {
    dbQueue.push([ROW]); // due rows
    dbQueue.push([{ id: ROW.id }]); // claim
    dbQueue.push([{ id: 'scan-active' }]); // an active scan already exists

    const result = await runDueSchedules(NOW);

    expect(result).toEqual({ due: 1, enqueued: 0, failed: 0, skipped: 1 });
    expect(vi.mocked(enqueueScanForDomain)).not.toHaveBeenCalled();
  });

  it('Sprint 2 CA-23: a missed window collapses to one run instead of replaying', async () => {
    // The row was due three days ago; the runner just came back.
    dbQueue.push([{ ...ROW, nextRunAt: new Date('2025-12-30T00:00:00.000Z') }]);
    dbQueue.push([{ id: ROW.id }]);
    dbQueue.push([]);

    const result = await runDueSchedules(NOW);

    expect(result.enqueued).toBe(1);
    const set = dbCalls.find((call) => call.method === 'set')?.args[0] as
      | Record<string, unknown>
      | undefined;
    // Next run is one interval after NOW, not three days of catch-up.
    expect(set?.nextRunAt).toEqual(new Date('2026-01-03T00:00:00.000Z'));
  });

  it('scans the target the schedule recorded instead of assuming HTTPS 443', async () => {
    dbQueue.push([{ ...ROW, targetUrl: 'http://example.com:8099' }]);
    dbQueue.push([{ id: ROW.id }]);
    dbQueue.push([]); // no active scan

    await runDueSchedules(NOW);

    expect(vi.mocked(enqueueScanForDomain)).toHaveBeenCalledWith({
      domainId: ROW.domainId,
      target: expect.objectContaining({ baseUrl: 'http://example.com:8099', port: 8099 }),
      actorUserId: ROW.userId,
      source: 'schedule',
    });
  });
});
