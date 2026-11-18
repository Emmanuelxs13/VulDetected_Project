import type { PaymentEvent, SubscriptionState } from './types';

/**
 * The subscription rules, as a pure function (Sprint 2, HU-02b; ADR 0019).
 *
 * ## WHY THIS IS NOT INSIDE THE WEBHOOK HANDLER
 *
 * Every interesting question about billing is an ordering question: a retried
 * `checkout.declined` arriving after its `checkout.paid`, a cancellation racing
 * an upgrade, a duplicate delivery. Those are decidable from two values — the
 * current state and the event — and they are far easier to get right, and to
 * prove right, when they are a function with no database in it.
 *
 * The handler's job is then only: authenticate, deduplicate, call this, persist.
 */

/** How long one simulated period lasts. Real providers return this from the API. */
export const PERIOD_DAYS = 30;

export type ApplyDecision =
  | { kind: 'stale'; reason: 'out_of_order' }
  | { kind: 'ignored'; reason: 'foreign_provider' }
  | {
      kind: 'subscription';
      next: SubscriptionState;
      /** What the checkout row becomes, when the event refers to one. */
      checkoutStatus: 'paid' | 'declined' | null;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

function eventInstant(event: PaymentEvent): Date {
  return new Date(event.created * 1000);
}

/**
 * Decides what an event does to a subscription.
 *
 * ## Out-of-order is not an error
 *
 * Providers retry and deliver concurrently, so "the newest applied event" is the
 * only state that can be defended. An event whose `created` is not newer than
 * `lastEventAt` is *stale*: acknowledged, recorded, and not applied. Applying it
 * would let a retry of an old decline cancel a newer upgrade.
 *
 * ## A decline changes nothing about the subscription
 *
 * It records the failed attempt on the checkout row and leaves `lastEventAt`
 * alone. Advancing it would make a later, genuinely newer payment look stale.
 */
export function decideSubscriptionUpdate(
  state: SubscriptionState,
  event: PaymentEvent,
): ApplyDecision {
  if (state.provider !== null && state.provider !== event.provider) {
    // Two providers writing one subscription would fight over it, and the loser
    // would silently overwrite the winner. Refusing is the only safe answer.
    return { kind: 'ignored', reason: 'foreign_provider' };
  }

  if (state.lastEventAt !== null && eventInstant(event).getTime() <= state.lastEventAt.getTime()) {
    return { kind: 'stale', reason: 'out_of_order' };
  }

  switch (event.type) {
    case 'checkout.declined':
      return { kind: 'subscription', next: state, checkoutStatus: 'declined' };

    case 'checkout.paid': {
      const paidAt = eventInstant(event);
      return {
        kind: 'subscription',
        next: {
          plan: event.data.plan,
          status: 'active',
          provider: event.provider,
          lastEventAt: paidAt,
          periodEnd: new Date(paidAt.getTime() + PERIOD_DAYS * DAY_MS),
          // Paying again — an upgrade, or a resubscribe — clears a pending
          // cancellation, which is what the customer just asked for.
          cancelAtPeriodEnd: false,
        },
        checkoutStatus: 'paid',
      };
    }

    case 'subscription.cancelled':
      return {
        kind: 'subscription',
        next: {
          ...state,
          cancelAtPeriodEnd: true,
          lastEventAt: eventInstant(event),
        },
        checkoutStatus: null,
      };

    default: {
      // Exhaustiveness: a new event type must be handled here, not silently
      // acknowledged by the route.
      const exhaustive: never = event.type;
      throw new Error(`unhandled payment event type: ${String(exhaustive)}`);
    }
  }
}

/**
 * Whether a scheduled cancellation has reached its end.
 *
 * Kept here, beside the rules that set `periodEnd`, so the sweep and the decision
 * cannot disagree about what "the period ended" means.
 */
export function isCancellationDue(state: SubscriptionState, now: Date): boolean {
  if (!state.cancelAtPeriodEnd) return false;
  if (state.periodEnd === null) return true;
  return state.periodEnd.getTime() <= now.getTime();
}
