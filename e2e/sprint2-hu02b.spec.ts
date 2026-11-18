import { execFileSync } from 'node:child_process';

import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 2 · HU-02b (SCRUM-28) — simulated subscription, driven through a real
 * browser.
 *
 * ## What this proves that the unit tests cannot
 *
 * `lib/payments/apply.test.ts` proves the *rules*: what a paid event does to a
 * subscription, that an older event is discarded, that a foreign provider is
 * ignored. Those are pure functions, and a pure function never sends a signed
 * HTTP request.
 *
 * This spec walks the whole hop the architecture depends on:
 *
 *   billing screen → checkout row → the provider's hosted page → a signed POST
 *   to `/api/payments/webhook` → the webhook verifies, deduplicates and applies
 *   → the billing screen reads the new state back from the database.
 *
 * The plan is never written by the page or by a server action. If the webhook
 * fails, the plan stays where it was — which is the only way the demo can be
 * evidence of the integration rather than of a local `if`.
 *
 * ## Why the criteria are separate tests
 *
 * Each test starts from the seeded plans (`demo:reset-billing`) so a failure
 * names one criterion instead of poisoning the next. The reset is narrow on
 * purpose: it touches billing rows only, never users, domains or scans.
 */

const DEMO_EMAIL = 'demo.free@vuldetected.local';
const DEMO_PASSWORD = 'VulDetected-Demo-2026!';

const APPROVED_CARD = '4242 4242 4242 4242';
const DECLINED_CARD = '4000 0000 0000 0002';

/**
 * Restores the seeded billing state: `demo.free` on Free, the other two on their
 * seeded paid plans, and both ledgers empty.
 *
 * Without this, every run leaves `demo.free` on Pro and the next run starts from
 * a state the presenter did not prepare — a Free account showing Pro limits is
 * exactly the contradiction an audience notices.
 */
function resetBilling(): void {
  execFileSync('node', ['apps/web/scripts/demo/reset-billing.mjs'], { stdio: 'pipe' });
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * The billing screen renders the subscription as a definition list. Reading the
 * `<dd>` that belongs to a `<dt>` is how the assertions stay attached to the
 * label instead of to the first occurrence of the word "Pro" on the page.
 */
function factValue(page: Page, label: string) {
  return page.locator(`div:has(> dt:text-is("${label}")) > dd`).first();
}

/** Buys a plan through the real checkout page and returns the checkout URL. */
async function buyPlan(page: Page, planName: 'Pro' | 'Business', card: string): Promise<string> {
  await page.goto('/settings/billing');
  await page.getByRole('button', { name: `Cambiar a ${planName}` }).click();

  await page.waitForURL(/\/demo\/checkout\//, { timeout: 30_000 });
  const checkoutUrl = page.url();

  // The hosted page belongs to the provider, so it must say so.
  await expect(page.getByRole('heading', { name: 'Pasarela de pago simulada' })).toBeVisible();
  await expect(page.getByText('Modo demostración').first()).toBeVisible();

  await page.locator(`input[name="card"][value="${card}"]`).check();
  await page.getByRole('button', { name: 'Pagar', exact: true }).click();

  return checkoutUrl;
}

test.describe('Sprint 2 — HU-02b', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    resetBilling();
  });

  test('CA-34 a CA-37 (ADR 0019): approved payment activates the plan; replay is a duplicate; a stale decline is discarded', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/settings/billing');

    // The screen is honest about the two things a demo usually fakes.
    await expect(page.getByText('Modo demostración: no se realiza ningún cobro')).toBeVisible();
    await expect(page.getByText('[COMPLETAR: precios definitivos]').first()).toBeVisible();
    await expect(factValue(page, 'Plan')).toHaveText('Free');

    const checkoutUrl = await buyPlan(page, 'Pro', APPROVED_CARD);

    // CA-35: the webhook — not the page — applied the change.
    await expect(
      page.getByText('Aplicado: el estado de la suscripción cambió.'),
    ).toBeVisible({ timeout: 30_000 });

    await page.goto('/settings/billing');
    await expect(factValue(page, 'Plan')).toHaveText('Pro');
    await expect(factValue(page, 'Estado')).toHaveText('Activo');
    await expect(factValue(page, 'Fin del período')).not.toHaveText('—');

    // CA-36: the same event id again is deduplicated, not applied twice.
    await page.goto(checkoutUrl);
    await page.getByRole('button', { name: 'Reenviar el mismo evento' }).click();
    await expect(
      page.getByText('Duplicado: el evento ya estaba registrado y no se aplicó dos veces.'),
    ).toBeVisible({ timeout: 30_000 });

    // CA-37: a decline stamped an hour ago must not undo the payment.
    await page.getByRole('button', { name: 'Enviar un rechazo con hora anterior' }).click();
    await expect(
      page.getByText('Descartado por antigüedad: es más viejo que el último evento aplicado.'),
    ).toBeVisible({ timeout: 30_000 });

    await page.goto('/settings/billing');
    await expect(factValue(page, 'Plan'), 'the stale decline must not change the plan').toHaveText(
      'Pro',
    );

    console.log(
      '[CA-34..37] approved card → applied → Pro; replay → duplicate; stale decline → discarded',
    );
  });

  test('CA-35: a declined card records the decline and leaves the plan untouched', async ({
    page,
  }) => {
    await signIn(page);

    await buyPlan(page, 'Business', DECLINED_CARD);

    // `declined` is a view of `applied`: the decline WAS recorded, against the
    // checkout row, while the subscription stayed where it was.
    await expect(
      page.getByText('Rechazado: el intento de pago quedó registrado y el plan no cambió.'),
    ).toBeVisible({ timeout: 30_000 });

    await page.goto('/settings/billing');
    await expect(factValue(page, 'Plan'), 'a declined payment must not grant the plan').toHaveText(
      'Free',
    );
    await expect(factValue(page, 'Último intento de pago')).toHaveText('Business · Rechazado');

    console.log('[CA-35] declined card → checkout recorded as declined → plan still Free');
  });

  test('CA-36/CA-37: cancellation is scheduled for period end and paying again clears it', async ({
    page,
  }) => {
    await signIn(page);

    await buyPlan(page, 'Pro', APPROVED_CARD);
    await expect(page.getByText('Aplicado: el estado de la suscripción cambió.')).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/settings/billing');
    await expect(factValue(page, 'Plan')).toHaveText('Pro');

    await page.getByRole('button', { name: 'Cancelar renovación' }).click();
    await expect(page.getByText('Cancelación programada')).toBeVisible({ timeout: 30_000 });

    // The plan survives the cancellation request: the period was paid for.
    await expect(factValue(page, 'Plan')).toHaveText('Pro');

    // A new payment clears `cancel_at_period_end`, because the customer is
    // subscribed again. Business is the only purchasable plan from Pro.
    await buyPlan(page, 'Business', APPROVED_CARD);
    await expect(page.getByText('Aplicado: el estado de la suscripción cambió.')).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/settings/billing');
    await expect(factValue(page, 'Plan')).toHaveText('Business');
    await expect(
      page.getByText('Cancelación programada'),
      'a new payment must clear the pending cancellation',
    ).toHaveCount(0);

    console.log('[CA-36/37] cancel → scheduled; re-subscribe → Business, cancellation cleared');
  });

  test('the billing screen is behind authentication', async ({ page }) => {
    await page.goto('/settings/billing');
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });
});
