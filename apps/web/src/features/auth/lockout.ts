import 'server-only';

import { and, eq, lt, sql, users } from '@vuldetected/db';

import { audit } from '@/lib/audit';
import { db } from '@/lib/db';

/**
 * Failed-login accounting.
 *
 * `failed_login_count` / `locked_until` exist so that throttling is PER ACCOUNT,
 * not only per IP. IP-only limiting is defeated by a botnet and cannot stop one
 * password-spraying list walking a single account from many addresses.
 *
 * The lockout ladder is progressive, not a flat ban:
 *
 *   5 failures → lock 1 minute
 *   8 failures → lock 15 minutes
 *   11+        → lock 1 hour
 *
 * A flat 30-minute lock after 5 attempts is a denial-of-service weapon: anyone
 * who knows a victim's email can lock them out indefinitely by failing five
 * times, forever. A progressive ladder means an attacker who keeps hammering
 * gets locked out *harder*, while someone who mistypes their password twice waits
 * a minute instead of half an hour.
 *
 * A successful login resets the counter to zero, so a real user who corrects a
 * typo is not carrying yesterday's failures.
 */
const LOCKOUT_LADDER: readonly { threshold: number; minutes: number }[] = [
  { threshold: 5, minutes: 1 },
  { threshold: 8, minutes: 15 },
  { threshold: 11, minutes: 60 },
];

function lockoutFor(failedCount: number): Date | null {
  for (const step of [...LOCKOUT_LADDER].reverse()) {
    if (failedCount >= step.threshold) {
      return new Date(Date.now() + step.minutes * 60_000);
    }
  }
  return null;
}

/** Returns the remaining lockout in whole minutes, or 0. */
export async function activeLockMinutes(email: string): Promise<number> {
  const user = await db()
    .select({ lockedUntil: users.lockedUntil })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const lockedUntil = user[0]?.lockedUntil;
  if (!lockedUntil) return 0;

  const remainingMs = new Date(lockedUntil).getTime() - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 60_000) : 0;
}

/**
 * Increments the failure counter and applies the lockout ladder.
 *
 * ## WHY THE INCREMENT IS ATOMIC
 *
 * The obvious implementation is read-then-write: `SELECT failed_login_count`,
 * add one in JavaScript, `UPDATE` the total. It was what this function used to do,
 * on the argument that a lost increment "costs one extra attempt".
 *
 * That argument is wrong, and it is wrong in the direction that matters. The race
 * needs no attacker sophistication — one HTTP client sending N requests in
 * parallel is enough. All N read `4`, all N compute `5`, all N write `5`, and the
 * account has now received N attempts against a threshold of 5. Send 100
 * concurrently and the counter still reads 5, so the ladder never advances and
 * the rate limit never engages. The lockout is not merely weakened by the race;
 * parallel requests bypass it entirely, which makes a control documented as a
 * defence into a control an attacker can simply opt out of.
 *
 * `failed_login_count + 1` evaluated by Postgres, with `RETURNING`, closes it:
 * the read and the write are one statement, so the database serialises them. The
 * result also hands back the authoritative post-increment value, so the ladder
 * decision is made from the same number that was persisted rather than from a
 * separately-queried copy that could already be stale.
 */
export async function recordFailure(userId: string, email: string, ip: string | null) {
  const bumped = await db()
    .update(users)
    .set({ failedLoginCount: sql`${users.failedLoginCount} + 1` })
    .where(eq(users.id, userId))
    .returning({ failedLoginCount: users.failedLoginCount });

  const failedCount = bumped[0]?.failedLoginCount ?? 1;
  const lockedUntil = lockoutFor(failedCount);

  // Only write when the ladder actually engages. `lockoutFor` returns null below
  // the first threshold, and writing null would clear a lock that a concurrent
  // request had just set.
  if (lockedUntil !== null) {
    await db().update(users).set({ lockedUntil }).where(eq(users.id, userId));
  }

  await audit(
    {
      action: 'auth.login_failed',
      actorUserId: userId,
      targetType: 'user',
      targetId: userId,
      // The email is recorded because the attacker's intent matters more than the
      // privacy of an address someone just just tried to log in with. The password
      // never is.
      metadata: { email, failedCount, lockedUntil: lockedUntil?.toISOString() ?? null },
    },
    ip,
  );
}

export async function resetFailures(userId: string) {
  await db()
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, userId));
}

/** Clears a stale lock whose deadline has passed. */
export async function clearExpiredLock(userId: string) {
  await db()
    .update(users)
    .set({ lockedUntil: null })
    .where(and(eq(users.id, userId), lt(users.lockedUntil, new Date())));
}
