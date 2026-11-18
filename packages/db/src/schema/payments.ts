import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { checkoutStatusEnum, paymentEventOutcomeEnum, subscriptionPlanEnum } from './enums';
import { users } from './users';

/**
 * `checkout_sessions` — one attempt to buy a plan (Sprint 2, HU-02b).
 *
 * ## WHY THIS IS NOT PART OF `users`
 *
 * A checkout is an event with a beginning and an end; the subscription on
 * `users` is a state. Keeping them in one row would mean a declined payment has
 * nowhere to be recorded except as "the plan did not change", which is
 * indistinguishable from "nothing happened". The billing screen has to be able
 * to say "your last attempt was declined" — that is a different sentence from
 * "you are on Free".
 *
 * ## WHY `amount_cents` IS NULLABLE
 *
 * The Pro and Business prices are `[COMPLETAR: precios definitivos]` until the
 * team sets them. A checkout row therefore records the amount *if one exists*
 * and `NULL` otherwise, instead of inventing a number the invoice would then
 * have to defend.
 */
export const checkoutSessions = pgTable(
  'checkout_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plan: subscriptionPlanEnum('plan').notNull(),
    status: checkoutStatusEnum('status').notNull().default('pending'),
    /** Which provider produced this checkout. Free text: a real gateway must fit. */
    provider: text('provider').notNull(),
    amountCents: integer('amount_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdx: index('checkout_sessions_user_idx').on(table.userId),
  }),
);

/**
 * `payment_events` — the provider's messages, as received (Sprint 2, HU-02b).
 *
 * ## WHY THE UNIQUE INDEX IS THE DEDUPE
 *
 * A provider retries a webhook it did not get a 2xx for. The only correct place
 * to decide "I have already applied this" is the database, atomically, with the
 * event identifier the provider assigned. An `if (alreadySeen)` check in
 * application code races two concurrent deliveries and applies both.
 *
 * The insert is therefore `ON CONFLICT DO NOTHING` on
 * `(provider, event_id)`: zero rows inserted means this delivery is a duplicate,
 * and the handler answers 200 so the provider stops retrying.
 *
 * ## WHY `payload` IS STORED
 *
 * The raw body is the only evidence of what the provider actually said. When a
 * subscription state looks wrong, the question is always "what did the provider
 * send, and in what order" — and that question is unanswerable if only the
 * derived state was kept.
 */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    outcome: paymentEventOutcomeEnum('outcome').notNull(),
    /** When the provider says the event happened, in provider time. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** When this process received it. The two differ for retries and replays. */
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull(),
  },
  (table) => ({
    providerEventUnique: uniqueIndex('payment_events_provider_event_unique').on(
      table.provider,
      table.eventId,
    ),
  }),
);

export type CheckoutSession = typeof checkoutSessions.$inferSelect;
export type NewCheckoutSession = typeof checkoutSessions.$inferInsert;
export type PaymentEventRow = typeof paymentEvents.$inferSelect;
export type NewPaymentEventRow = typeof paymentEvents.$inferInsert;
