import { describe, expect, it } from 'vitest';

import { decideSubscriptionUpdate, isCancellationDue, PERIOD_DAYS } from './apply';
import type { PaymentEvent, SubscriptionState } from './types';

/**
 * The subscription rules (Sprint 2, HU-02b; ADR 0019).
 *
 * Every case here is an ordering question, because ordering is what billing
 * actually gets wrong: a retried decline that undoes an upgrade, a duplicate
 * that charges twice, a cancellation that never takes effect. Keeping the rules
 * in a pure function is what makes these cheap to pin.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A fixed clock so period arithmetic is exact rather than approximate. */
const PAID_AT_SECONDS = 1_760_000_000;

function state(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  return {
    plan: 'free',
    status: 'active',
    provider: null,
    lastEventAt: null,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

function event(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    id: 'evt_test',
    provider: 'simulator',
    type: 'checkout.paid',
    created: PAID_AT_SECONDS,
    data: {
      checkoutId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      plan: 'pro',
    },
    ...overrides,
  };
}

describe('decideSubscriptionUpdate — activation', () => {
  it('activates the purchased plan and opens a period', () => {
    const decision = decideSubscriptionUpdate(state(), event());

    expect(decision.kind).toBe('subscription');
    if (decision.kind !== 'subscription') return;

    expect(decision.next.plan).toBe('pro');
    expect(decision.next.status).toBe('active');
    expect(decision.next.provider).toBe('simulator');
    expect(decision.next.lastEventAt?.getTime()).toBe(PAID_AT_SECONDS * 1000);
    expect(decision.next.periodEnd?.getTime()).toBe(
      PAID_AT_SECONDS * 1000 + PERIOD_DAYS * DAY_MS,
    );
    expect(decision.next.cancelAtPeriodEnd).toBe(false);
    expect(decision.checkoutStatus).toBe('paid');
  });

  it('records a decline on the checkout without touching the subscription', () => {
    const before = state();
    const decision = decideSubscriptionUpdate(before, event({ type: 'checkout.declined' }));

    expect(decision.kind).toBe('subscription');
    if (decision.kind !== 'subscription') return;

    expect(decision.next).toEqual(before);
    expect(decision.checkoutStatus).toBe('declined');
  });

  it('clears a pending cancellation when the customer pays again', () => {
    const cancelling = state({
      plan: 'pro',
      provider: 'simulator',
      lastEventAt: new Date((PAID_AT_SECONDS - 100) * 1000),
      periodEnd: new Date((PAID_AT_SECONDS + 100) * 1000),
      cancelAtPeriodEnd: true,
    });

    const decision = decideSubscriptionUpdate(cancelling, event());

    expect(decision.kind).toBe('subscription');
    if (decision.kind !== 'subscription') return;
    expect(decision.next.cancelAtPeriodEnd).toBe(false);
    expect(decision.next.plan).toBe('pro');
  });
});

describe('decideSubscriptionUpdate — ordering', () => {
  it('discards an event older than the last applied one', () => {
    const paid = state({
      plan: 'pro',
      provider: 'simulator',
      lastEventAt: new Date(PAID_AT_SECONDS * 1000),
    });

    const decision = decideSubscriptionUpdate(
      paid,
      event({ type: 'checkout.declined', created: PAID_AT_SECONDS - 1 }),
    );

    expect(decision).toEqual({ kind: 'stale', reason: 'out_of_order' });
  });

  it('treats an event at the same instant as stale', () => {
    const paid = state({
      plan: 'pro',
      provider: 'simulator',
      lastEventAt: new Date(PAID_AT_SECONDS * 1000),
    });

    const decision = decideSubscriptionUpdate(paid, event({ created: PAID_AT_SECONDS }));

    expect(decision.kind).toBe('stale');
  });

  it('does not let a newer decline undo a paid plan', () => {
    const paid = state({
      plan: 'pro',
      provider: 'simulator',
      lastEventAt: new Date(PAID_AT_SECONDS * 1000),
      periodEnd: new Date((PAID_AT_SECONDS + 30 * 86400) * 1000),
    });

    const decision = decideSubscriptionUpdate(
      paid,
      event({ type: 'checkout.declined', created: PAID_AT_SECONDS + 10 }),
    );

    expect(decision.kind).toBe('subscription');
    if (decision.kind !== 'subscription') return;
    // The decline is recorded against the checkout, but the subscription that
    // was already paid for survives.
    expect(decision.next.plan).toBe('pro');
    expect(decision.next.periodEnd?.getTime()).toBe(paid.periodEnd?.getTime());
    expect(decision.checkoutStatus).toBe('declined');
  });

  it('refuses to let a second provider take over an account', () => {
    const paid = state({
      plan: 'pro',
      provider: 'simulator',
      lastEventAt: new Date(PAID_AT_SECONDS * 1000),
    });

    const decision = decideSubscriptionUpdate(
      paid,
      event({ provider: 'other-gateway', created: PAID_AT_SECONDS + 100 }),
    );

    expect(decision).toEqual({ kind: 'ignored', reason: 'foreign_provider' });
  });
});

describe('decideSubscriptionUpdate — cancellation', () => {
  it('schedules the cancellation and keeps the paid plan', () => {
    const paid = state({
      plan: 'pro',
      provider: 'simulator',
      lastEventAt: new Date(PAID_AT_SECONDS * 1000),
      periodEnd: new Date((PAID_AT_SECONDS + 30 * 86400) * 1000),
    });

    const decision = decideSubscriptionUpdate(
      paid,
      event({ type: 'subscription.cancelled', created: PAID_AT_SECONDS + 60 }),
    );

    expect(decision.kind).toBe('subscription');
    if (decision.kind !== 'subscription') return;
    expect(decision.next.plan).toBe('pro');
    expect(decision.next.cancelAtPeriodEnd).toBe(true);
    expect(decision.next.lastEventAt?.getTime()).toBe((PAID_AT_SECONDS + 60) * 1000);
    expect(decision.checkoutStatus).toBeNull();
  });
});

describe('isCancellationDue', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('is false when no cancellation was requested', () => {
    expect(isCancellationDue(state({ periodEnd: new Date('2026-01-01T00:00:00.000Z') }), now)).toBe(
      false,
    );
  });

  it('is true once the paid period has ended', () => {
    expect(
      isCancellationDue(
        state({ cancelAtPeriodEnd: true, periodEnd: new Date('2026-05-31T23:59:59.000Z') }),
        now,
      ),
    ).toBe(true);
  });

  it('is false while the paid period is still running', () => {
    expect(
      isCancellationDue(
        state({ cancelAtPeriodEnd: true, periodEnd: new Date('2026-06-02T00:00:00.000Z') }),
        now,
      ),
    ).toBe(false);
  });

  it('is true when a cancellation has no period to wait for', () => {
    expect(isCancellationDue(state({ cancelAtPeriodEnd: true, periodEnd: null }), now)).toBe(true);
  });
});
