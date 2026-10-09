/**
 * Empty stand-in for the `server-only` package under Vitest.
 *
 * The real package throws on import outside a React Server Component bundle,
 * which is exactly the behaviour we want in the application and exactly the
 * behaviour that makes server modules untestable in a plain Node runner. Aliasing
 * it to this file (see `../vitest.config.ts`) keeps the import honest — every
 * server module still declares `import 'server-only'` — while letting the test
 * runner load it.
 *
 * This file intentionally exports nothing.
 */
export {};
