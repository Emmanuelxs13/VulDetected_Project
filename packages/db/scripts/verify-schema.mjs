#!/usr/bin/env node
/**
 * Verifies that a database has the schema this package's migrations describe.
 *
 * ## WHY THIS EXISTS
 *
 * `drizzle-kit migrate` reports success when it applies the files it queued. On a
 * fresh database that is the whole story; on a database that was ever prepared
 * with `drizzle-kit push` — which creates the tables without writing the journal
 * — it is not: the journal is empty, so the first `migrate` either replays
 * everything or fails halfway, and nothing compares the result against what the
 * migrations say should be there.
 *
 * The deploy path (`infra/docker-compose.prod.yml`) runs this right after
 * `db:migrate` and refuses to start the app if it fails, so a container never
 * comes up against a half-migrated schema.
 *
 * ## WHY THE EXPECTATION IS READ FROM THE MIGRATION FILES
 *
 * A hand-maintained list of table names is a second copy of the schema, and the
 * copy is what gets forgotten. The `.sql` files are the definition: whatever they
 * create is what must exist, by construction. This also catches the failure mode
 * a Drizzle user actually hits — adding a table module but forgetting to
 * re-export it from `schema/index.ts`, which means `generate` never emitted its
 * `CREATE TABLE` and the app queries a table that was never created.
 *
 * ## EXIT CODES
 *
 * 0 = the schema matches. 1 = it does not (the message names what is missing).
 * This script is meant to be run by a process supervisor, so it must fail loudly.
 *
 * ## WHY THE JOURNAL CHECK IS CONDITIONAL
 *
 * A database prepared with `drizzle-kit push` has the tables but an empty
 * journal, because `push` never writes one. That is a normal local setup, so a
 * journal mismatch is only fatal when `NODE_ENV=production` or `--strict` is
 * passed — which is exactly the case that matters: the migrator image and the
 * deploy, where the journal is what the next release trusts.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

/** `CREATE TABLE "users"` and `CREATE TABLE IF NOT EXISTS "users"` both count. */
const CREATE_TABLE = /CREATE TABLE (?:IF NOT EXISTS )?"?([a-zA-Z0-9_]+)"?/g;

/**
 * Comments are stripped before matching. A prose line such as
 * `-- Postgres has to know the type at CREATE TABLE time` would otherwise be
 * parsed as a table called `time`.
 */
function stripComments(sqlText) {
  return sqlText
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

async function expectedTables() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();

  if (files.length === 0) {
    throw new Error(`no .sql migrations found in ${MIGRATIONS_DIR}`);
  }

  const names = new Set();
  for (const file of files) {
    const sqlText = stripComments(await readFile(join(MIGRATIONS_DIR, file), 'utf8'));
    for (const match of sqlText.matchAll(CREATE_TABLE)) {
      names.add(match[1]);
    }
  }

  return { files, names: [...names].sort() };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set; nothing to verify against.');
    process.exit(1);
  }

  const { files, names } = await expectedTables();
  const sql = postgres(url, { max: 1, connect_timeout: 10 });

  try {
    const rows = await sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `;
    const present = new Set(rows.map((row) => row.table_name));

    // The journal table is created by drizzle-kit itself, in its own schema. It
    // is the record of which files were applied, so comparing its size against
    // the number of files catches a migration directory the journal never saw.
    // A database that was never migrated has no journal at all: that is zero
    // applied migrations, not an error to throw.
    const journalExists = await sql`
      select to_regclass('drizzle.__drizzle_migrations') is not null as present
    `;
    const applied = journalExists[0].present
      ? (await sql`select count(*)::int as applied from drizzle.__drizzle_migrations`)[0].applied
      : 0;

    const missing = names.filter((name) => !present.has(name));

    // Two classes of problem, with different audiences.
    //
    // A missing table is always fatal: the application queries it, so there is
    // nothing to run against.
    //
    // A journal that disagrees with the migration directory is fatal only where
    // the journal is what the next deploy will trust — production and the
    // migrator image. Locally, `drizzle-kit push` creates the tables without
    // writing the journal, and failing a developer's `pnpm db:verify` for a
    // legitimate local setup would only teach them to ignore the command.
    const strict = process.env.NODE_ENV === 'production' || process.argv.includes('--strict');

    const problems = [];
    if (missing.length > 0) {
      problems.push(`missing tables created by the migrations: ${missing.join(', ')}`);
    }
    if (applied !== files.length) {
      const detail = `the journal records ${applied} applied migration(s) but ${files.length} .sql file(s) exist`;
      if (strict) {
        problems.push(detail);
      } else {
        console.log(
          `note: ${detail}.\n` +
            '      Expected on a database prepared with `drizzle-kit push`; ' +
            'a deployed database must match.\n' +
            '      Run with --strict (or NODE_ENV=production) to make this fatal.',
        );
      }
    }

    if (problems.length > 0) {
      console.error(`schema verification FAILED against ${redact(url)}`);
      for (const problem of problems) {
        console.error(`  - ${problem}`);
      }
      process.exit(1);
    }

    console.log(
      `schema ok: ${names.length} tables from ${files.length} migrations, ` +
        `${applied} applied (${redact(url)})`,
    );
  } finally {
    await sql.end();
  }
}

/** A connection string carries a password; it must never reach a log. */
function redact(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username ? '***@' : ''}${parsed.host}${parsed.pathname}`;
  } catch {
    return '<unparseable DATABASE_URL>';
  }
}

await main();
