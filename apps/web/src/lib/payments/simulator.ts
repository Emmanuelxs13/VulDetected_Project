import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  PaymentPayloadError,
  PaymentSignatureError,
  type CheckoutHandle,
  type CheckoutRequest,
  type PaymentEvent,
  type PaymentEventType,
  type PaymentProvider,
} from './types';

/**
 * The Sprint 2 payment provider: a simulator (ADR 0019).
 *
 * ## WHAT IS SIMULATED AND WHAT IS NOT
 *
 * Simulated: the money. Nothing is charged, no card is tokenised, and no
 * gateway is contacted.
 *
 * Not simulated: the contract. The checkout creates an intent, the browser is
 * sent to a hosted page, that page delivers a **signed** webhook, the webhook is
 * deduplicated by event id, and only then does the subscription change. Every
 * one of those steps is the same code a real gateway will drive, so replacing
 * this file is an integration, not a rewrite.
 *
 * ## WHY THE TEST CARDS ARE THE FAMILIAR ONES
 *
 * `4242 4242 4242 4242` and `4000 0000 0000 0002` are the card numbers every
 * gateway's documentation uses for "approved" and "declined". A reviewer who has
 * integrated Stripe before recognises them instantly, which is one less thing to
 * explain during a demo.
 */

export const SIMULATOR_PROVIDER_ID = 'simulator';

/** Header the simulator uses to carry the HMAC. */
export const SIGNATURE_HEADER = 'x-demo-signature';

export const SIMULATED_TEST_CARDS = {
  approved: {
    number: '4242 4242 4242 4242',
    outcome: 'paid',
    label: 'Aprobada',
  },
  declined: {
    number: '4000 0000 0000 0002',
    outcome: 'declined',
    label: 'Rechazada',
  },
} as const;

export type SimulatedOutcome = (typeof SIMULATED_TEST_CARDS)[keyof typeof SIMULATED_TEST_CARDS]['outcome'];

/** Digits only, so `4242-4242-4242-4242` and the spaced form are the same card. */
export function normalizeCardNumber(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/**
 * Maps a test card to its outcome.
 *
 * Returns `null` for any other number instead of defaulting to approved: a card
 * the simulator does not know is a mistake, and silently approving it would let
 * a typo look like a successful payment.
 */
export function resolveTestCard(raw: string): SimulatedOutcome | null {
  const digits = normalizeCardNumber(raw);
  for (const card of Object.values(SIMULATED_TEST_CARDS)) {
    if (normalizeCardNumber(card.number) === digits) {
      return card.outcome;
    }
  }
  return null;
}

export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

/**
 * Constant-time signature check.
 *
 * A `===` comparison leaks the length of the matching prefix through timing,
 * which is enough to forge a signature one byte at a time. `timingSafeEqual`
 * requires equal lengths, so a length mismatch is rejected before it is called.
 */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string | null | undefined,
): boolean {
  if (!header) return false;
  const expected = signWebhookBody(secret, body);
  const provided = Buffer.from(header, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (provided.length !== wanted.length) return false;
  return timingSafeEqual(provided, wanted);
}

const EVENT_TYPES: readonly PaymentEventType[] = [
  'checkout.paid',
  'checkout.declined',
  'subscription.cancelled',
];

function isEventType(value: unknown): value is PaymentEventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Parses a signed body into an event.
 *
 * Deliberately strict: every field is checked, and an unexpected shape is an
 * error rather than a half-populated object. A webhook handler that guesses is a
 * webhook handler that can be talked into activating a plan with a body the
 * provider never sent.
 */
export function parsePaymentEvent(rawBody: string): PaymentEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new PaymentPayloadError('body is not JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new PaymentPayloadError('body is not an object');
  }

  const event = parsed as Record<string, unknown>;
  const data = event.data as Record<string, unknown> | undefined;

  if (typeof event.id !== 'string' || event.id.length === 0) {
    throw new PaymentPayloadError('missing event id');
  }
  if (typeof event.provider !== 'string' || event.provider.length === 0) {
    throw new PaymentPayloadError('missing provider');
  }
  if (!isEventType(event.type)) {
    throw new PaymentPayloadError(`unsupported event type: ${String(event.type)}`);
  }
  if (typeof event.created !== 'number' || !Number.isFinite(event.created) || event.created <= 0) {
    throw new PaymentPayloadError('created must be a positive epoch-seconds number');
  }
  if (!data || typeof data !== 'object') {
    throw new PaymentPayloadError('missing data');
  }
  if (typeof data.checkoutId !== 'string' || data.checkoutId.length === 0) {
    throw new PaymentPayloadError('missing data.checkoutId');
  }
  if (typeof data.userId !== 'string' || data.userId.length === 0) {
    throw new PaymentPayloadError('missing data.userId');
  }
  if (data.plan !== 'free' && data.plan !== 'pro' && data.plan !== 'business') {
    throw new PaymentPayloadError(`unknown plan: ${String(data.plan)}`);
  }

  return {
    id: event.id,
    provider: event.provider,
    type: event.type,
    created: event.created,
    data: {
      checkoutId: data.checkoutId,
      userId: data.userId,
      plan: data.plan,
    },
  };
}

export function createSimulatorProvider(secret: string): PaymentProvider {
  return {
    id: SIMULATOR_PROVIDER_ID,

    async createCheckout(request: CheckoutRequest): Promise<CheckoutHandle> {
      return {
        provider: SIMULATOR_PROVIDER_ID,
        checkoutId: request.checkoutId,
        // Root-relative: the simulated hosted page is part of this app, and an
        // absolute URL would have to know the deployment's hostname.
        checkoutUrl: `/demo/checkout/${request.checkoutId}`,
      };
    },

    parseWebhook(rawBody: string, headers: { signature?: string | null }): PaymentEvent {
      if (!verifyWebhookSignature(secret, rawBody, headers.signature)) {
        throw new PaymentSignatureError();
      }
      return parsePaymentEvent(rawBody);
    },
  };
}
