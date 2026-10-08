import type { Sql } from 'postgres';

import { bindDb, createPool, type VulDetectedDb } from './client';
import { schema } from './schema';

/**
 * Lazy database singleton.
 *
 * WHY LAZY, and this is a correctness requirement rather than a nicety:
 * an eager `export const db = createDb(process.env.DATABASE_URL)` would resolve
 * `DATABASE_URL` at module-evaluation time, which Next does while collecting
 * the module graph of every route during `next build`. A build would then need a
 * live database and a populated `.env` — so CI could not build without
 * production credentials, and a developer could not build before starting
 * Postgres.
 *
 * Deferring to the first query keeps `DATABASE_URL` a **runtime** concern: the
 * build validates types and CSS, and the first *request* validates
 * configuration. A misconfigured environment then fails at request time, which
 * is the only point at which it can be reported usefully.
 *
 * The URL is read inside the function rather than captured at module scope so
 * Next's `.env` loading — which runs before the first request, not during
 * build-time module evaluation — is actually effective.
 *
 * ONE POOL, ONE HANDLE. The `db` below is derived from the same `client`, not
 * created independently. An earlier version called `createDb()` and
 * `postgres()` in two separate lazy getters, which meant a process that called
 * both held two pools — up to ten Postgres backends — and `closeDb()` closed
 * only the one `getDbClient()` happened to create, silently leaking the other.
 * The comment claiming "the first caller wins" described an intention the code
 * did not implement.
 */

/** The one pooled postgres.js client for this process. */
let client: Sql | null = null;
/** The Drizzle handle wrapping `client`. Derived, never independently built. */
let db: VulDetectedDb | null = null;

function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error(
      '@vuldetected/db: DATABASE_URL is not set.\n' +
        'Copy the repository root .env.example to .env and set DATABASE_URL.\n' +
        'Thrown on first database access, not at import time, so `next build` succeeds ' +
        'without a running database (docs/adr/0004-database-provider-neutrality.md).',
    );
  }
  return url;
}

/**
 * Returns the process-wide Drizzle handle, creating the pool on first use.
 *
 * The pool is deliberately small and `prepare: false` — see the notes in
 * `client.ts`, which are the ones that matter for provider neutrality.
 */
export function getDb(): VulDetectedDb {
  if (db === null) {
    client ??= createPool(readDatabaseUrl());
    db = bindDb(client);
  }
  return db;
}

/**
 * The underlying postgres.js client — the SAME pool `getDb()` uses.
 *
 * Needed for `sql.unsafe()` in the rare case that raw SQL is genuinely the right
 * tool (the append-only guard is a constraint, not a query, so this should stay
 * unused). Prefer `getDb()`.
 */
export function getDbClient(): Sql {
  getDb(); // ensures `client` exists
  if (client === null) {
    // Unreachable: `getDb()` either returns or throws. Narrowing the type here
    // rather than with a non-null assertion, so this cannot rot silently.
    throw new Error('@vuldetected/db: pool initialisation failed unexpectedly.');
  }
  return client;
}

/**
 * Closes the pool. For tests and graceful shutdown only.
 *
 * `preserveSessionInDatabase` and real revocation are unrelated to this: sign-out
 * DELETEs the session row regardless. This exists so a test process or a
 * long-running dev server can hand its backends back to the OS.
 *
 * Production does not need it — the process is killed, not asked — and a
 * `close()` racing in-flight queries is worse than exiting.
 */
export async function closeDb(): Promise<void> {
  const current = client;
  // Cleared BEFORE awaiting, so a query issued during shutdown cannot latch onto a
  // pool that is being closed underneath it.
  client = null;
  db = null;

  await current?.end({ timeout: 5 });
}

/**
 * The Drizzle instance bound to an explicitly supplied client. Exported for
 * tests that need to swap the pool; production code uses `getDb()`.
 */
export function createDbFrom(clientInstance: Sql): VulDetectedDb {
  return bindDb(clientInstance);
}

export { schema };
export type { VulDetectedDb };
