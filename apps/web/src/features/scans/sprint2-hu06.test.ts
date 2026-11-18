/**
 * Sprint 2 · HU-06 (SCRUM-19) — cancelling a scan and the confirmation mail.
 *
 * ## What these tests own
 *
 * The decision logic: which scans may be cancelled, that the worker is told, and
 * that the user gets a cancellation email. The wall-clock guarantee — the worker
 * stopping in under ten seconds — cannot be proven here; it is measured in the
 * running system and recorded in `PRUEBA_SPRINT_2.md` (CA-21).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireUser } from '@/features/auth/session';
import { notifyScanCancelled } from '@/lib/mail/notify';
import { requestScanCancellation } from '@/lib/scan-cancellation';
import { dbCalls, dbQueue, resetDbMock } from '@test/db-mock';

import { cancelScanAction } from './actions';

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

vi.mock('@/features/auth/session', () => ({
  requireUser: vi.fn(async () => ({ session: { user: { id: 'user-1' } }, userId: 'user-1' })),
}));

vi.mock('@/lib/scan-cancellation', () => ({
  requestScanCancellation: vi.fn(async () => true),
}));

vi.mock('@/lib/mail/notify', () => ({
  notifyScanCancelled: vi.fn(async () => undefined),
  notifyScanCompleted: vi.fn(async () => undefined),
}));

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

describe('Sprint 2 · HU-06 · CA-20 — cancellation is allowed while queued or running', () => {
  it('CA-20: cancels a queued scan and returns success', async () => {
    dbQueue.push([{ id: 'scan-1' }]); // ownership + active-state lookup
    dbQueue.push([{ id: 'scan-1' }]); // the status update returning the row

    const result = await cancelScanAction('scan-1');

    expect(result).toEqual({ success: true, data: null });
  });

  it('CA-20: cancels a running scan and returns success', async () => {
    // The query itself is what restricts the states to queued/running; a row
    // coming back means the scan was in one of them. This asserts the action
    // does not add a second, stricter guard that would refuse a running scan.
    dbQueue.push([{ id: 'scan-1' }]);
    dbQueue.push([{ id: 'scan-1' }]);

    const result = await cancelScanAction('scan-1');

    expect(result.success).toBe(true);
  });

  it('CA-20: refuses a scan that already reached a terminal state', async () => {
    dbQueue.push([]); // not found among queued/running scans

    const result = await cancelScanAction('scan-1');

    expect(result).toEqual({ success: false, error: 'scan_not_cancellable' });
    expect(vi.mocked(requestScanCancellation)).not.toHaveBeenCalled();
  });

  it('CA-20: refuses when the scan exists but the conditional update matched nothing', async () => {
    dbQueue.push([{ id: 'scan-1' }]);
    dbQueue.push([]); // the row finished between the read and the update

    const result = await cancelScanAction('scan-1');

    expect(result).toEqual({ success: false, error: 'scan_not_cancellable' });
  });
});

describe('Sprint 2 · HU-06 · CA-21 — the worker is told to stop', () => {
  it('CA-21: publishes the cancellation flag for the running worker', async () => {
    dbQueue.push([{ id: 'scan-1' }]);
    dbQueue.push([{ id: 'scan-1' }]);

    await cancelScanAction('scan-1');

    expect(vi.mocked(requestScanCancellation)).toHaveBeenCalledWith('scan-1');
  });

  it('CA-21: a Redis outage does not fail a cancellation the user already got', async () => {
    vi.mocked(requestScanCancellation).mockResolvedValueOnce(false);
    dbQueue.push([{ id: 'scan-1' }]);
    dbQueue.push([{ id: 'scan-1' }]);

    const result = await cancelScanAction('scan-1');

    expect(result.success).toBe(true);
  });
});

describe('Sprint 2 · HU-06 · CA-12 — cancellation mail', () => {
  it('CA-12: queues the cancellation email once, for this scan', async () => {
    dbQueue.push([{ id: 'scan-1' }]);
    dbQueue.push([{ id: 'scan-1' }]);

    await cancelScanAction('scan-1');

    expect(vi.mocked(notifyScanCancelled)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyScanCancelled)).toHaveBeenCalledWith('scan-1');
  });

  it('CA-12: a mail failure does not undo the cancellation', async () => {
    vi.mocked(notifyScanCancelled).mockRejectedValueOnce(new Error('smtp down'));
    dbQueue.push([{ id: 'scan-1' }]);
    dbQueue.push([{ id: 'scan-1' }]);

    const result = await cancelScanAction('scan-1');

    expect(result.success).toBe(true);
    // The status update still ran before the mail attempt.
    expect(dbCalls.filter((call) => call.method === 'set')).toHaveLength(1);
  });
});

describe('Sprint 2 · HU-06 · CA-12 — the cancellation template', () => {
  it('CA-12: renders a message that says results are kept and marked partial', async () => {
    const { renderMail } = await import('@/lib/mail/templates');

    const rendered = renderMail('scan_cancelled', 'es', {
      hostname: 'example.com',
      scanUrl: 'https://app.example.com/scans/scan-1',
    });

    expect(rendered.subject).toContain('example.com');
    expect(rendered.text).toContain('parcial');
    expect(rendered.text).toContain('https://app.example.com/scans/scan-1');
  });
});

describe('Sprint 2 · HU-06 · CA-12 — session guard', () => {
  it('CA-12: a request without a session is refused before any write', async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(cancelScanAction('scan-1')).rejects.toThrow('Unauthorized');
    expect(dbCalls.filter((call) => call.method === 'update')).toHaveLength(0);
  });
});
