import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dbCalls, dbQueue, resetDbMock } from '@test/db-mock';

import {
  describeMailError,
  deliverDueMail,
  enqueueMail,
  MAIL_LEASE_MS,
  MAX_MAIL_ATTEMPTS,
  retryDelayMs,
} from './outbox';

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

/**
 * A dispatcher pass builds its chains in a fixed order, so the canned results
 * are pushed in that order:
 *
 *   1. reclaim expired leases  -> rows returned
 *   2. select due rows         -> `{ id }` per row
 *   3. per row: claim          -> the claimed row (empty means another
 *                                 dispatcher won the race)
 *   4. per row: mark sent      -> ignored
 */
function pushPass(input: {
  reclaimed?: number;
  due?: string[];
  claims?: Array<Record<string, unknown> | null>;
}): void {
  const reclaimed = input.reclaimed ?? 0;
  dbQueue.push(Array.from({ length: reclaimed }, (_, index) => ({ id: `reclaimed-${index}` })));
  dbQueue.push((input.due ?? []).map((id) => ({ id })));

  for (const claim of input.claims ?? []) {
    dbQueue.push(claim === null ? [] : [claim]);
    // The "mark sent" / "requeue" update that follows a claimed row.
    dbQueue.push([]);
  }
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'mail-1',
  toEmail: 'user@example.com',
  subject: 'Confirm your email',
  html: '<p>hi</p>',
  text: 'hi',
  attempts: 1,
  ...overrides,
});

function lastSetPayload(): Record<string, unknown> {
  const sets = dbCalls.filter((call) => call.method === 'set');
  const last = sets[sets.length - 1];
  expect(last).toBeDefined();
  return last?.args[0] as Record<string, unknown>;
}

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
});

describe('retryDelayMs', () => {
  it('waits a minute after the first failed attempt', () => {
    expect(retryDelayMs(1)).toBe(60_000);
  });

  it('doubles the wait on every later attempt', () => {
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(3)).toBe(240_000);
    expect(retryDelayMs(4)).toBe(480_000);
  });

  it('caps the wait at an hour', () => {
    expect(retryDelayMs(20)).toBe(3_600_000);
    expect(retryDelayMs(Number.MAX_SAFE_INTEGER)).toBe(3_600_000);
  });

  it('never returns a negative or zero delay for a nonsense attempt count', () => {
    expect(retryDelayMs(0)).toBe(60_000);
    expect(retryDelayMs(-5)).toBe(60_000);
  });
});

describe('describeMailError', () => {
  it('keeps the SMTP code, which is the part an operator greps for', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1025'), {
      code: 'ECONNECTION',
    });

    expect(describeMailError(error)).toBe('ECONNECTION: connect ECONNREFUSED 127.0.0.1:1025');
  });

  it('collapses a multi-line SMTP dialogue into one line', () => {
    const description = describeMailError(
      new Error('550 5.1.1 mailbox unavailable\n\n  >>> RCPT TO:<a@b.example>\n'),
    );

    expect(description).not.toContain('\n');
    expect(description).toBe('550 5.1.1 mailbox unavailable >>> RCPT TO:<a@b.example>');
  });

  it('truncates a long description instead of storing a stack trace', () => {
    const description = describeMailError(new Error('x'.repeat(2000)));

    expect(description.length).toBe(500);
    expect(description.endsWith('…')).toBe(true);
  });

  it('survives a thrown non-error', () => {
    expect(describeMailError('plain string')).toBe('plain string');
  });
});

describe('enqueueMail', () => {
  it('stores the rendered bytes and returns the row id', async () => {
    dbQueue.push([{ id: 'mail-row-id' }]);

    await expect(
      enqueueMail({
        to: '  User@Example.COM ',
        template: 'verify_email',
        subject: 'Confirm',
        html: '<p>hi</p>',
        text: 'hi',
      }),
    ).resolves.toBe('mail-row-id');

    const values = dbCalls.find((call) => call.method === 'values')?.args[0] as Record<
      string,
      unknown
    >;
    expect(values).toMatchObject({
      toEmail: 'user@example.com',
      template: 'verify_email',
      subject: 'Confirm',
      html: '<p>hi</p>',
      text: 'hi',
    });
  });

  it('fails loudly when the insert returns no id', async () => {
    dbQueue.push([]);

    await expect(
      enqueueMail({ to: 'a@b.example', template: 't', subject: 's', html: 'h', text: 't' }),
    ).rejects.toThrow(/did not return the row/i);
  });
});

