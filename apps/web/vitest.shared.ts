import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve aliases shared by the unit (`vitest.config.ts`) and end-to-end
 * (`vitest.e2e.config.ts`) runners.
 *
 * Both entry points must import application code through the same specifiers,
 * so the mapping lives here once. The `server-only` stub matters for every Node
 * test: `server-only` throws unless a React Server Component bundle imports it.
 */
export const alias = {
  // Mirror the `@/*` -> `./src/*` mapping from tsconfig.json so tests import
  // the same specifiers application code does.
  '@': path.resolve(dirname, 'src'),

  // Shared test helpers in `test/` (e.g. `db-mock.ts`) sit outside `src/` and
  // therefore outside the `@` alias.
  '@test': path.resolve(dirname, 'test'),

  // Next.js enforces this wall at build time; in plain Node tests it is
  // replaced with an empty module.
  'server-only': path.resolve(dirname, 'test/server-only.stub.ts'),
};
