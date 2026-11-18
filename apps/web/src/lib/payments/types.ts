import type { SubscriptionPlan, SubscriptionStatus } from '@vuldetected/db';

/**
 * The billing vocabulary (Sprint 2, HU-02b; ADR 0019).
 *
 * ## WHY AN INTERFACE AND NOT A PROVIDER SDK
 *
 * The subscription domain has to outlive whichever gateway is used. Everything
 * that decides *what a subscription is* — when a plan becomes active, what a
 * cancellation means, which event wins when two arrive out of order — lives on
 * this side of the interface and is unit-testable without a network. A gateway
 * integration then reduces to "produce `PaymentEvent`s and verify their
 * signature", which is the only part that genuinely differs between providers.
 *
 * Sprint 2 ships one implementation: the simulator in `./simulator`.
 */

/** Plans a checkout can buy. Free is never purchased; it is where an account starts. */
export type PaidPlan = Exclude<SubscriptionPlan, 'free'>;

export type PaymentEventType = 'checkout.paid' | 'checkout.declined' | 'subscription.cancelled';

/**
 * One provider message, already authenticated and parsed.
 *
 * `created` is the provider's clock, in epoch seconds — the only ordering
 * authority. `receivedAt` is deliberately absent: when *we* saw an event says
 * nothing about when it happened, and using it for ordering is how a retried
 * old event rolls a subscription backwards.
 */
export interface PaymentEvent {
  /** Provider-assigned event id. The dedupe key. */
  id: string;
  provider: string;
  type: PaymentEventType;
  /** Provider time, epoch **seconds**. */
  created: number;
  data: {
    checkoutId: string;
    userId: string;
    /** Present on every event: the plan the checkout was for. */
    plan: SubscriptionPlan;
  };
}

export interface CheckoutRequest {
  /** Our checkout row id. Travels to the provider and comes back in the event. */
  checkoutId: string;
  userId: string;
  plan: PaidPlan;
  planName: string;
  /** `null` while the price is still `[COMPLETAR: precios definitivos]`. */
  amountCents: number | null;
}

export interface CheckoutHandle {
  provider: string;
  checkoutId: string;
  /** Absolute or root-relative URL the browser is sent to. */
  checkoutUrl: string;
}

/** The body was not signed by the provider, or was altered in transit. */
export class PaymentSignatureError extends Error {
  constructor(message = 'invalid webhook signature') {
    super(message);
    this.name = 'PaymentSignatureError';
  }
}

/** The body was signed but does not describe a payment event this app understands. */
export class PaymentPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentPayloadError';
  }
}

export interface PaymentProvider {
  readonly id: string;

  /**
   * Registers the intent to pay and returns where to send the browser.
   *
   * This must NOT change the subscription. The provider's confirmation is the
   * only thing that does, which is why the webhook exists at all.
   */
  createCheckout(request: CheckoutRequest): Promise<CheckoutHandle>;

  /**
   * Authenticates and parses a raw webhook body.
   *
   * @throws PaymentSignatureError when the signature is missing or wrong
   * @throws PaymentPayloadError when the body is signed but malformed
   */
  parseWebhook(rawBody: string, headers: { signature?: string | null }): PaymentEvent;
}

/** What a subscription looks like before an event is applied. */
export interface SubscriptionState {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  provider: string | null;
  /** Newest provider event already applied. `null` for an account that never paid. */
  lastEventAt: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}
