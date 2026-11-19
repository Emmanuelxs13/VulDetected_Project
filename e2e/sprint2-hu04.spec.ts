import { execFileSync } from 'node:child_process';

import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 2 · HU-04 (SCRUM-23) — scanning the pages behind a login.
 *
 * ## What this proves
 *
 *   - CA-25: the user can store a form credential for a verified domain.
 *   - CA-26: the scan signs in and reports findings on the private page. The
 *     fixture reflects `?q=` only for a signed-in visitor, so a finding whose
 *     endpoint is `/private` cannot be produced by the anonymous pass.
 *   - CA-27: a credential that does not work fails the scan. It never degrades
 *     into a silent anonymous run, because that would report "all clear" about
 *     pages the scan never opened.
 *
 * ## Why the assertion is an endpoint, not a count
 *
 * The fixture is vulnerable on purpose: the public page has findings too. What
 * distinguishes the authenticated scan is WHERE the findings are, so the spec
 * compares the endpoints of the two runs against the same target.
 *
 * ADR 0020: the target is the local fixture and the SSRF guard is untouched.
 * The result is documented as "cumple en modo demostración".
 */

test.describe.configure({ mode: 'serial' });

const FIXTURE_BASE = 'http://127-0-0-1.nip.io:8099';
const DEMO_EMAIL = 'demo.pro@vuldetected.local';
const DEMO_PASSWORD = 'VulDetected-Demo-2026!';
const VERIFIED_HOST = '127-0-0-1.nip.io';

/** The credentials the fixture accepts (see the fixture's own constants). */
const FIXTURE_USER = 'demo@miapp.local';
const FIXTURE_PASSWORD = 'Fixture-Pass-2026!';
const SUCCESS_MARKER = 'Invoice 2026-001';

const PRIVATE_PATH = '/private';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * Revokes every active credential.
 *
 * The spec has to start from "this domain has no credential", because the
 * anonymous pass is only meaningful then. Revoking through the UI is the honest
 * route: it is the same path a user takes, and it proves the list renders.
 */
async function revokeAllCredentials(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.goto('/settings');

    const revoke = page.getByRole('button', { name: 'Revocar', exact: true });
    if ((await revoke.count()) === 0) {
      return;
    }

    await revoke.first().click();
    await expect(page.getByText('Credencial revocada')).toBeVisible({ timeout: 30_000 });
  }

  throw new Error('could not revoke every credential');
}

