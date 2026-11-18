import 'server-only';

import { demoModeEnabled } from '@/lib/demo-mode';

import { createSimulatorProvider } from './simulator';
import type { PaymentProvider } from './types';

/**
 * Provider selection (Sprint 2, HU-02b; ADR 0019).
 *
 * ## WHY `process.env` IS READ HERE
 *
 * Same narrow exception as `lib/demo-mode.ts`: this module must be importable by
 * route handlers and by unit tests that never build a full environment, and
 * `lib/env.ts` is `server-only` plus requires `DATABASE_URL`. `lib/env.ts` still
 * validates the variables and refuses to boot in production with the demo secret
 * set, so this reads a value that has already been checked.
 *
 * ## WHY `null` IS A VALID ANSWER
 *
 * Without `DEMO_MODE=true` and a secret there is no provider. The billing screen
 * then shows the plans read-only and says billing is not configured, instead of
 * rendering a button that cannot work. "No provider" is a state, not an error.
 */

export function demoPaymentSecret(): string | null {
  if (!demoModeEnabled()) return null;
  const secret = process.env.DEMO_PAYMENT_WEBHOOK_SECRET;
  return secret !== undefined && secret.length >= 16 ? secret : null;
}

export function getPaymentProvider(): PaymentProvider | null {
  const secret = demoPaymentSecret();
  return secret === null ? null : createSimulatorProvider(secret);
}

/** For callers that cannot proceed without a provider (the checkout action). */
export function requirePaymentProvider(): PaymentProvider {
  const provider = getPaymentProvider();
  if (provider === null) {
    throw new Error(
      'No payment provider is configured. Set DEMO_MODE=true and DEMO_PAYMENT_WEBHOOK_SECRET ' +
        'to arm the simulator.',
    );
  }
  return provider;
}
