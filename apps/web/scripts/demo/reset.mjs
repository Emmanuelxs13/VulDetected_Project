/**
 * `pnpm demo:reset` — return the demo to a known state.
 *
 * ## What "reset" means here, exactly
 *
 * It removes the *scan-domain* data: scans, findings, events, schedules,
 * credentials, notifications, mail and verified domains, plus the sessions that
 * point at them. It keeps the `users` table and re-seeds the three demo accounts,
 * so the presenter does not have to remember whether the accounts survived.
 *
 * It deliberately does NOT drop the schema. A demo reset that requires a
 * migration is a demo reset that can fail in front of an audience for a reason
 * unrelated to the product.
 *
 * ## Why Redis is cleaned too
 *
 * A queued Celery job whose scan row no longer exists will be picked up by the
 * worker and will post a callback for a scan that is gone. That produces error
 * noise in the middle of the demo for no reason. The broker list and the
 * cancellation flags are demo state, so they are cleared with the rest.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from 'redis';

import { REPO_ROOT, WEB_ROOT, closeRedis, openDb, requireDemoMode } from './_shared.mjs';

const SCRIPT = 'demo:reset';

requireDemoMode(SCRIPT);

const sql = openDb();

/** Deletion order follows the foreign keys; `TRUNCATE ... CASCADE` would also
 * work but it hides which table failed, and a demo script is read by people
 * learning the schema. */
const TABLES = [
  'scan_events',
  'findings',
  'notifications',
  'mail_outbox',
  'scans',
  'scan_schedules',
  'scan_credentials',
  'domains',
  'sessions',
  /**
   * `accounts` is cleared too, and this is not cosmetic.
   *
   * It holds both the `credential` rows (the password) and every linked social
   * provider. A leftover Google link turns CA-31's "link this provider to my
   * existing account" into an ordinary sign-in, so the criterion silently stops
   * being exercised on the second run. The seeder below recreates the credential
   * rows, so nothing is lost.
   */
  'accounts',
  'verification_tokens',
];

try {
  await sql.begin(async (tx) => {
    for (const table of TABLES) {
      const before = await tx`select count(*)::int as n from ${tx(table)}`;
      await tx`delete from ${tx(table)}`;
      console.log(`  ${table.padEnd(20)} deleted ${before[0].n}`);
    }
  });

  // The fixture's ownership proof belongs to a domain that no longer exists.
  const tokenFile = resolve(REPO_ROOT, 'e2e', 'fixtures', 'vulnerable-site', 'token.txt');
  writeFileSync(tokenFile, '', 'utf8');
  console.log('  fixture token.txt   cleared');
} finally {
  await sql.end();
}

// Re-seed the demo accounts through the existing seeder so there is exactly one
// definition of "a demo account" in the repository.
const seed = spawnSync(process.execPath, [resolve(WEB_ROOT, 'scripts', 'seed-demo-users.mjs')], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});
if (seed.status !== 0) {
  console.error(`[${SCRIPT}] demo user seeding failed with exit code ${seed.status}`);
  process.exit(seed.status ?? 1);
}

// Redis: the Celery broker list and every cancellation flag.
if (process.env.REDIS_URL) {
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (error) => console.error(`[${SCRIPT}] redis: ${error.message}`));
  try {
    await client.connect();
    const removed = await client.del('celery');
    let cursor = '0';
    let flags = 0;
    do {
      const page = await client.scan(cursor, { MATCH: 'vuldetected:scan:cancel:*', COUNT: 500 });
      cursor = page.cursor;
      if (page.keys.length > 0) {
        await client.del(page.keys);
        flags += page.keys.length;
      }
    } while (cursor !== '0');
    console.log(
      `  redis               broker list cleared (${removed}), ${flags} cancel flags removed`,
    );
  } catch (error) {
    // A reset without Redis still leaves the database clean, which is the part
    // the demo depends on.
    console.warn(`[${SCRIPT}] redis cleanup skipped: ${error.message}`);
  } finally {
    await closeRedis(client);
  }
}

console.log(`\n[${SCRIPT}] Demo reset complete.`);
console.log('  Demo users: demo.free@ / demo.pro@ / demo.business@vuldetected.local');
console.log('  Unverified: demo.sinverificar@vuldetected.local (ADR 0016 negative case)');
console.log('  Password:   VulDetected-Demo-2026!');
