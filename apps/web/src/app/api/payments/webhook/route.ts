import 'server-only';

import { NextResponse } from 'next/server';

import { audit } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/payments/provider';
import { SIGNATURE_HEADER } from '@/lib/payments/simulator';
import { applyPaymentEvent } from '@/lib/payments/subscriptions';
import { PaymentPayloadError, PaymentSignatureError } from '@/lib/payments/types';

export const dynamic = 'force-dynamic';

/**
 * The payment webhook (Sprint 2, HU-02b; ADR 0019).
 *
 * ## THIS ROUTE IS THE ONLY THING THAT CHANGES A SUBSCRIPTION
 *
 * The checkout action creates an *intent*. The browser is then sent to a hosted
 * page, and nothing about the account changes until this endpoint receives a
 * signed confirmation. That separation is what makes the design portable: the
 * simulator and a real gateway both drive the same route, so switching providers
 * is an integration rather than a rewrite.
 *
 * ## WHY THE BODY IS READ AS TEXT
 *
 * The signature covers the exact bytes the provider sent. `await req.json()`
 * re-serialises the object, and any difference in key order or whitespace
 * invalidates the HMAC — which is how a "signature verification" ends up
 * verifying nothing but the app's own JSON encoder.
 *
 * ## WHY EVERY FAILURE HAS A DIFFERENT STATUS
 *
 *   - 401 bad signature → the caller is not the provider; it must not retry.
 *   - 400 malformed body → the provider sent something we cannot read; a retry
 *     sends the same body, so the answer is "stop".
 *   - 409 nothing to do → recorded, no state change (`stale`, `ignored`).
 *   - 200 applied or duplicate → success. A duplicate MUST answer 200 or the
 *     provider retries a delivery it should forget.
 *   - 500 unexpected → the provider's retry is the recovery path, so this is the
 *     only code that asks for one.
 */
export async function POST(req: Request) {
  const provider = getPaymentProvider();

  if (provider === null) {
    // No provider configured is not a client error and not a transient one: the
    // deployment is missing the demo switch. 503 says exactly that.
    return NextResponse.json({ error: 'payment_provider_not_configured' }, { status: 503 });
  }

  const rawBody = await req.text();

  let event;
  try {
    event = provider.parseWebhook(rawBody, {
      signature: req.headers.get(SIGNATURE_HEADER),
    });
  } catch (error) {
    if (error instanceof PaymentSignatureError) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }
    if (error instanceof PaymentPayloadError) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  try {
    const outcome = await applyPaymentEvent(event);

    /**
     * The audit row is written only when the subscription actually moved.
     * `duplicate`, `stale` and `ignored` are recorded in `payment_events`, which
     * is the right ledger for provider traffic; the audit log answers "who
     * changed this account's plan", and a deduplicated retry changed nothing.
     */
    if (outcome === 'applied' && event.type !== 'checkout.declined') {
      try {
        await audit({
          action: 'plan.changed',
          actorUserId: event.data.userId,
          targetType: 'subscription',
          targetId: event.data.userId,
          metadata: {
            type: event.type,
            plan: event.data.plan,
            eventId: event.id,
          },
        });
      } catch (error) {
        // A failed audit row must not fail the delivery: the event is already
        // applied, and answering 500 would make the provider retry a delivery
        // that is now a duplicate.
        console.error('[payments] could not audit the plan change', event.id, error);
      }
    }

    return NextResponse.json({ ok: true, outcome }, { status: 200 });
  } catch (error) {
    /**
     * A database failure is the one case where a retry is the correct answer:
     * the event was not recorded, so the provider's next delivery is the
     * recovery. Logging the event id makes the retry traceable.
     */
    console.error('[payments] could not apply event', event.id, error);
    return NextResponse.json({ error: 'apply_failed' }, { status: 500 });
  }
}
