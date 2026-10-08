import { customType, pgEnum } from 'drizzle-orm/pg-core';

/**
 * `citext` — case-insensitive text.
 *
 * The only reason we need a `customType` in this package. Email matching is a
 * **security property**, not cosmetics: with a case-sensitive `text` column, a
 * case-sensitive unique index lets `A@x.com` and `a@x.com` register as two
 * accounts on one mailbox, and "login with the address I typed last week" starts
 * failing intermittently.
 *
 * `citext` is explicitly allowed by ADR 0004 §3: it is first-party, available on
 * every managed provider including Supabase, and needs no superuser.
 *
 * `dataType()` is what Drizzle emits into generated SQL, so migrations come out
 * as plain `citext` columns. Note that Drizzle has no `citext` *comparisons*
 * helper — equality and uniqueness are the database's job, which is the point.
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType: () => 'citext',
});

/**
 * Account lifecycle state.
 *
 * Modelled as a database enum rather than free text so a wrong state is rejected
 * by the database instead of by an `else` branch three layers away.
 *
 * `deleted` is a **state, not a row removal**: audit history and the FK targets
 * of `audit_logs.actor_user_id` must survive an account being closed.
 */
export const accountStatusEnum = pgEnum('account_status', [
  'pending',
  'active',
  'suspended',
  'deleted',
]);

/**
 * What a verification token authorizes.
 *
 * This vocabulary is what keeps token types from being interchangeable. Without
 * it, a value leaked from one email flow would be valid in another — a reset
 * token accepted as an email verification is a full account takeover.
 *
 * `domain_ownership` is reserved for the Sprint 2 DNS `TXT` / `/.well-known`
 * challenge, so the vocabulary is fixed before that code exists.
 */
export const tokenPurposeEnum = pgEnum('token_purpose', [
  'verify_email',
  'reset_password',
  'domain_ownership',
]);

/**
 * `inet` — a validated IP address, in either family.
 *
 * A `text` column accepts "not-an-ip", "1.2.3.4.5", and "::ffff:1.2.3.4" with
 * equal indifference. `inet` is what makes containment queries possible at all:
 * "was this one attacker behind many accounts?" is a CIDR match, and a CIDR
 * match against text is a `LIKE` with a false sense of security. Core Postgres,
 * no extension (ADR 0004 §3).
 *
 * `IPv4` is deliberately absent — the column accepts both families because the
 * product will sit behind IPv6-only infrastructure eventually, and a v4-only
 * column loses those addresses silently.
 */
export const inet = customType<{ data: string }>({
  dataType: () => 'inet',
});

export type AccountStatus = (typeof accountStatusEnum.enumValues)[number];
export type TokenPurpose = (typeof tokenPurposeEnum.enumValues)[number];
