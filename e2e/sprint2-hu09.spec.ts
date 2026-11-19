import { execFileSync } from 'node:child_process';

import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 2 · HU-09 (SCRUM-26) — the executive PDF, downloaded from the product.
 *
 * ## What this proves that the unit tests cannot
 *
 * `lib/reports/sprint2-hu09.test.ts` proves the document's content. This spec
 * proves the route in front of it: an authenticated owner presses the export
 * control on a real scan page, the browser receives an attachment with the
 * expected name, and the bytes are a PDF that ends with a trailer. That is the
 * path a reader actually takes.
 *
 * ## Why it scans first instead of reusing old rows
 *
 * A hard-coded scan id would break the moment the demo database is reset, and
 * the point of this sprint is a verification that survives a clean environment.
 * The scan takes about twenty seconds and produces the findings the document
 * then reports.
 */

const FIXTURE_BASE = 'http://127-0-0-1.nip.io:8099';
const DEMO_EMAIL = 'demo.pro@vuldetected.local';
const DEMO_PASSWORD = 'VulDetected-Demo-2026!';
const VERIFIED_HOST = '127-0-0-1.nip.io';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe('Sprint 2 — HU-09', () => {
  test.beforeAll(() => {
    // One scan here, but the budget is shared with every other Sprint 2 file.
    execFileSync('node', ['apps/web/scripts/demo/clear-scan-limit.mjs'], { stdio: 'pipe' });
  });

  test('CA-09: a completed scan exports an executive PDF the owner can download', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    await signIn(page);

    // ── Produce a completed scan through the real form ──────────────────────
    await page.goto('/scanner');
    await page.locator('input[name="hostname"]').fill(VERIFIED_HOST);
    await page.getByRole('button', { name: 'Solicitar reto de verificación' }).click();
    await page.locator('input[name="targetUrl"]').fill(`${FIXTURE_BASE}/`);
    await page.getByRole('button', { name: 'Escanear', exact: true }).click();

    const progressLink = page.getByRole('link', { name: 'Ver progreso del escaneo' });
    await expect(progressLink).toBeVisible({ timeout: 30_000 });
    const href = await progressLink.getAttribute('href');
    expect(href).toMatch(/^\/scans\/[0-9a-f-]{36}$/);
    const scanId = href!.split('/').pop()!;

    await page.goto(`/scans/${scanId}`);
    await expect(page.getByText(/Completado/).first()).toBeVisible({ timeout: 180_000 });

    // ── Download the document ───────────────────────────────────────────────
    const exportLink = page.getByRole('link', { name: 'Exportar PDF (Ejecutivo)' });
    await expect(exportLink).toBeVisible();

    const [download] = await Promise.all([
      // The first request compiles the route; later ones are much faster, but
      // the wait has to cover the cold start.
      page.waitForEvent('download', { timeout: 120_000 }),
      exportLink.click(),
    ]);

    // The name tells the reader which domain and which run the file belongs to.
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^vuldetected-${VERIFIED_HOST.replace(/\./g, '\\.')}-[0-9a-f]{8}\\.pdf$`),
    );

    const path = await download.path();
    expect(path, 'the download must be written to disk').toBeTruthy();

    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(path!);

    // A real PDF: header, cross-reference table and trailer.
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.toString('latin1')).toContain('%%EOF');
    expect(bytes.length, 'a report with findings is not an empty file').toBeGreaterThan(2_000);

    console.log(`[CA-09] executive PDF downloaded: ${bytes.length} bytes, ${download.suggestedFilename()}`);
  });
});
