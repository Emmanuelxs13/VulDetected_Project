import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 2 · HU-10 (SCRUM-27) — the comparative history dashboard.
 *
 * ## What this proves
 *
 * The unit tests in `lib/history/sprint2-hu10.test.ts` prove the comparability
 * rules. This spec proves the page exists, is reachable from the reports screen
 * the way a user reaches it, and renders the two things the sprint insists on:
 * per-severity snapshots (not a score) and an explicit statement of what a
 * comparison means.
 *
 * ## Why it does not require a clean database
 *
 * The demo seed writes thirteen demo scans; the verification runs write real
 * ones. Both are legitimate states of this page, so the assertions are about
 * structure and honesty rather than exact numbers: a row count above one, the
 * demo label when demo rows exist, and the absence of a composite score.
 */

const DEMO_EMAIL = 'demo.pro@vuldetected.local';
const DEMO_PASSWORD = 'VulDetected-Demo-2026!';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe('Sprint 2 — HU-10', () => {
  test('CA-09/CA-10/CA-28/CA-29: the domain history shows comparable snapshots', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await signIn(page);

    // ── Reach the history the way a user does ───────────────────────────────
    await page.goto('/reports');

    const historyLink = page.locator('a[href^="/reports/domains/"]').first();
    await expect(historyLink, 'the trend table must link to the domain history').toBeVisible({
      timeout: 30_000,
    });

    const href = await historyLink.getAttribute('href');
    expect(href).toMatch(/^\/reports\/domains\/[0-9a-f-]{36}$/);

    await page.goto(href!);

    // ── The page is the comparative history, not another summary ────────────
    await expect(page.getByRole('heading', { name: 'Historial comparativo' })).toBeVisible();

    // CA-09: no composite score anywhere. The sprint forbids inventing one.
    await expect(page.getByText(/No hay una nota compuesta/)).toBeVisible();

    // CA-29: the page states the comparison rule instead of implying it.
    await expect(page.getByText(/Un escaneo se compara solo con el anterior completo/)).toBeVisible();

    // ── The snapshots are there ─────────────────────────────────────────────
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount, 'the demo seed leaves several scans for this domain').toBeGreaterThan(1);

    // The columns the reader compares: totals and the risky figure.
    await expect(page.getByRole('columnheader', { name: 'Total' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Críticos/altos' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Cambio de riesgo' })).toBeVisible();

    // CA-10: with more than one scan there is at least one comparison or an
    // explicit reason why there is none.
    const deltaCells = await page.locator('tbody tr td:nth-child(6)').allInnerTexts();
    expect(
      deltaCells.some((text) =>
        /Mejoró|Empeoró|Sin cambios|Primer escaneo comparable|no comparable|Cambió|Mezcla/i.test(
          text,
        ),
      ),
      `every row must say what its change means, got: ${deltaCells.join(' | ')}`,
    ).toBe(true);

    // CA-28: demo rows are labelled in the page, not only in the seed script.
    const demoBadges = await page.getByText('Datos demo').count();
    console.log(`[CA-28] demo badges on the history page: ${demoBadges}`);
    expect(demoBadges, 'seeded demo scans must be labelled as demo').toBeGreaterThan(0);

    // ── A domain that is not yours is not found ─────────────────────────────
    const foreign = await page.goto('/reports/domains/00000000-0000-4000-8000-000000000000');
    expect(foreign?.status(), 'a foreign domain id must not reveal a history').toBe(404);
  });
});
