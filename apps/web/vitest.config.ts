import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest configuration for the web app.
 *
 * `environment: 'node'` is the default because the Sprint 2 units under test are
 * server-side pure functions — URL normalisation, the SSRF guard, the Celery
 * message encoder, the rate limiter, the callback authenticator and the SSE poll
 * cursor. React component tests (Sprint 2 UI, and later) opt into jsdom per file
 * with a `// @vitest-environment jsdom` docblock rather than paying for a DOM in
 * every file.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Mirror the `@/*` -> `./src/*` mapping from tsconfig.json so tests import
      // the same specifiers application code does. `@test/*` covers the shared
      // test helpers in `test/` (e.g. `db-mock.ts`), which sit outside `src/`
      // and therefore outside the `@` alias.
      '@': path.resolve(dirname, 'src'),
      '@test': path.resolve(dirname, 'test'),

      /**
       * `server-only` throws by design when it is not consumed by a React Server
       * Component bundle. Vitest runs in plain Node, so importing any of the
       * server modules under test (`lib/env`, `lib/db`, `lib/audit`, the scan
       * actions) would throw before a single assertion runs. The wall is enforced
       * by Next.js at build time; in tests it is replaced with an empty module.
       */
      'server-only': path.resolve(dirname, 'test/server-only.stub.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
