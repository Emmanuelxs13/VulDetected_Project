import { defineConfig } from 'vitest/config';

/**
 * Root Vitest entry point.
 *
 * Sprint 2 introduces the first test runners in the monorepo. Each workspace owns
 * its own `vitest.config.ts` (environment, include globs, aliases); this root file
 * only aggregates them as Vitest projects so `pnpm test` from the repository root
 * runs every workspace with the correct per-workspace configuration — including
 * the `server-only` alias that `apps/web` needs.
 *
 * The `.mts` extension (rather than `.ts`) keeps Vite from loading this ESM file
 * as CommonJS, which the root package.json does not opt out of.
 *
 * Running `pnpm --filter @vuldetected/web test` still works and uses that
 * workspace's config directly; the two entry points cannot drift because the
 * project list below points at the same config files.
 */
export default defineConfig({
  test: {
    projects: ['apps/web', 'packages/db'],
  },
});
