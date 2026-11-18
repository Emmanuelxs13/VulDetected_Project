'use server';

import { checkoutSessions, eq } from '@vuldetected/db';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { buildPaymentEvent, deliverPaymentEvent } from '@/lib/payments/deliver';
import { getPaymentProvider } from '@/lib/payments/provider';
import { resolveTestCard } from '@/lib/payments/simulator';

import type { DemoCheckoutState, DemoDisplayOutcome } from './demo-checkout-types';

/**
 * The simulated hosted checkout page's actions (Sprint 2, HU-02b; ADR 0019).
 *
 * ## WHY THE EVENT ID IS DERIVED, NOT RANDOM
 *
 * `evt_<checkoutId>_<outcome>` is deterministic on purpose. A retry, a
 * double-click or an explicit "resend" therefore produces the SAME id, which is
 * exactly the situation the unique index has to deduplicate. A random id per
 * click would make every resend look like a brand-new payment and prove nothing
 * about idempotency.
 *
 * ## WHY THE OUT-OF-ORDER CASE EXISTS
 *
 * Providers deliver concurrently and retry. The only defensible rule is "the
 * newest event wins", and the demo has to be able to show it: a decline stamped
 * an hour ago must NOT undo a payment that just succeeded.
 *
 * ## WHY THIS RETURNS CODES, NOT SENTENCES
 *
 * Copy belongs to the translation layer (the same rule the scan error codes
 * follow). The component turns these codes into text in the visitor's language.
 */

export async function demoCheckoutAction(
  _prev: DemoCheckoutState,
  formData: FormData,
): Promise<DemoCheckoutState> {
  const provider = getPaymentProvider();
  if (provider === null) {
    return { status: 'error', error: 'provider_off' };
  }

  const checkoutId = String(formData.get('checkoutId') ?? '');
  const intent = String(formData.get('intent') ?? '');

  if (checkoutId === '') {
    return { status: 'error', error: 'checkout_missing' };
  }

  const [checkout] = await db()
    .select({
      id: checkoutSessions.id,
      userId: checkoutSessions.userId,
      plan: checkoutSessions.plan,
    })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, checkoutId))
    .limit(1);

  if (checkout === undefined) {
    return { status: 'error', error: 'checkout_missing' };
  }

  let type: 'checkout.paid' | 'checkout.declined';
  let eventId: string;
  let created = Math.floor(Date.now() / 1000);

  switch (intent) {
    case 'pay': {
      const card = String(formData.get('card') ?? '');
      const outcome = resolveTestCard(card);
      if (outcome === null) {
        return { status: 'error', error: 'card_unknown' };
      }
      type = outcome === 'paid' ? 'checkout.paid' : 'checkout.declined';
      eventId = `evt_${checkout.id}_${outcome}`;
      break;
    }
    case 'replay': {
      // Same id as the last payment: the webhook must answer `duplicate`.
      type = 'checkout.paid';
      eventId = `evt_${checkout.id}_paid`;
      break;
    }
    case 'out-of-order': {
      // A decline stamped an hour ago. Newer state must survive it.
      type = 'checkout.declined';
      eventId = `evt_${checkout.id}_declined_late`;
      created -= 3600;
      break;
    }
    default:
      return { status: 'error', error: 'unknown_intent' };
  }

  const result = await deliverPaymentEvent(
    buildPaymentEvent({
      type,
      checkoutId: checkout.id,
      userId: checkout.userId,
      plan: checkout.plan,
      eventId,
      created,
    }),
  );

  if (result.status !== 200) {
    return { status: 'error', error: 'webhook_failed', httpStatus: result.status };
  }

  revalidatePath('/settings/billing');
  revalidatePath(`/demo/checkout/${checkoutId}`);

  const outcome = result.outcome;
  if (outcome === 'applied' || outcome === 'duplicate' || outcome === 'stale' || outcome === 'ignored') {
    // A decline is `applied` from the ledger's point of view — it was recorded
    // against the checkout — but the subscription did not move. Say so, instead
    // of printing "the subscription state changed" about the one event that
    // proves it does not.
    const display: DemoDisplayOutcome =
      outcome === 'applied' && type === 'checkout.declined' ? 'declined' : outcome;

    return { status: 'done', outcome: display };
  }

  return { status: 'error', error: 'webhook_failed', httpStatus: result.status };
}
