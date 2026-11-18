/**
 * The simulated checkout page's shared types and initial state (Sprint 2,
 * HU-02b; ADR 0019).
 *
 * ## WHY THIS LIVES IN ITS OWN MODULE
 *
 * `demo-checkout-actions.ts` starts with `'use server'`, and Next refuses to
 * build such a file if it exports anything other than an async function — a
 * `const` object included. The initial state has to be a value the client
 * component can import, so it cannot live in the action module; keeping it here
 * is what lets both sides share one declaration without duplicating it.
 */

/** Outcomes the webhook can report, as returned by `applyPaymentEvent`. */
export type DemoOutcome = 'applied' | 'duplicate' | 'stale' | 'ignored';

/**
 * What the page shows. `declined` is a *view* of `applied`: the decline WAS
 * applied — to the checkout row — while the subscription stayed where it was.
 * Reporting it as `applied` on screen would say "the subscription changed" about
 * the one event that changes nothing about it.
 */
export type DemoDisplayOutcome = DemoOutcome | 'declined';

export type DemoErrorCode =
  | 'provider_off'
  | 'checkout_missing'
  | 'card_unknown'
  | 'webhook_failed'
  | 'unknown_intent';

export interface DemoCheckoutState {
  status: 'idle' | 'done' | 'error';
  outcome?: DemoDisplayOutcome;
  error?: DemoErrorCode;
  /** HTTP status, when the failure came from the webhook. */
  httpStatus?: number;
}

export const initialDemoCheckoutState: DemoCheckoutState = { status: 'idle' };
