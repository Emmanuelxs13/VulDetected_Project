import 'server-only';

import {
  and,
  eq,
  lt,
  lte,
  mailOutbox,
  sql,
} from '@vuldetected/db';

import { db } from '@/lib/db';

import { getMailSender, type MailSender, type OutgoingMail } from './transport';

/**
 * Durable outgoing mail: enqueue now, deliver later, retry with backoff.
 *
 * ## Why a table instead of sending inline
 *
 * `sendVerificationEmail` and the scan-finished notices run inside request
 * handlers. An SMTP round trip there makes registration latency depend on a
 * third party, and any outage turns "the mail server blinked" into "the user
 * could not register". The row is the durable part; the send is retried until it
 * succeeds or the retry budget runs out, and an operator can see exactly what is
 * stuck.
 *
 * ## At-least-once, never at-most-once
 *
 * A claim increments `attempts` and moves the row to `sending` in one guarded
 * UPDATE, so two dispatchers cannot both send the same row. If the process dies
 * between claim and send, the row is reclaimed after the lease and sent again:
 * the user may receive a duplicate, which is the right side to err on for a
 * verification link.
 */

/** Give up after this many attempts. With the backoff below that is under a day. */
export const MAX_MAIL_ATTEMPTS = 8;

/** How long a claimed row stays invisible to other dispatchers before reclaim. */
export const MAIL_LEASE_MS = 5 * 60 * 1000;

const BASE_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

/** Long enough to diagnose, short enough that a support query stays readable. */
const MAX_ERROR_LENGTH = 500;

/**
 * Exponential backoff, capped.
 *
 * `attempts` is the count AFTER the attempt that just failed, so the first retry
 * waits one minute and the sequence stays inside an hour per try. Jitter is
 * deliberately absent: with one dispatcher per deployment there is no thundering
 * herd to spread out, and a deterministic delay is what makes the tests exact.
 */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
}

/**
 * A short, single-line description of a delivery failure.
 *
 * `String(error)` on a nodemailer failure can carry the full SMTP dialogue. It
 * does not contain the AUTH password (Node's client never echoes it), but it can
 * contain the recipient and provider hints, so the value is collapsed and
 * truncated before it ever reaches the database.
 */
export function describeMailError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : null;
  const message = error instanceof Error ? error.message : String(error);
  const compact = `${code ? `${code}: ` : ''}${message}`.replace(/\s+/g, ' ').trim();
  return compact.length > MAX_ERROR_LENGTH ? `${compact.slice(0, MAX_ERROR_LENGTH - 1)}…` : compact;
}

export interface EnqueueMailInput {
  to: string;
  template: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Accepts a message for delivery and returns the outbox row id.
 *
 * The rendered subject and bodies are stored, not the inputs that produced
 * them: a template change tomorrow must not rewrite a message a user received
 * today, and a support question is answered by the bytes that were queued.
 */
export async function enqueueMail(input: EnqueueMailInput): Promise<string> {
  const inserted = await db()
    .insert(mailOutbox)
    .values({
      toEmail: input.to.trim().toLowerCase(),
      template: input.template,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })
    .returning({ id: mailOutbox.id });

  const id = inserted[0]?.id;
  if (id === undefined) {
    throw new Error('The mail outbox did not return the row it inserted.');
  }

  return id;
}

export interface DeliveryReport {
  /** Rows that were actually attempted in this run. */
  claimed: number;
  sent: number;
  /** Attempts that failed (and were requeued or given up). */
  failed: number;
  /** Rows put back to `pending` because their lease expired. */
  reclaimed: number;
}

export interface DeliverOptions {
  limit?: number;
  sender?: MailSender;
  now?: Date;
}

/**
 * One dispatcher pass: reclaim abandoned leases, claim due rows, send, record.
 *
 * Bounded by `limit` because a dispatcher is normally invoked by a cron with a
 * request timeout; draining an unbounded backlog in one call is how a cron job
 * turns into a timeout that reports nothing.
 */
export async function deliverDueMail(options: DeliverOptions = {}): Promise<DeliveryReport> {
  const limit = options.limit ?? 25;
  const sender = options.sender ?? getMailSender();
  const now = options.now ?? new Date();

  /**
   * Reclaim first. A row left in `sending` past its lease means the dispatcher
   * that claimed it died; without this step those rows would be invisible
   * forever and the user would simply never receive the mail.
   */
  const reclaimed = await db()
    .update(mailOutbox)
    .set({ status: 'pending' })
    .where(and(eq(mailOutbox.status, 'sending'), lt(mailOutbox.nextAttemptAt, now)))
    .returning({ id: mailOutbox.id });

  const due = await db()
    .select({ id: mailOutbox.id })
    .from(mailOutbox)
    .where(and(eq(mailOutbox.status, 'pending'), lte(mailOutbox.nextAttemptAt, now)))
    .orderBy(mailOutbox.nextAttemptAt)
    .limit(limit);

  const report: DeliveryReport = {
    claimed: 0,
    sent: 0,
    failed: 0,
    reclaimed: reclaimed.length,
  };

  for (const candidate of due) {
    /**
     * The claim is the guard that makes concurrent dispatchers safe: `status =
     * 'pending'` in the WHERE means the second dispatcher's UPDATE matches zero
     * rows and its `returning()` is empty, so it skips the send.
     */
    const claimed = await db()
      .update(mailOutbox)
      .set({
        status: 'sending',
        attempts: sql`${mailOutbox.attempts} + 1`,
        nextAttemptAt: new Date(now.getTime() + MAIL_LEASE_MS),
      })
      .where(and(eq(mailOutbox.id, candidate.id), eq(mailOutbox.status, 'pending')))
      .returning({
        id: mailOutbox.id,
        toEmail: mailOutbox.toEmail,
        subject: mailOutbox.subject,
        html: mailOutbox.html,
        text: mailOutbox.text,
        attempts: mailOutbox.attempts,
      });

    const row = claimed[0];
    if (row === undefined) {
      continue;
    }

    report.claimed += 1;

    const message: OutgoingMail = {
      to: row.toEmail,
      subject: row.subject,
      html: row.html,
      text: row.text,
    };

    try {
      await sender(message);
      await db()
        .update(mailOutbox)
        .set({ status: 'sent', sentAt: now, lastError: null })
        .where(eq(mailOutbox.id, row.id));
      report.sent += 1;
    } catch (error) {
      report.failed += 1;
      const exhausted = row.attempts >= MAX_MAIL_ATTEMPTS;

      /**
       * A failed attempt is not deleted and not retried forever. `failed` is a
       * terminal state an operator can query, and the row keeps the last error
       * so "why did this user never get the email?" has an answer.
       */
      await db()
        .update(mailOutbox)
        .set({
          status: exhausted ? 'failed' : 'pending',
          lastError: describeMailError(error),
          nextAttemptAt: exhausted
            ? new Date(now.getTime() + MAX_BACKOFF_MS)
            : new Date(now.getTime() + retryDelayMs(row.attempts)),
        })
        .where(eq(mailOutbox.id, row.id));
    }
  }

  return report;
}

/** Types the reader of an outbox row needs. Re-exported to avoid a deep import. */
export type { MailOutboxRow } from '@vuldetected/db';
