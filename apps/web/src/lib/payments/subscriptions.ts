import 'server-only';

import {
  and,
  checkoutSessions,
  desc,
  eq,
  isNotNull,
  paymentEvents,
  sql,
  users,
  type CheckoutStatus,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@vuldetected/db';

import { db } from '@/lib/db';
import { decideSubscriptionUpdate, isCancellationDue } from './apply';
import type { PaymentEvent, SubscriptionState } from './types';

/**
 * Persistence for the subscription domain (Sprint 2, HU-02b; ADR 0019).
 *
 * The rules live in `./apply`; this module only reads state, records the event
 * and writes the result — in one transaction, so "the event was recorded" and
 * "the subscription changed" can never disagree.
 */

export type ApplyOutcome = 'applied' | 'duplicate' | 'stale' | 'ignored';

const DAY_MS = 24 * 60 * 60 * 1000;

function stateFromUser(row: {
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionProvider: string | null;
  subscriptionLastEventAt: Date | null;
  subscriptionPeriodEnd: Date | null;
  subscriptionCancelAtPeriodEnd: boolean;
}): SubscriptionState {
  return {
    plan: row.subscriptionPlan,
    status: row.subscriptionStatus,
    provider: row.subscriptionProvider,
    lastEventAt: row.subscriptionLastEventAt,
    periodEnd: row.subscriptionPeriodEnd,
    cancelAtPeriodEnd: row.subscriptionCancelAtPeriodEnd,
  };
}

const USER_BILLING_COLUMNS = {
  subscriptionPlan: users.subscriptionPlan,
  subscriptionStatus: users.subscriptionStatus,
  subscriptionProvider: users.subscriptionProvider,
  subscriptionLastEventAt: users.subscriptionLastEventAt,
  subscriptionPeriodEnd: users.subscriptionPeriodEnd,
  subscriptionCancelAtPeriodEnd: users.subscriptionCancelAtPeriodEnd,
};

/**
 * Applies one authenticated provider event.
 *
 * ## ORDER OF OPERATIONS, AND WHY
 *
 * 1. Read the user. No user means the event is recorded as `ignored`: a
 *    webhook for a deleted account must still be acknowledged, or the provider
 *    retries it forever.
 * 2. Decide with the pure function. The decision is computed before the insert
 *    because the outcome is part of the row.
 * 3. Insert the event with `ON CONFLICT DO NOTHING`. Zero rows inserted means a
 *    concurrent or previous delivery already claimed this id — that is the
 *    duplicate path, and it answers 200 so the provider stops retrying.
 * 4. Only then write the subscription and the checkout row.
 *
 * All four steps run in one transaction: a crash between 3 and 4 would otherwise
 * leave an event marked applied whose effect never happened, and the retry would
 * be swallowed as a duplicate.
 */
export async function applyPaymentEvent(event: PaymentEvent): Promise<ApplyOutcome> {
  return db().transaction(async (tx) => {
    const userRows = await tx
      .select({ id: users.id, ...USER_BILLING_COLUMNS })
      .from(users)
      .where(eq(users.id, event.data.userId))
      .limit(1);

    const user = userRows[0];

    if (user === undefined) {
      const inserted = await tx
        .insert(paymentEvents)
        .values({
          provider: event.provider,
          eventId: event.id,
          type: event.type,
          outcome: 'ignored',
          occurredAt: new Date(event.created * 1000),
          payload: event as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing({
          target: [paymentEvents.provider, paymentEvents.eventId],
        })
        .returning({ id: paymentEvents.id });

      // A replayed event for an account that no longer exists is still a
      // duplicate: the answer has to be `duplicate`, not `ignored`, or the
      // idempotency claim would be false on exactly the path nobody looks at.
      return inserted.length === 0 ? 'duplicate' : 'ignored';
    }

    const decision = decideSubscriptionUpdate(stateFromUser(user), event);

    const outcome: ApplyOutcome =
      decision.kind === 'stale' ? 'stale' : decision.kind === 'ignored' ? 'ignored' : 'applied';

    const inserted = await tx
      .insert(paymentEvents)
      .values({
        provider: event.provider,
        eventId: event.id,
        type: event.type,
        outcome,
        occurredAt: new Date(event.created * 1000),
        payload: event as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing({
        target: [paymentEvents.provider, paymentEvents.eventId],
      })
      .returning({ id: paymentEvents.id });

    if (inserted.length === 0) {
      return 'duplicate';
    }

    if (decision.kind !== 'subscription') {
      return outcome;
    }

    await tx
      .update(users)
      .set({
        subscriptionPlan: decision.next.plan,
        subscriptionStatus: decision.next.status,
        subscriptionProvider: decision.next.provider,
        subscriptionLastEventAt: decision.next.lastEventAt,
        subscriptionPeriodEnd: decision.next.periodEnd,
        subscriptionCancelAtPeriodEnd: decision.next.cancelAtPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(users.id, event.data.userId));

    if (decision.checkoutStatus !== null) {
      await tx
        .update(checkoutSessions)
        .set({ status: decision.checkoutStatus, updatedAt: new Date() })
        .where(
          and(
            eq(checkoutSessions.id, event.data.checkoutId),
            eq(checkoutSessions.userId, event.data.userId),
          ),
        );
    }

    return 'applied';
  });
}

export interface BillingSnapshot {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  lastCheckout: { plan: SubscriptionPlan; status: CheckoutStatus; createdAt: Date } | null;
  /** How many provider events this account has produced. Evidence, not a guess. */
  appliedEvents: number;
}

export async function readBillingSnapshot(userId: string): Promise<BillingSnapshot> {
  const database = db();

  const [userRows, checkoutRows, eventRows] = await Promise.all([
    database
      .select(USER_BILLING_COLUMNS)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    database
      .select({
        plan: checkoutSessions.plan,
        status: checkoutSessions.status,
        createdAt: checkoutSessions.createdAt,
      })
      .from(checkoutSessions)
      .where(eq(checkoutSessions.userId, userId))
      .orderBy(desc(checkoutSessions.createdAt))
      .limit(1),
    database
      .select({ value: sql<number>`count(*)` })
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.outcome, 'applied'),
          // Scoped to THIS account. Counting every applied event in the table
          // would make one user's billing screen report another user's activity,
          // which is both wrong and a small information leak.
          sql`${paymentEvents.payload} -> 'data' ->> 'userId' = ${userId}`,
        ),
      ),
  ]);

  const row = userRows[0];

  return {
    plan: row?.subscriptionPlan ?? 'free',
    status: row?.subscriptionStatus ?? 'active',
    periodEnd: row?.subscriptionPeriodEnd ?? null,
    cancelAtPeriodEnd: row?.subscriptionCancelAtPeriodEnd ?? false,
    lastCheckout: checkoutRows[0] ?? null,
    appliedEvents: Number(eventRows[0]?.value ?? 0),
  };
}

/**
 * Ends every scheduled cancellation whose period has elapsed.
 *
 * Without this, "cancel at period end" would be a flag that nothing ever acts on
 * — a subscription that stays Pro forever while the screen says it was
 * cancelled. Returns the accounts it changed so a caller can log them.
 */
export async function sweepDueCancellations(now = new Date()): Promise<string[]> {
  const rows = await db()
    .select({ id: users.id, ...USER_BILLING_COLUMNS })
    .from(users)
    .where(
      and(
        eq(users.subscriptionCancelAtPeriodEnd, true),
        isNotNull(users.subscriptionPeriodEnd),
        sql`${users.subscriptionPeriodEnd} <= ${now}`,
      ),
    );

  const due = rows.filter((row) => isCancellationDue(stateFromUser(row), now));
  if (due.length === 0) {
    return [];
  }

  await db()
    .update(users)
    .set({
      subscriptionPlan: 'free',
      subscriptionStatus: 'active',
      subscriptionCancelAtPeriodEnd: false,
      subscriptionPeriodEnd: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(users.subscriptionCancelAtPeriodEnd, true),
        isNotNull(users.subscriptionPeriodEnd),
        sql`${users.subscriptionPeriodEnd} <= ${now}`,
      ),
    );

  return due.map((row) => row.id);
}

/** When the current paid period ends, as a Date, for display. */
export function periodEndFrom(paidAt: Date): Date {
  return new Date(paidAt.getTime() + 30 * DAY_MS);
}
