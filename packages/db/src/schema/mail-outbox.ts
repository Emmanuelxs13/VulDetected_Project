import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { mailStatusEnum } from './enums';

/**
 * `mail_outbox` — durable, retryable outgoing mail.
 *
 * ## WHY A ROW AND NOT A FIRE-AND-FORGET SMTP CALL
 *
 * Registration confirmation, scan-finished notices and new-critical alerts are
 * all sent from request handlers that must stay fast and must not fail because
 * the mail server is briefly unavailable. Writing the message to a table first
 * turns "SMTP was down for two minutes" into a delayed email instead of a lost
 * one, and gives an operator something to inspect.
 *
 * The message is rendered BEFORE it is stored: the row holds the final subject
 * and bodies, so a later template change cannot rewrite a message that was
 * already accepted. `template` is kept for grouping and debugging only.
 *
 * ## RETRY SEMANTICS
 *
 * `attempts` counts deliveries actually attempted; `next_attempt_at` is the
 * backoff clock. The runner claims rows with an atomic UPDATE, so two processes
 * cannot both send the same row. Bounded retries, then `failed` — a message
 * that cannot be delivered in a day must stop being retried, not fill the table.
 */
export const mailOutbox = pgTable(
  'mail_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Recipient address as accepted by the mail flow. Never trusted for headers. */
    toEmail: text('to_email').notNull(),

    subject: text('subject').notNull(),
    html: text('html').notNull(),
    text: text('text').notNull(),

    /** Template identifier (`verify_email`, `scan_completed`, `new_critical`). */
    template: text('template').notNull(),

    status: mailStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),

    /**
     * Last delivery error, truncated to something an operator can read. Never a
     * raw SMTP transcript: those can contain credentials in the AUTH exchange.
     */
    lastError: text('last_error'),

    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => ({
    /** The runner's work query: `pending`, due, oldest first. */
    dueIdx: index('mail_outbox_due_idx').on(table.status, table.nextAttemptAt),
    /** Support lookup: "everything sent to this address", newest first. */
    recipientIdx: index('mail_outbox_recipient_idx').on(table.toEmail, table.createdAt.desc()),
  }),
);

export type MailOutboxRow = typeof mailOutbox.$inferSelect;
export type NewMailOutboxRow = typeof mailOutbox.$inferInsert;
