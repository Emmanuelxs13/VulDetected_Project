import { expect, test } from '@playwright/test';

/**
 * Sprint 1 verification, driven through a real browser.
 *
 * ## What this proves that the vitest suite cannot
 *
 * The vitest E2E suite exercises route handlers against an in-process database.
 * It never renders a page, never sets a session cookie and never presses a
 * button. Every claim in `PRUEBA_SPRINT_1.md` about "the user can do X" needs a
 * run where a browser actually does X against the real stack: Next.js, the real
 * Postgres, the real Redis broker and the real Python worker.
 *
 * ## Why the tests are serial
 *
 * They share one account and one verified domain, and test 3 produces the scan
 * that test 4 downloads. Independent tests would each need their own seeded
 * account, which would make the spec slower without making it more honest.
 *
 * ## What it deliberately does NOT claim
 *
 * The scan engine is a versioned adapter pair (Nuclei/ZAP) with a fixture-tested
 * normalisation layer. Unless `NUCLEI_BIN` or `ZAP_API_URL` is set, the worker
 * runs its built-in HTTP probes. This spec therefore proves the pipeline, the
 * ownership gate and the reporting surface, not that a third-party engine ran.
 */
test.describe.configure({ mode: 'serial' });

const DEMO_EMAIL = 'demo.pro@vuldetected.local';
const DEMO_PASSWORD = 'VulDetected-Demo-2026!';
const VERIFIED_HOST = '127-0-0-1.nip.io';
const TARGET_URL = `http://${VERIFIED_HOST}:8099`;

test.describe('Sprint 1 — flujo completo', () => {
  test('CA-01/CA-14: inicia sesión y llega al panel', async ({ page }) => {
    await page.goto('/login');

    await page.locator('input[name="email"]').fill(DEMO_EMAIL);
    await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
    await page.locator('form button[type="submit"]').click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('CA-14: la superficie de verificación reporta la sesión viva', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(DEMO_EMAIL);
    await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto('/dev/sprint-1');
    await expect(page.getByText(DEMO_EMAIL)).toBeVisible();
    // The live table reads the session row on this request: "presente" is the
    // value rendered only when a session actually exists.
    await expect(page.getByRole('row', { name: /Sesión\s+presente/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Correo verificado\s+sí/ })).toBeVisible();
  });

  test('CA-02/CA-03: el dominio verificado habilita el escaneo', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(DEMO_EMAIL);
    await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto('/scans');
    await expect(page.getByText(VERIFIED_HOST).first()).toBeVisible();

    await page.locator('input[name="hostname"]').fill(VERIFIED_HOST);
    await page.getByRole('button', { name: 'Solicitar reto de verificación' }).click();

    // The domain is already proven for this account, so the flow skips the
    // challenge and lands on the target step.
    await expect(page.locator('input[name="targetUrl"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('input[name="targetUrl"]').fill(TARGET_URL);
    await page.getByRole('button', { name: 'Escanear', exact: true }).click();

    await expect(page.getByText('Escaneo en cola')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Ver progreso del escaneo' })).toBeVisible();
  });

  test('CA-04/CA-05: el escaneo termina y produce hallazgos', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(DEMO_EMAIL);
    await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto('/scans');
    await page.locator('input[name="hostname"]').fill(VERIFIED_HOST);
    await page.getByRole('button', { name: 'Solicitar reto de verificación' }).click();
    await page.locator('input[name="targetUrl"]').fill(TARGET_URL);
    await page.getByRole('button', { name: 'Escanear', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Ver progreso del escaneo' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('link', { name: 'Ver progreso del escaneo' }).click();

    await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}/, { timeout: 30_000 });
    // The pipeline is real: the worker has to pick the job up, probe the fixture
    // and post the callback back.
    await expect(page.getByText('Completado').first()).toBeVisible({ timeout: 150_000 });

    await expect(page.getByRole('heading', { name: /Hallazgos/i }).first()).toBeVisible();
  });

  test('CA-09: el informe PDF descarga con la sesión del dueño', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(DEMO_EMAIL);
    await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto('/reports');
    const pdfLink = page.locator('a[href*="/export/pdf"]').first();
    await expect(pdfLink).toBeVisible({ timeout: 20_000 });
    const pdfHref = await pdfLink.getAttribute('href');
    expect(pdfHref).toBeTruthy();

    const response = await page.request.get(pdfHref!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect(response.headers()['cache-control']).toContain('no-store');
    const body = await response.body();
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
