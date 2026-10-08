/**
 * Drizzle Kit configuration.
 *
 * `generate` is a pure diff operation: it compares the Drizzle schema against
 * the last snapshot in `./drizzle/meta` and writes SQL. It opens **no** database
 * connection, which is why the SQL can be authored and reviewed without a
 * running Postgres (ADR 0004 — provider neutrality).
 *
 * `migrate` is the only command that connects, and it connects through
 * `DATABASE_URL` and nothing else. There is deliberately no admin URL, no
 * socket path, and no service hostname anywhere in this file.
 */

import type { Config } from 'drizzle-kit';

/**
 * `dbCredentials.url` is only read by `push` and `migrate`. `generate` does not
 * need it, but drizzle-kit still validates the config, so we resolve the value
 * lazily and let the missing-variable failure surface from the command that
 * actually requires a database.
 */
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error(
      'DATABASE_URL is not set.\n' +
        'Copy the repository root .env.example to .env and set DATABASE_URL, or export it:\n' +
        '  $env:DATABASE_URL = "postgresql://<user>:<password>@<host>:5432/<database>?schema=public"\n' +
        'There is no default and no fallback host: the data layer is provider-neutral ' +
        '(docs/adr/0004-database-provider-neutrality.md).',
    );
  }
  return url;
}

export default {
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    get url(): string {
      return requireDatabaseUrl();
    },
  },
  // Fail loudly rather than silently coercing a value. A stray `::text` cast in
  // generated SQL is a review smell; a build error is a signal.
  strict: true,
  verbose: true,
} satisfies Config;
