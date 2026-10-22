import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import { schema } from '../schema';

/**
 * In-process Postgres for end-to-end tests.
 *
 * PGlite is Postgres compiled to WASM, so the suite exercises the same engine
 * semantics the routes rely on — enum types, `GENERATED ALWAYS AS IDENTITY`,
 * `ON CONFLICT DO NOTHING`, and real unique constraints — without Docker or a
 * database server. It is a test-only convenience: production code keeps using
 * `postgres()` through `client.ts` (ADR 0004).
 *
 * The helper lives inside this package rather than in the consumer so the
 * Drizzle instance and the table objects come from the same `drizzle-orm`
 * installation. Mixing two copies (one per workspace) makes the table types
 * nominally incompatible even when the versions match.
 */
export function createPgliteTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  return {
    client,
    db,
    /** Runs one or more statements, as `pg.exec` does. */
    exec: (statements: string) => client.exec(statements),
    close: () => client.close(),
  };
}

export type PgliteTestDb = ReturnType<typeof createPgliteTestDb>;
