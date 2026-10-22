import { defineConfig } from 'vitest/config';

import { alias } from './vitest.shared.ts';

/**
 * End-to-end runner for the scan pipeline (task 5.3).
 *
 * Deliberately separate from `vitest.config.ts` so `pnpm test` (unit suites,
 * `src/**\/*.test.ts`) and `pnpm test:e2e` (`e2e/**\/*.test.ts`) never mix. The
 * E2E suite has a longer timeout because it drives real route handlers and the
 * SSE poll loop.
 *
 * ## No live services
 *
 * The harness runs against an in-process PGlite database (Postgres compiled to
 * WASM, the same engine Drizzle's `pglite` driver targets), so the suite is
 * green on a machine with no Docker, no Postgres and no Redis. It executes the
 * real Sprint 2 migration SQL and the real Drizzle query builders used by the
 * routes, including the `(scan_id, seq)` unique constraint behind the dedup.
 *
 * `SCANNER_EGRESS_MODE=test` is the hermetic egress mode named by the task. The
 * web process does not read it — the Python worker does — but the E2E run pins
 * it so any child process or future harness that does read it inherits the
 * intended value. The suite asserts it to fail loudly if the config drifts.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['e2e/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      // Shape-valid only. Nothing connects to it: the database under test is
      // the in-process PGlite instance.
      DATABASE_URL: 'postgresql://vuldetected:vuldetected@localhost:5432/vuldetected',
      AUTH_SECRET: 'e2e-only-auth-secret-not-for-production',
      AUTH_URL: 'http://localhost:3000',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      REDIS_URL: 'redis://localhost:6379/0',
      SCANNER_CALLBACK_SECRET: 'dev-scanner-callback-secret',
      SCANNER_EGRESS_MODE: 'test',
      SCAN_EVENTS_DRIVER: 'poll',
    },
  },
});
