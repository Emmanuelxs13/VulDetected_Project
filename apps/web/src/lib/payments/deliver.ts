import 'server-only';

import { randomUUID } from 'node:crypto';

import { getEnv } from '@/lib/env';

import { demoPaymentSecret } from './provider';
import { SIGNATURE_HEADER, signWebhookBody } from './simulator';
import type { PaymentEvent, PaymentEventType } from './types';

/**
 * Delivers a simulated provider event to our own webhook (Sprint 2, HU-02b).
 *
 * ## WHY OVER HTTP INSTEAD OF CALLING THE HANDLER DIRECTLY
 *
 * Calling `applyPaymentEvent` from the demo page would skip the two steps this
 * design exists to prove: signature verification and deduplication by event id.
 * A demo that bypasses them proves nothing about the production path. Posting to
 * `/api/payments/webhook` exercises exactly what a gateway would, over the same
 * socket the gateway would use.
 *
 * ## WHY IT RETRIES
 *
 * ADR 0019 requires the webhook to survive retries. A delivery that fails with a
 * 5xx is retried here with the SAME event id, which is precisely the situation
 * that produces a duplicate on the second attempt. The demo can therefore show
 * both: a retry that recovers, and a replay that is deduplicated.
 */

export interface DeliveryResult {
  status: number;
  outcome: string | null;
}

/** Builds an event the simulator would have sent. */
export function buildPaymentEvent(input: {
  type: PaymentEventType;
  checkoutId: string;
  userId: string;
  plan: PaymentEvent['data']['plan'];
  /** Reuse to replay an identical event id — the duplicate-demo path. */
  eventId?: string;
  /** Override the provider clock, in epoch seconds, to simulate out-of-order. */
  created?: number;
}): PaymentEvent {
  return {
    id: input.eventId ?? `evt_${randomUUID()}`,
    provider: 'simulator',
    type: input.type,
    created: input.created ?? Math.floor(Date.now() / 1000),
    data: {
      checkoutId: input.checkoutId,
      userId: input.userId,
      plan: input.plan,
    },
  };
}

const RETRY_DELAYS_MS = [150, 400] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * POSTs the event to the webhook, retrying transient failures.
 *
 * A 4xx is not retried: the body or the signature is wrong, and sending it again
 * produces the same answer. Only 5xx (and a network error, reported as 0) asks
 * for another attempt.
 */
export async function deliverPaymentEvent(event: PaymentEvent): Promise<DeliveryResult> {
  const secret = demoPaymentSecret();
  if (secret === null) {
    throw new Error(
      'The simulated payment provider is not armed. Set DEMO_MODE=true and ' +
        'DEMO_PAYMENT_WEBHOOK_SECRET.',
    );
  }

  const body = JSON.stringify(event);
  const signature = signWebhookBody(secret, body);
  const url = new URL('/api/payments/webhook', getEnv().AUTH_URL).toString();

  let last: DeliveryResult = { status: 0, outcome: null };

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 400);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SIGNATURE_HEADER]: signature,
        },
        body,
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => null)) as { outcome?: string } | null;
      last = { status: response.status, outcome: payload?.outcome ?? null };

      // Anything below 500 is a final answer from the webhook.
      if (response.status < 500) {
        return last;
      }
    } catch {
      last = { status: 0, outcome: null };
    }
  }

  return last;
}
