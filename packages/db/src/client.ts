import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import { schema } from './schema';

/**
 * The product's single connection factory.
 *
 * PROVIDER NEUTRALITY (ADR 0004) lives or dies in this file. The rules it
 * enforces, and the reason each one is a rule rather than a style preference:
 *
 *   1. **The only input is a URL.** No host, port, user or database name is
 *      assembled here. `postgres()` parses whatever it is given, so a Supabase
 *      connection string and a local one are the same code path — switching
 *      providers is one environment variable, not a branch in code.
 *   2. **No unix socket.** Nothing here can express `/var/run/postgresql`, which
 *      is machine-specific and meaningless to a managed provider.
 *   3. **No service hostname.** The strings `postgres`, `db`, `localhost` and
 *      `127.0.0.1` must never appear in this package. They belong in the compose
 *      file and in `DATABASE_URL`, which is an environment concern.
 *
 * A reviewer can check rule 3 with `grep` in two seconds. That is the whole
 * point of funnelling every connection through one factory.
 */
export type VulDetectedDb = PostgresJsDatabase<typeof schema>;

export interface CreateDbOptions {
  /**
   * Maximum pooled connections. Kept low on purpose: each postgres.js connection
   * is a real Postgres backend, and most managed providers bill for them and
   * cap the total. The correct value depends on the provider (see
   * `docs/decisions-pending.md`), so it is overridable — but the default is
   * chosen for the *cheap* end of the range, because the failure mode of a too
   * small pool is latency and the failure mode of a too large one is a bill and
   * an outage.
   */
  max?: number;
  /**
   * TLS is not configured here on purpose. `postgres.js` reads `sslmode` from
   * the connection string, so a managed provider's `?sslmode=require` is honoured
   * through the URL alone. Hardcoding `ssl: 'require'` would break local
   * development, and branching on the hostname would be the exact provider
   * awareness ADR 0004 forbids.
   */
  idleTimeout?: number;
  connectTimeout?: number;
}

const DEFAULT_MAX = 5;

/**
 * Builds a pooled postgres.js client.
 *
 * Separated from `createDb()` so that the caller can hold BOTH the pool and the
 * Drizzle handle derived from it. That matters because a Drizzle database object
 * does not expose the client it wraps, so a handle created on its own cannot
 * later be closed — and a module that hands out two independently-created pools
 * under the name "singleton" is not a singleton at all.
 */
export function createPool(url: string, options: CreateDbOptions = {}): Sql {
  if (typeof url !== 'string' || url.trim() === '') {
    // Loud, early, and unmissable: a misconfigured environment should not
    // surface as an authentication error twenty stack frames later.
    throw new Error(
      '@vuldetected/db: createPool() requires a connection URL. ' +
        'Set DATABASE_URL (see the repository root .env.example). ' +
        'There is intentionally no default host — the data layer is provider-neutral ' +
        '(docs/adr/0004-database-provider-neutrality.md).',
    );
  }

  return postgres(url, {
    max: options.max ?? DEFAULT_MAX,
    idle_timeout: options.idleTimeout ?? 20,
    connect_timeout: options.connectTimeout ?? 20,
    // `prepare: false` is the required setting for a pooled connection against a
    // transaction-mode pooler (PgBouncer, which Supabase hands out by default).
    // Without it, Postgres prepared statements are bound to one backend and the
    // second connection from the pool fails with "prepared statement does not
    // exist". It costs a re-parse per query and buys provider neutrality.
    prepare: false,
  });
}

/**
 * Wraps an existing postgres.js client in a Drizzle handle.
 *
 * The schema is attached here, which is what enables `db.query.users.findFirst()`
 * — the relational API that Better Auth's `databaseHooks` use.
 */
export function bindDb(client: Sql): VulDetectedDb {
  return drizzle(client, { schema });
}

/**
 * One-shot convenience: pool + handle, with no way to close the pool.
 *
 * Convenient for one-off scripts. Application code should use `createPool()` plus
 * `bindDb()` (or `getDb()`/`getDbClient()`) so the pool has an owner and can be
 * closed during shutdown.
 */
export function createDb(url: string, options: CreateDbOptions = {}): VulDetectedDb {
  return bindDb(createPool(url, options));
}
