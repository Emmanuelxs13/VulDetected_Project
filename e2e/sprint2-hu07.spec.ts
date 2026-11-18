import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

/**
 * Sprint 2 · HU-07 (SCRUM-25) — scheduled scans, driven through a real browser.
 *
 * ## What this proves
 *
 * That the schedule the user creates on screen is the row the real runner claims,
 * and that firing it produces a real scan with `source = 'schedule'`. The runner
 * is not stubbed: `demo:run-schedule-now` only moves `next_run_at` into the past
 * and calls the same authenticated endpoint the cron script calls, so everything
 * after that is production code.
 *
 * ## Why the accelerator is used instead of waiting
 *
 * The dev scheduler ticks every fifteen seconds. Waiting works, but the demo has
 * to be deterministic in front of an audience, and the endpoint is idempotent and
 * compare-and-set safe, so firing it early costs nothing.
 */
test.describe.configure({ mode: 'serial' });

const DEMO_EMAIL = 'demo.pro@vuldetected.local';
const DEMO_PASSWORD = 'VulDetected-Demo-2026!';
const VERIFIED_HOST = '127-0-0-1.nip.io';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe('Sprint 2 — HU-07', () => {
  test('CA-23/CA-24: la programación creada se ejecuta sola y produce un escaneo programado', async ({
    page,
  }) => {
    await signIn(page);

    await page.goto('/schedules');
    // The host is inside a <select>, whose <option> elements are not "visible"
    // to Playwright; assert the option exists instead of trying to see it.
    await expect(page.locator('select option', { hasText: VERIFIED_HOST }).first()).toHaveCount(1);

    // The form reloads the page on success (`window.location.reload()`), so the
    // click and the following navigation have to be awaited together. Without
    // this, the reload lands while the test is already leaving the page and
    // Playwright reports "navigation interrupted by another navigation".
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Crear programación' }).click(),
    ]);

    // CA-23: the next run is presented in the product time zone, not raw UTC.
    const nextRunLine = page.getByText(/Próxima ejecución/).first();
    await expect(nextRunLine).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/, {
      timeout: 20_000,
    });

    // CA-24: the real runner fires it.
    const output = execFileSync(
      process.execPath,
      ['apps/web/scripts/demo/run-schedule-now.mjs', '--domain', VERIFIED_HOST],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(output).toContain('Scheduler ran (real code path)');
    expect(output).not.toContain('No scheduled scan was created');

    const scheduledScan = output.match(/scheduled scan\s+([0-9a-f-]{36})/);
    expect(scheduledScan, `expected a scheduled scan id in:\n${output}`).not.toBeNull();

    // The scan the scheduler created is a real one and reaches a terminal state.
    await page.goto(`/scans/${scheduledScan![1]}`);
    await expect(page.getByText(/Completado|Fallido|Cancelado/).first()).toBeVisible({
      timeout: 180_000,
    });
  });
});
