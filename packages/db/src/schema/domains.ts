import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

/**
 * `domains` — a hostname a user has PROVEN they own (Sprint 2, DO-1).
 *
 * A row here is the only thing that authorises a scan. The web app never scans a
 * hostname it has not verified, and the guard that enforces that
 * (`requireVerifiedDomain`) queries exactly this table by
 * `(user_id, normalized_hostname, verified)`.
 *
 * ## Why `normalized_hostname` is GLOBALLY unique
 *
 * DEVIATION FROM A "per-user unique" instinct, decided in design D2, and the
 * single most consequential choice in this table.
 *
 * The legal ownership of a domain is exclusive in fact: two verified accounts on
 * the same hostname mean either a forged proof or coordinated squatting. Global
 * uniqueness removes three costs at once — duplicate scans of the same host, two
 * verification flows racing on one DNS record, and ambiguity about which account
 * "owns" a target at callback time. It is not an abuse vector to have the second
 * account refused, because verification requires real control of the hostname.
 *
 * The column is a separate, normalised value on purpose: `hostname` keeps the
 * form the user typed (for display), while `normalized_hostname` is what every
 * lookup, uniqueness check and dedup key is built on.
 */
export const domains = pgTable(
  'domains',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /**
     * Owner. `ON DELETE CASCADE` is consistent with `sessions`/`accounts`: when a
     * user is removed, their proven domains go with them. `audit_logs` is the
     * exception and keeps its evidence — but a domain row is state, not evidence.
     */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** The hostname as supplied, non-normalised, for display. */
    hostname: text('hostname').notNull(),

    /** Lower-cased, IDN-to-ASCII form — the value every lookup and the unique index use. */
    normalizedHostname: text('normalized_hostname').notNull(),

    /** Set only by a successful ownership challenge; `false` rows may exist mid-flow. */
    verified: boolean('verified').notNull().default(false),

    /**
     * How ownership was proven. `text` with a CHECK rather than a third enum:
     * design D2 fixes exactly two enums for Sprint 2, and the CHECK gives the
     * same database-level rejection (no "dns-typo" value can ever be stored)
     * without promoting a two-value vocabulary to a type.
     */
    verificationMethod: text('verification_method'),

    /** The observed proof: the TXT value, or the well-known path that matched. */
    verificationRecord: text('verification_record'),

    /** When the challenge succeeded. NULL means unverified. */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    /**
     * GLOBAL uniqueness — see the file header. This is also the index the
     * `requireVerifiedDomain` lookup and the "domain already verified by another
     * account" check run against.
     */
    normalizedHostnameKey: unique('domains_normalized_hostname_key').on(table.normalizedHostname),

    /**
     * FK support for `domains.user_id`. Postgres does not index the referencing
     * side, so "my domains" and the `ON DELETE CASCADE` from `users` would scan
     * the table without it.
     */
    userIdIdx: index('domains_user_id_idx').on(table.userId),

    /**
     * The only two legitimate verification methods. Enforced at the database so
     * an unrecognised method cannot be written even by a future code path that
     * forgets to validate it.
     */
    verificationMethodCheck: check(
      'domains_verification_method_check',
      sql`${table.verificationMethod} IN ('dns_txt', 'well_known')`,
    ),
  }),
);

export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
