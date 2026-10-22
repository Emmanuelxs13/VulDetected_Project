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
 * Scan lifecycle state (Sprint 2, DM-2).
 *
 * A database enum rather than free text for the same reason `account_status` is
 * one: an unknown status must be rejected at the boundary that stores it, not by
 * a UI `switch` that silently renders nothing for a value it does not recognise.
 *
 * `cancelled` is RESERVED — there is no UI trigger and no worker kill in Sprint 2
 * (design D9). The value exists so the vocabulary is fixed before the feature
 * that needs it, rather than forcing an enum migration then.
 */
export const scanStatusEnum = pgEnum('scan_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

/**
 * Finding severity vocabulary (Sprint 2, DM-3; ADR 0003).
 *
 * `unclassified` is deliberately the FIRST value and the ONLY one Sprint 2 ever
 * writes: the deterministic checks classify nothing, and inventing a severity
 * from a missing-header check would be a false claim. Classification rules and
 * provenance arrive in Sprint 3; the column and its full vocabulary exist now so
 * that work is a data change, not a migration. `unclassified` is also the ADR
 * 0003 `Badge unknown` mapping.
 */
export const severityEnum = pgEnum('severity', [
  'unclassified',
  'info',
  'low',
  'medium',
  'high',
  'critical',
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
export type ScanStatus = (typeof scanStatusEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
