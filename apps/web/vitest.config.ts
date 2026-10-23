import { defineConfig } from 'vitest/config';

import { alias } from './vitest.shared.ts';

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
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
