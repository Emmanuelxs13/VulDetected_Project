import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Sprint 2 · HU-07 (SCRUM-25) — the "new vulnerability" alert, measured.
 *
 * ## What this proves (CA-12)
 *
 * Three claims the sprint criteria make, each checked against the running
 * product rather than a mock:
 *
 *   1. A scan that finds nothing new sends NO alert. The previous alert exists
 *      only when something changed, so the reader can trust it.
 *   2. When a critical finding appears that the previous comparable scan did
 *      not have, an alert IS queued.
 *   3. That alert reaches the mailbox in under 60 seconds, and it names only
 *      the new finding — not the criticals that were already there.
 *
 * ## How the "new" condition is produced
 *
 * The fixture site can switch SQL injection on and off (`/__demo/sqli/off`).
 * With it off, the SQLi findings disappear; with it on, they come back and the
 * ingest marks them new because the previous completed scan did not contain
 * them. The sensitive-file criticals are present in both scans, so they must
 * not appear in the alert — that is the assertion that distinguishes "new
 * critical" from "critical".
 *
 * ## Why the timestamps come from the product and from Mailpit
 *
 * The start of the measurement is the `scan.completed` event as the product
 * itself records it (the same feed the UI streams). The end is the `Created`
 * timestamp Mailpit assigns when the message arrives. Neither is a stopwatch
 * around a mocked call, so the number reported is the number a user lives
 * through.
 */

const FIXTURE_BASE = 'http://127-0-0-1.nip.io:8099';
const MAILPIT_BASE = 'http://localhost:8025';
const DEMO_EMAIL = 'demo.pro@vuldetected.local';
const DEMO_PASSWORD = 'VulDetected-Demo-2026!';
const VERIFIED_HOST = '127-0-0-1.nip.io';

/** The alert budget from the sprint criteria, in milliseconds. */
const ALERT_BUDGET_MS = 60_000;

