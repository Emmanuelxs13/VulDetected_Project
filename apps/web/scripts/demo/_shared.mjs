/**
 * Shared plumbing for the demo accelerators.
 *
 * ## Why these scripts live under `apps/web/scripts`
 *
 * They import `postgres` and `redis`, which are dependencies of the web
 * workspace. A script at the repository root would not resolve them under pnpm's
 * isolated `node_modules` layout, and adding a second copy of both drivers at the
 * root to satisfy a demo script is a dependency the product does not need.
 *
 * ## Why every accelerator refuses to run without `DEMO_MODE=true`
 *
 * `lib/env.ts` already refuses to *boot the app* in production with the flag on.
 * These scripts run outside the app, so they repeat the check themselves: a
 * script that rewrites scan history must not be one `NODE_ENV` away from running
 * against a real database.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..', '..');
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');

/**
 * Loads `.env.local` without overriding values the shell already set.
 *
 * Deliberately minimal, and deliberately the same rules as
 * `scripts/dev-all.mjs`: `KEY=value` lines, optional surrounding quotes, `#`
 * comments. A demo script that reads a different dialect than the launcher is a
 * demo script that works for its author and nobody else.
 */
export function loadEnvLocal() {
  for (const path of [resolve(WEB_ROOT, '.env.local'), resolve(REPO_ROOT, '.env')]) {
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

/**
 * Refuses to continue unless the demo profile is armed.
 *
 * Prints the exact command that arms it instead of a generic refusal: the
 * failure mode of "the script said no" is a presenter guessing at flags during a
 * demo.
 */
export function requireDemoMode(scriptName) {
  loadEnvLocal();

  if (process.env.DEMO_MODE !== 'true') {
    console.error(
      `[${scriptName}] Refusing to run: DEMO_MODE is not "true".\n` +
        `  This script rewrites demo data. Arm the demo profile first:\n\n` +
        `    DEMO_MODE=true pnpm ${scriptName}\n\n` +
        `  On Windows PowerShell:\n\n` +
        `    $env:DEMO_MODE="true"; pnpm ${scriptName}\n`,
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(`[${scriptName}] Refusing to run with NODE_ENV=production.`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(`[${scriptName}] DATABASE_URL is required.`);
    process.exit(1);
  }
}

/** Opens the application database. Caller closes it. */
export function openDb() {
  return postgres(process.env.DATABASE_URL, { max: 1 });
}

/**
 * Closes a node-redis client across major versions.
 *
 * node-redis 4 returned a promise from `quit()`; 5+ made `destroy()`
 * synchronous and returning `undefined`. Calling `.catch()` on that `undefined`
 * is a `TypeError` thrown at the very end of a script that had otherwise
 * finished its work — the worst possible failure mode for a demo accelerator,
 * because the data is correct and the exit code still says 1.
 */
export async function closeRedis(client) {
  try {
    if (typeof client.destroy === 'function') {
      await client.destroy();
    } else if (typeof client.quit === 'function') {
      await client.quit();
    }
  } catch {
    // Closing a demo connection is never worth failing the script over.
  }
}

export { REPO_ROOT, WEB_ROOT };
