import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPaymentProvider } from './provider';
import {
  createSimulatorProvider,
  normalizeCardNumber,
  parsePaymentEvent,
  resolveTestCard,
  signWebhookBody,
  SIMULATED_TEST_CARDS,
  SIMULATOR_PROVIDER_ID,
  verifyWebhookSignature,
} from './simulator';
import { PaymentPayloadError, PaymentSignatureError } from './types';

/**
 * The simulated provider (Sprint 2, HU-02b; ADR 0019).
 *
 * The simulator exists so the *contract* is real: signed body, single-use event
 * id, dedupe on the database. These tests pin the parts a demo could otherwise
 * fake — signature verification, strict payload parsing and card resolution.
 */

const SECRET = 'demo-payment-secret-2026';

function validEventBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_1',
    provider: SIMULATOR_PROVIDER_ID,
    type: 'checkout.paid',
    created: 1_760_000_000,
    data: {
      checkoutId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      plan: 'pro',
    },
    ...overrides,
  });
}

describe('test cards', () => {
  it('resolves the approved card', () => {
    expect(resolveTestCard(SIMULATED_TEST_CARDS.approved.number)).toBe('paid');
  });

  it('resolves the declined card', () => {
    expect(resolveTestCard(SIMULATED_TEST_CARDS.declined.number)).toBe('declined');
  });

  it('accepts dashed and compact spellings of the same card', () => {
    expect(resolveTestCard('4242-4242-4242-4242')).toBe('paid');
    expect(resolveTestCard('4242424242424242')).toBe('paid');
  });

  it('returns null for a card it does not know, instead of approving it', () => {
    expect(resolveTestCard('4111 1111 1111 1111')).toBeNull();
    expect(resolveTestCard('')).toBeNull();
  });

  it('normalises separators only', () => {
    expect(normalizeCardNumber(' 4242 4242-4242 4242 ')).toBe('4242424242424242');
  });
});

describe('webhook signature', () => {
  it('signs deterministically with the sha256 prefix', () => {
    const body = validEventBody();

    expect(signWebhookBody(SECRET, body)).toBe(signWebhookBody(SECRET, body));
    expect(signWebhookBody(SECRET, body)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('changes when the body changes', () => {
    expect(signWebhookBody(SECRET, validEventBody())).not.toBe(
      signWebhookBody(SECRET, validEventBody({ id: 'evt_2' })),
    );
  });

  it('accepts the signature it produced', () => {
    const body = validEventBody();

    expect(verifyWebhookSignature(SECRET, body, signWebhookBody(SECRET, body))).toBe(true);
  });

  it('rejects a missing, foreign or tampered signature', () => {
    const body = validEventBody();

    expect(verifyWebhookSignature(SECRET, body, null)).toBe(false);
    expect(verifyWebhookSignature(SECRET, body, '')).toBe(false);
    expect(verifyWebhookSignature(SECRET, body, signWebhookBody('another-secret', body))).toBe(false);
    expect(verifyWebhookSignature(SECRET, `${body} `, signWebhookBody(SECRET, body))).toBe(false);
  });

  it('rejects a signature of a different length without throwing', () => {
    expect(verifyWebhookSignature(SECRET, validEventBody(), 'sha256=deadbeef')).toBe(false);
  });
});

describe('parsePaymentEvent', () => {
  it('parses a complete event', () => {
    const event = parsePaymentEvent(validEventBody());

    expect(event.id).toBe('evt_1');
    expect(event.type).toBe('checkout.paid');
    expect(event.created).toBe(1_760_000_000);
    expect(event.data.plan).toBe('pro');
  });

  it.each([
    ['not JSON', 'not-json'],
    ['not an object', '[]'],
    ['missing id', JSON.stringify({ provider: 'simulator' })],
    ['unsupported type', validEventBody({ type: 'invoice.refunded' })],
    ['non-positive created', validEventBody({ created: 0 })],
    ['missing data', JSON.stringify({ id: 'evt_1', provider: 'simulator', type: 'checkout.paid', created: 1 })],
    ['unknown plan', validEventBody({ data: { checkoutId: 'c', userId: 'u', plan: 'enterprise' } })],
  ])('rejects %s', (_label, body) => {
    expect(() => parsePaymentEvent(body)).toThrow(PaymentPayloadError);
  });
});

describe('createSimulatorProvider', () => {
  const provider = createSimulatorProvider(SECRET);

  it('sends the browser to the local hosted page', async () => {
    const handle = await provider.createCheckout({
      checkoutId: 'checkout-1',
      userId: 'user-1',
      plan: 'pro',
      planName: 'Pro',
      amountCents: null,
    });

    expect(handle.provider).toBe(SIMULATOR_PROVIDER_ID);
    expect(handle.checkoutUrl).toBe('/demo/checkout/checkout-1');
  });

  it('refuses a body whose signature does not match', () => {
    expect(() => provider.parseWebhook(validEventBody(), { signature: 'sha256=00' })).toThrow(
      PaymentSignatureError,
    );
  });

  it('parses a body it signed itself', () => {
    const body = validEventBody();

    const event = provider.parseWebhook(body, { signature: signWebhookBody(SECRET, body) });

    expect(event.id).toBe('evt_1');
  });
});

describe('getPaymentProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is null outside the demo profile', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEMO_MODE', 'false');
    vi.stubEnv('DEMO_PAYMENT_WEBHOOK_SECRET', SECRET);

    expect(getPaymentProvider()).toBeNull();
  });

  it('is null when the demo is armed but no secret exists', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_PAYMENT_WEBHOOK_SECRET', '');

    expect(getPaymentProvider()).toBeNull();
  });

  it('is null in production even if both flags are set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_PAYMENT_WEBHOOK_SECRET', SECRET);

    expect(getPaymentProvider()).toBeNull();
  });

  it('returns the simulator when the demo is armed and a secret exists', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_PAYMENT_WEBHOOK_SECRET', SECRET);

    expect(getPaymentProvider()?.id).toBe(SIMULATOR_PROVIDER_ID);
  });
});
