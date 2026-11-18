import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Sprint 2 · HU-06 (SCRUM-19) — cancelling a running scan, measured.
 *
 * ## What this proves
 *
 *   - CA-20: the user can cancel a scan that is already running.
 *   - CA-21: the worker stops promptly (the criteria ask for ≤ 10 s), and the
 *     findings collected so far are KEPT. ADR 0024 marks the run partial so it
 *     cannot be mistaken for a complete one.
 *   - CA-22: the cancellation is communicated by email.
 *
 * ## Why the fixture is slowed down
 *
 * A scan of the demo target finishes in about twenty seconds, which leaves a
 * narrow and racy window to press a button. The fixture can delay every response
 * (`/__demo/slow/ms`), so the scan stays in `running` long enough for a person —
 * or this spec — to cancel it deliberately. The delay is reset afterwards.
 *
 * ## What "the worker stopped" means here
 *
 * The row turns `cancelled` the moment the user confirms, because the web app
 * owns that state. That is not the worker stopping: it is the durable decision.
 * The worker stops when it notices the flag and publishes `scan.cancelled`, so
 * that event's timestamp is what this spec measures against.
 */

const FIXTURE_BASE = 'http://127-0-0-1.nip.io:8099';
const MAILPIT_BASE = 'http://localhost:8025';
const DEMO_EMAIL = 'demo.pro@vuldetected.local';
const DEMO_PASSWORD = 'VulDetected-Demo-2026!';
const VERIFIED_HOST = '127-0-0-1.nip.io';

/** The stop budget from the sprint criteria, in milliseconds. */
const STOP_BUDGET_MS = 10_000;

interface StreamEvent {
  type: string;
  createdAt: string;
}

async function setSlow(request: APIRequestContext, ms: number): Promise<void> {
  const response = await request.post(`${FIXTURE_BASE}/__demo/slow/ms?value=${ms}`);
  expect(response.ok()).toBe(true);
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function submitScan(page: Page): Promise<string> {
  await page.goto('/scanner');
  await page.locator('input[name="hostname"]').fill(VERIFIED_HOST);
  await page.getByRole('button', { name: 'Solicitar reto de verificación' }).click();

  await page.locator('input[name="targetUrl"]').fill(`${FIXTURE_BASE}/`);
  await page.getByRole('button', { name: 'Escanear', exact: true }).click();

  const progressLink = page.getByRole('link', { name: 'Ver progreso del escaneo' });
  await expect(progressLink).toBeVisible({ timeout: 30_000 });

  const href = await progressLink.getAttribute('href');
  expect(href).toMatch(/^\/scans\/[0-9a-f-]{36}$/);

  return href!.split('/').pop()!;
}

async function readEvents(page: Page, scanId: string): Promise<StreamEvent[]> {
  const response = await page.request.get(`/api/scans/${scanId}/events`);
  expect(response.ok()).toBe(true);

  const body = (await response.json()) as { events: StreamEvent[] };

  return body.events;
}

/** Polls the event feed until `type` shows up, or the deadline passes. */
async function waitForEvent(
  page: Page,
  scanId: string,
  type: string,
  timeoutMs: number,
): Promise<StreamEvent | undefined> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const found = (await readEvents(page, scanId)).find((event) => event.type === type);
    if (found !== undefined || Date.now() >= deadline) {
      return found;
    }
    await page.waitForTimeout(500);
  }
}

test.describe('Sprint 2 — HU-06', () => {
  test.afterAll(async ({ request }) => {
    // Leave the fixture as the other specs expect it.
    await setSlow(request, 0);
  });

  test('CA-20/21/22: cancelling a running scan stops the worker and keeps partial results', async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000);

    await signIn(page);

    // Slow enough that a whole scan takes minutes, short enough that the first
    // check finishes and leaves real findings to preserve.
    await setSlow(request, 1_200);

    const scanId = await submitScan(page);

    // CA-20: the cancel control only exists while the scan is active.
    await page.goto(`/scans/${scanId}`);
    const cancelButton = page.getByRole('button', { name: 'Cancelar escaneo' });
    await expect(cancelButton).toBeVisible({ timeout: 60_000 });

    // Wait until at least one check finished: cancelling before any finding
    // exists would prove nothing about keeping partial results.
    const firstCheck = await waitForEvent(page, scanId, 'check.completed', 120_000);
    expect(firstCheck, 'the slow scan must complete at least one check').toBeDefined();

    const cancelledAtMs = Date.now();
    await cancelButton.click();

    // The durable decision is immediate and user-visible.
    await expect(page.getByText('Cancelado').first()).toBeVisible({ timeout: 20_000 });

    // The worker's own stop is what the criteria budget.
    const stopped = await waitForEvent(page, scanId, 'scan.cancelled', 30_000);
    expect(stopped, 'the worker must publish scan.cancelled when it stops').toBeDefined();

    const stopLatencyMs = new Date(stopped!.createdAt).getTime() - cancelledAtMs;
    console.log(
      `[CA-21] worker stop latency: ${stopLatencyMs} ms from the click to scan.cancelled ` +
        `(budget ${STOP_BUDGET_MS} ms)`,
    );
    expect(
      stopLatencyMs,
      `the worker must stop within ${STOP_BUDGET_MS} ms, took ${stopLatencyMs} ms`,
    ).toBeLessThan(STOP_BUDGET_MS);

    // ADR 0024: the partial results are kept and the run says so.
    //
    // The worker publishes `scan.cancelled` and THEN posts the terminal
    // callback that sets `partial` and stores the findings, so the first reload
    // can race the callback. Retrying the reload is the honest wait: the page
    // is a server render, and nothing on it updates itself after the scan closed.
    //
    // The inner timeout is deliberately short: with the default 30 s, the first
    // attempt would consume the whole retry budget and never reload again.
    await expect(async () => {
      await page.reload();
      await expect(page.getByText('Resultados parciales').first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });

    const allFindings = page.getByRole('link', { name: /^Todos \(\d+\)$/ });
    await expect(allFindings).toBeVisible({ timeout: 20_000 });

    const total = Number((await allFindings.innerText()).match(/\((\d+)\)/)?.[1] ?? '0');
    console.log(`[ADR 0024] findings preserved by the cancelled scan: ${total}`);
    expect(total, 'findings collected before the stop must be preserved').toBeGreaterThan(0);

    // CA-22: the cancellation is communicated by email.
    const deadline = Date.now() + 60_000;
    let cancelledMail = false;
    while (Date.now() < deadline && !cancelledMail) {
      const response = await request.get(`${MAILPIT_BASE}/api/v1/messages?limit=100`);
      expect(response.ok()).toBe(true);

      const body = (await response.json()) as {
        messages: Array<{ Subject: string; Created: string; To: Array<{ Address: string }> }>;
      };

      cancelledMail = body.messages.some(
        (message) =>
          message.Subject.includes('Escaneo cancelado') &&
          message.To.some((recipient) => recipient.Address === DEMO_EMAIL) &&
          new Date(message.Created).getTime() >= cancelledAtMs,
      );

      if (!cancelledMail) {
        await page.waitForTimeout(2_000);
      }
    }

    expect(cancelledMail, 'a cancellation must send the cancellation email').toBe(true);
  });
});