async function saveFormCredential(
  page: Page,
  options: { username: string; password: string; marker: string },
): Promise<void> {
  await page.goto('/settings');

  // The `*` that marks a required field is inside the `<label>`, so `exact`
  // text matching never sees the bare word. A regex anchored at the start is
  // unambiguous without being brittle about the asterisk.
  await page.getByLabel(/^Etiqueta/).fill('Área privada del fixture');
  await page.getByLabel(/^Tipo de autenticación/).selectOption('form');

  await page.getByLabel(/^Ruta del formulario de acceso/).fill('/login');
  await page.getByLabel(/^Campo del usuario/).fill('email');
  await page.getByLabel(/^Campo de la contraseña/).fill('password');

  await page.getByLabel(/^Usuario/).fill(options.username);
  await page.getByLabel(/^Contraseña/).fill(options.password);
  await page.getByLabel(/^Texto que confirma la sesión/).fill(options.marker);

  await page.getByRole('button', { name: 'Guardar credencial' }).click();
  await expect(page.getByText('Credencial guardada')).toBeVisible({ timeout: 30_000 });
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

interface ExportedFinding {
  endpoint: string;
  title: string;
  severity: string;
}

/**
 * Waits for the scan to reach a terminal state and returns its exported findings.
 *
 * The terminal event is published by the worker BEFORE the callback that stores
 * the findings, so the export is polled until it stops changing. `settleMs` is a
 * quiet period, not a fixed wait: the first export can legitimately arrive empty
 * for a scan that produced nothing.
 */
async function scanFindings(
  page: Page,
  scanId: string,
  options: { settleMs?: number; timeoutMs?: number } = {},
): Promise<ExportedFinding[]> {
  const settleMs = options.settleMs ?? 3_000;
  const deadline = Date.now() + (options.timeoutMs ?? 240_000);

  for (;;) {
    const eventsResponse = await page.request.get(`/api/scans/${scanId}/events`);
    expect(eventsResponse.ok()).toBe(true);
    const events = (await eventsResponse.json()) as { events: Array<{ type: string }> };
    const terminal = events.events.find((event) =>
      ['scan.completed', 'scan.failed', 'scan.cancelled'].includes(event.type),
    );

    if (terminal) {
      await page.waitForTimeout(settleMs);

      const exportResponse = await page.request.get(`/api/scans/${scanId}/export?format=json`);
      expect(exportResponse.ok()).toBe(true);
      const body = (await exportResponse.json()) as { findings: ExportedFinding[] };

      return body.findings;
    }

    if (Date.now() >= deadline) {
      throw new Error(`scan ${scanId} did not reach a terminal state in time`);
    }

    await page.waitForTimeout(1_000);
  }
}

test.describe('Sprint 2 — HU-04', () => {
  test.beforeAll(async () => {
    // Three scans in one file against a five-per-hour budget. See the script.
    execFileSync('node', ['apps/web/scripts/demo/clear-scan-limit.mjs'], { stdio: 'pipe' });
  });

  test('CA-25/26: an authenticated scan finds the private page an anonymous scan cannot see', async ({
    page,
  }) => {
    test.setTimeout(600_000);

    await signIn(page);
    await revokeAllCredentials(page);

    // 1. The baseline: no credential, so the private page is invisible.
    const anonymousScanId = await submitScan(page);
    const anonymousFindings = await scanFindings(page, anonymousScanId);

    const anonymousPrivate = anonymousFindings.filter((finding) =>
      finding.endpoint.includes(PRIVATE_PATH),
    );

    console.log(
      `[CA-26] anonymous scan: ${anonymousFindings.length} findings, ` +
        `${anonymousPrivate.length} on ${PRIVATE_PATH}`,
    );
    expect(anonymousPrivate, 'an anonymous scan cannot see the private page').toHaveLength(0);

    // 2. The same target, now with a working form credential.
    await saveFormCredential(page, {
      username: FIXTURE_USER,
      password: FIXTURE_PASSWORD,
      marker: SUCCESS_MARKER,
    });

    const authenticatedScanId = await submitScan(page);
    const authenticatedFindings = await scanFindings(page, authenticatedScanId);

    const authenticatedPrivate = authenticatedFindings.filter((finding) =>
      finding.endpoint.includes(PRIVATE_PATH),
    );

    console.log(
      `[CA-26] authenticated scan: ${authenticatedFindings.length} findings, ` +
        `${authenticatedPrivate.length} on ${PRIVATE_PATH} — ` +
        authenticatedPrivate.map((finding) => finding.title).join(' | '),
    );
    expect(
      authenticatedPrivate.length,
      'the authenticated scan must report findings on the private page',
    ).toBeGreaterThan(0);

    // CA-25: the scan says it ran with a credential. A reader cannot otherwise
    // tell why the private pages have findings.
    await page.goto(`/scans/${authenticatedScanId}`);
    await expect(page.getByText('Escaneo autenticado')).toBeVisible({ timeout: 30_000 });

    // The authenticated scan also keeps the public findings: the login adds a
    // pass, it does not replace the anonymous one.
    const authenticatedPublic = authenticatedFindings.filter(
      (finding) => !finding.endpoint.includes(PRIVATE_PATH),
    );
    expect(authenticatedPublic.length).toBeGreaterThan(0);
  });

  test('CA-27: a credential that does not work fails the scan instead of degrading it', async ({
    page,
  }) => {
    test.setTimeout(600_000);

    await signIn(page);
    await revokeAllCredentials(page);

    await saveFormCredential(page, {
      username: FIXTURE_USER,
      password: 'not-the-password',
      marker: SUCCESS_MARKER,
    });

    const scanId = await submitScan(page);
    await scanFindings(page, scanId);

    await page.goto(`/scans/${scanId}`);

    await expect(page.getByText('No se pudo iniciar sesión')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Fallido').first()).toBeVisible();
    await expect(
      page.getByText('El sitio rechazó el usuario o la contraseña guardados.'),
    ).toBeVisible();

    // The scan must NOT claim to be authenticated, and it must not report the
    // private page: it never opened it.
    await expect(page.getByText('Escaneo autenticado')).toHaveCount(0);

    const exported = await scanFindings(page, scanId);
    expect(exported.filter((finding) => finding.endpoint.includes(PRIVATE_PATH))).toHaveLength(0);
  });

  test.afterAll(async ({ browser }) => {
    // Leave the demo target as the other specs expect it: no credential left
    // behind, so the scheduled-scan specs keep exercising the anonymous path.
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    });
    const page = await context.newPage();

    try {
      await signIn(page);
      await revokeAllCredentials(page);
    } finally {
      await context.close();
    }
  });
});