interface MailpitMessage {
  ID: string;
  Subject: string;
  Created: string;
  To: Array<{ Address: string }>;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Switches the fixture's SQL injection endpoint on or off. */
async function setSqli(request: APIRequestContext, enabled: boolean): Promise<void> {
  const response = await request.post(`${FIXTURE_BASE}/__demo/sqli/${enabled ? 'on' : 'off'}`);
  expect(response.ok(), 'fixture toggle must answer').toBe(true);

  const state = await (await request.get(`${FIXTURE_BASE}/__demo/state`)).json();
  expect(state.sqliEnabled, 'fixture must actually be in the requested state').toBe(enabled);
}

/**
 * Submits a scan through the real form and returns the scan id.
 *
 * The verified domain skips the ownership step, so the form lands directly on
 * the target URL field — the same two clicks the presenter makes.
 */
async function submitScan(page: Page): Promise<string> {
  await page.goto('/scanner');
  await page.locator('input[name="hostname"]').fill(VERIFIED_HOST);
  await page.getByRole('button', { name: 'Solicitar reto de verificación' }).click();

  await page.locator('input[name="targetUrl"]').fill(`${FIXTURE_BASE}/`);
  await page.getByRole('button', { name: 'Escanear', exact: true }).click();

  const progressLink = page.getByRole('link', { name: 'Ver progreso del escaneo' });
  await expect(progressLink).toBeVisible({ timeout: 30_000 });

  const href = await progressLink.getAttribute('href');
  expect(href, 'the queued alert must link to the scan').toMatch(/^\/scans\/[0-9a-f-]{36}$/);

  return href!.split('/').pop()!;
}

/**
 * Waits for the scan to close and returns the moment the product recorded it.
 *
 * `scan.completed` is ingested just before the row is closed, so measuring from
 * it is the conservative choice: it starts the clock slightly EARLY, which can
 * only make the reported latency larger than the real one.
 */
async function waitForClose(page: Page, scanId: string): Promise<Date> {
  await page.goto(`/scans/${scanId}`);
  await expect(page.getByText(/Completado/).first()).toBeVisible({ timeout: 180_000 });

  const response = await page.request.get(`/api/scans/${scanId}/events`);
  expect(response.ok()).toBe(true);

  const body = (await response.json()) as {
    events: Array<{ type: string; createdAt: string }>;
  };
  const completed = body.events.find((event) => event.type === 'scan.completed');
  expect(completed, 'the scan must publish a scan.completed event').toBeDefined();

  return new Date(completed!.createdAt);
}

/** Lists the alerts for the demo mailbox, newest first. */
async function listAlerts(request: APIRequestContext): Promise<MailpitMessage[]> {
  const response = await request.get(`${MAILPIT_BASE}/api/v1/messages?limit=100`);
  expect(response.ok(), 'Mailpit must be reachable (it runs under dev:all)').toBe(true);

  const body = (await response.json()) as { messages: MailpitMessage[] };

  return body.messages.filter(
    (message) =>
      message.Subject.includes('Hallazgo crítico') &&
      message.To.some((recipient) => recipient.Address === DEMO_EMAIL),
  );
}

/** The plain-text body of one message. */
async function readBody(request: APIRequestContext, id: string): Promise<string> {
  const response = await request.get(`${MAILPIT_BASE}/api/v1/message/${id}`);
  expect(response.ok()).toBe(true);

  const body = (await response.json()) as { Text?: string; HTML?: string };

  return body.Text ?? body.HTML ?? '';
}

test.describe('Sprint 2 — HU-07 alert', () => {
  test('CA-12: only a NEW critical alerts, and it arrives in under 60 s', async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000);

    await signIn(page);

    // ── Baseline: the target has no SQL injection, so nothing is new ────────
    await setSqli(request, false);
    const quietScan = await submitScan(page);
    const quietClosedAt = await waitForClose(page, quietScan);

    // Give the dispatcher (5 s poll) a full cycle plus slack to prove silence.
    await page.waitForTimeout(20_000);

    const alertsAfterQuietScan = (await listAlerts(request)).filter(
      (message) => new Date(message.Created) >= quietClosedAt,
    );
    expect(
      alertsAfterQuietScan.map((message) => message.Subject),
      'a scan with no new critical must not alert',
    ).toEqual([]);

    // ── The vulnerability appears ───────────────────────────────────────────
    await setSqli(request, true);
    const loudScan = await submitScan(page);
    const loudClosedAt = await waitForClose(page, loudScan);

    // ── The alert arrives within the budget ────────────────────────────────
    const deadline = Date.now() + 90_000;
    let alert: MailpitMessage | undefined;
    while (Date.now() < deadline && alert === undefined) {
      alert = (await listAlerts(request)).find(
        (message) => new Date(message.Created) >= loudClosedAt,
      );
      if (alert === undefined) {
        await page.waitForTimeout(2_000);
      }
    }

    expect(alert, 'a new critical must produce an alert').toBeDefined();

    const latencyMs = new Date(alert!.Created).getTime() - loudClosedAt.getTime();
    expect(latencyMs, `alert latency ${latencyMs} ms must be under ${ALERT_BUDGET_MS} ms`).toBeLessThan(
      ALERT_BUDGET_MS,
    );

    // Reported so the sprint manual can quote a real number instead of a guess.
    console.log(
      `[CA-12] alert latency: ${latencyMs} ms from scan.completed to mailbox ` +
        `(budget ${ALERT_BUDGET_MS} ms)`,
    );
    test.info().annotations.push({
      type: 'alert-latency',
      description: `${latencyMs} ms from scan.completed to mailbox (budget ${ALERT_BUDGET_MS} ms)`,
    });

    // ── The alert names the new finding and nothing else ────────────────────
    const body = await readBody(request, alert!.ID);

    expect(body).toContain('SQL injection');
    expect(
      body,
      'criticals that were already present are not news and must not be in the alert',
    ).not.toMatch(/sensitive/i);
  });
});