describe('deliverDueMail', () => {
  it('reports nothing to do when the outbox is empty', async () => {
    pushPass({});

    const report = await deliverDueMail({ sender: async () => {} });

    expect(report).toEqual({ claimed: 0, sent: 0, failed: 0, reclaimed: 0 });
  });

  it('claims a due row, sends it, and marks it sent', async () => {
    pushPass({ due: ['mail-1'], claims: [row()] });
    const sender = vi.fn(async () => {});

    const report = await deliverDueMail({ sender, now: new Date('2026-01-01T00:00:00.000Z') });

    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Confirm your email',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(report).toEqual({ claimed: 1, sent: 1, failed: 0, reclaimed: 0 });
    expect(lastSetPayload()).toMatchObject({ status: 'sent', lastError: null });
  });

  it('holds the row for a lease while it is being sent', async () => {
    pushPass({ due: ['mail-1'], claims: [row()] });
    const now = new Date('2026-01-01T00:00:00.000Z');

    await deliverDueMail({ sender: async () => {}, now });

    // Set #1 is the reclaim pass; set #2 is the claim itself.
    const claim = dbCalls.filter((call) => call.method === 'set')[1]?.args[0] as Record<
      string,
      unknown
    >;
    expect(claim).toMatchObject({ status: 'sending' });
    const lease = claim.nextAttemptAt as Date;
    expect(lease.getTime() - now.getTime()).toBe(MAIL_LEASE_MS);
  });

  it('requeues a failed send with backoff and the reason', async () => {
    pushPass({ due: ['mail-1'], claims: [row({ attempts: 2 })] });
    const sender = vi.fn(async () => {
      throw Object.assign(new Error('connection refused'), { code: 'ECONNECTION' });
    });

    const report = await deliverDueMail({
      sender,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(report).toEqual({ claimed: 1, sent: 0, failed: 1, reclaimed: 0 });

    const payload = lastSetPayload();
    expect(payload.status).toBe('pending');
    expect(payload.lastError).toBe('ECONNECTION: connection refused');
    // Two attempts recorded means the next wait is the second step of the curve.
    expect((payload.nextAttemptAt as Date).toISOString()).toBe('2026-01-01T00:02:00.000Z');
  });

  it('gives up once the attempt budget is spent instead of retrying forever', async () => {
    pushPass({ due: ['mail-1'], claims: [row({ attempts: MAX_MAIL_ATTEMPTS })] });

    const report = await deliverDueMail({
      sender: async () => {
        throw new Error('still down');
      },
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(report.failed).toBe(1);
    expect(lastSetPayload()).toMatchObject({ status: 'failed', lastError: 'still down' });
  });

  it('skips a row another dispatcher claimed first', async () => {
    pushPass({ due: ['mail-1'], claims: [null] });
    const sender = vi.fn(async () => {});

    const report = await deliverDueMail({ sender });

    expect(sender).not.toHaveBeenCalled();
    expect(report).toEqual({ claimed: 0, sent: 0, failed: 0, reclaimed: 0 });
  });

  it('reclaims leases left behind by a crashed dispatcher', async () => {
    pushPass({ reclaimed: 2, due: [], claims: [] });

    const report = await deliverDueMail({ sender: async () => {} });

    expect(report.reclaimed).toBe(2);
    const reclaim = dbCalls.find((call) => call.method === 'set')?.args[0] as Record<
      string,
      unknown
    >;
    expect(reclaim).toMatchObject({ status: 'pending' });
  });

  it('bounds one pass so a cron cannot run past its own timeout', async () => {
    pushPass({
      due: ['a', 'b'],
      claims: [row({ id: 'a' }), row({ id: 'b' })],
    });

    await deliverDueMail({ sender: async () => {}, limit: 2 });

    const limits = dbCalls.filter((call) => call.method === 'limit');
    expect(limits.length).toBe(1);
    expect(limits[0]?.args[0]).toBe(2);
  });

  it('keeps sending the remaining rows after one address fails', async () => {
    pushPass({ due: ['a', 'b'], claims: [row({ id: 'a' }), row({ id: 'b' })] });
    const sender = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error('mailbox full'))
      .mockResolvedValueOnce(undefined);

    const report = await deliverDueMail({ sender });

    expect(sender).toHaveBeenCalledTimes(2);
    expect(report).toEqual({ claimed: 2, sent: 1, failed: 1, reclaimed: 0 });
  });
});
