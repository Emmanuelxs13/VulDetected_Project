import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level verification harness.
 *
 * ## Why a second E2E runner exists
 *
 * `pnpm test:e2e` runs vitest against an in-process PGlite database. That proves
 * the route handlers and the pipeline logic, but it never renders a page, never
 * sets a cookie and never presses a button: it cannot answer "does the product
 * work when a person uses it", which is exactly what the sprint verification
 * asks for. Playwright drives a real browser against the real dev server, the
 * real Postgres, the real Redis and the real scanner worker.
 *
 * The two runners do not overlap: vitest collects `e2e/**\/*.test.ts`, Playwright
 * collects `e2e/**\/*.spec.ts`.
 *
 * ## Why `testDir` is the repository `e2e/` folder
 *
 * The fixture site the demo scans already lives there, so a spec and the target
 * it scans are neighbours and the paths in the documentation stay short.
 *
 * ## Why video and trace are on by default
 *
 * The deliverable for this sprint includes a recorded demo. Recording every run
 * means the video that ships is the video of a run that actually passed, not a
 * separate take that could have been staged.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  // A demo run mutates shared state (scans, schedules, mail), so a retry would
  // hide a real ordering bug behind a second attempt.
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'on',
    screenshot: 'only-on-failure',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  outputDir: 'test-results',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
