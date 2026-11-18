/**
 * `pnpm demo:reset-social` — return the social sign-in criteria to their starting
 * point without touching anything else.
 *
 * ## Why `demo:reset` is not enough
 *
 * The full reset deletes every scan, finding and schedule. Running it before a
 * single criterion would throw away the history the other criteria need. This
 * script touches only the three things the social flow mutates:
 *
 *   1. the accounts the simulator created (Ana, Beto, Carla);
 *   2. the Google/GitHub links attached to the existing demo accounts;
 *   3. the sessions those sign-ins left behind.
 *
 * ## Why the links have to go
 *
 * CA-31 is "sign in with Google on an account that already exists". Once
 * `demo.pro@` has a Google link, the next run is an ordinary sign-in and the
 * linking branch is never exercised — the criterion silently stops being tested
 * while still passing. Removing the link restores the condition the criterion
 * describes.
 *
 * ## Why deleting the simulated users needs the append-only trigger disabled
 *
 * `audit_logs` carries a `BEFORE UPDATE OR DELETE ... FOR EACH STATEMENT` trigger
 * that refuses every write. `audit_logs.actor_user_id` has `ON DELETE SET NULL`,
 * so deleting a user makes Postgres run `UPDATE audit_logs SET actor_user_id =
 * NULL WHERE actor_user_id = $1`. Because the trigger is STATEMENT-level, it
 * fires even when that UPDATE matches zero rows — which is the normal case here,
 * since a simulated sign-in writes no audit row at all. The net effect is that
 * **no user can be deleted**, ever, for any reason.
 *
 * The narrowest correct fix inside a demo script is to disable that one trigger
 * for the length of the delete. It is safe here specifically because the FK's
 * UPDATE is a no-op: this script first proves there are no audit rows for these
 * users and refuses to proceed if there are, so it cannot destroy evidence. The
 * `ALTER TABLE` and the `DELETE` share one transaction, so a crash rolls the
 * disable back instead of leaving the table unguarded.
 *
 * This is the procedure migration `0002_audit_logs_append_only.sql` documents.
 * It is done here rather than by hand because a reset that needs a superuser
 * shell is a reset that fails during the presentation.
 *
 * ## Why the rate-limit counters are cleared too
 *
 * `app/api/auth/[...all]/route.ts` allows 30 auth requests per 15 minutes per
 * client address, and `getClientIp` falls back to the literal string `unknown`
 * when no proxy header is present — which is the normal case for a script or for
 * a browser that reaches Next directly. Every request therefore shares ONE
 * bucket, so a run that signs in and out a handful of times exhausts the budget
 * for the whole machine and the next run starts against a 429 that has nothing to
 * do with it.
 *
 * Clearing the counters is what makes a reset a reset. It does not weaken the
 * limit: the window is recreated by the very next request, and the limiter still
 * applies to every request made after this script exits.
 *
 * ## Why it is safe to re-run
 *
 * Every statement is a `DELETE ... WHERE`, so a second run deletes zero rows and
 * says so. A reset that fails when there is nothing to reset is a reset that
 * fails in front of the audience.
 */
import { createClient } from 'redis';

import { closeRedis, requireDemoMode, openDb } from './_shared.mjs';

const SCRIPT = 'demo:reset-social';

requireDemoMode(SCRIPT);

/** Users the simulator creates. `demo.*@vuldetected.local` are NOT in this list:
 * they are seeded accounts, and deleting them would remove the domains, scans and
 * history the rest of the sprint depends on. Only their provider links go. */
const SIMULATED_USERS = [
  'ana.nueva@demo.vuldetected.dev',
  'beto.sinverificar@demo.vuldetected.dev',
  'carla.nueva@demo.vuldetected.dev',
];

const sql = openDb();

try {
  const removed = await sql.begin(async (tx) => {
    // Refuse to run if a simulated user somehow owns audit history. Disabling the
    // trigger below is only acceptable because there is nothing to protect.
    const auditRows = await tx`
      select count(*)::int as count
      from audit_logs
      where actor_user_id in (select id from users where email in ${tx(SIMULATED_USERS)})
    `;
    if (auditRows[0].count > 0) {
      throw new Error(
        `${SCRIPT}: refusing to run — ${auditRows[0].count} audit row(s) reference the simulated ` +
          'users. Deleting them would destroy security evidence. Inspect audit_logs and decide by hand.',
      );
    }

    // Sessions first: a live session would keep pointing at a user that is about
    // to disappear.
    const sessions = await tx`
      delete from sessions
      where user_id in (select id from users where email in ${tx(SIMULATED_USERS)})
    `;

    // Provider links on the seeded accounts. `credential` is the password row and
    // must survive, or the demo password stops working.
    const links = await tx`
      delete from accounts
      where provider_id in ('google', 'github')
        and user_id in (select id from users where email like '%@vuldetected.local')
    `;

    // See the header: the FK's no-op UPDATE still trips the statement-level
    // append-only trigger, so it is disabled for exactly this delete.
    await tx`alter table audit_logs disable trigger audit_logs_append_only`;
    let users;
    try {
      users = await tx`
        delete from users
        where email in ${tx(SIMULATED_USERS)}
      `;
    } finally {
      await tx`alter table audit_logs enable trigger audit_logs_append_only`;
    }

    return { sessions: sessions.count, links: links.count, users: users.count };
  });

  console.log(`[${SCRIPT}] removed ${removed.users} simulated user(s)`);
  console.log(`[${SCRIPT}] removed ${removed.links} provider link(s) from seeded accounts`);
  console.log(`[${SCRIPT}] removed ${removed.sessions} session(s)`);
  console.log(
    `[${SCRIPT}] Social criteria are back at their starting point. Seeded accounts and their data are untouched.`,
  );
} finally {
  await sql.end({ timeout: 5 });
}

/**
 * Clears the auth rate-limit windows. See the header for why one shared bucket
 * makes a leftover window poison the next run.
 *
 * A failure here is a warning, not an error: the database state is already
 * correct, and a reset that fails because Redis is down would be worse than a
 * reset that reports the limit may still be armed.
 */
if (process.env.REDIS_URL) {
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (error) => console.error(`[${SCRIPT}] redis: ${error.message}`));
  try {
    await client.connect();
    let cursor = '0';
    const keys = [];
    do {
      const page = await client.scan(cursor, { MATCH: 'rl:*', COUNT: 200 });
      cursor = page.cursor;
      keys.push(...page.keys);
    } while (cursor !== '0');

    if (keys.length > 0) await client.del(keys);
    console.log(`[${SCRIPT}] cleared ${keys.length} auth rate-limit counter(s)`);
  } catch (error) {
    console.warn(`[${SCRIPT}] rate-limit cleanup skipped: ${error.message}`);
  } finally {
    await closeRedis(client);
  }
} else {
  console.warn(`[${SCRIPT}] REDIS_URL is not set; a previous run's auth rate limit may still apply.`);
}
