import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { domains } from './domains';
import { users } from './users';

/**
 * `scan_credentials` — secrets the scanner needs to reach authenticated pages.
 *
 * ## WHY THIS TABLE EXISTS AT ALL
 *
 * A large part of a real application is behind a login. Scanning only the public
 * surface produces a report that says "all clear" about the pages nobody can see
 * without an account, which is the exact opposite of useful. The scan therefore
 * has to be able to authenticate, and that means the product stores a credential
 * the user owns.
 *
 * ## WHAT IS STORED (AND WHAT IS NOT)
 *
 * The plaintext secret NEVER touches this table. The application seals it with
 * AES-256-GCM (key from `CREDENTIALS_ENCRYPTION_KEY`) and stores only:
 *
 *   * `ciphertext` — base64 of `iv | authTag | encryptedPayload`
 *   * `keyVersion` — which key sealed it, so a key can be rotated without
 *     re-encrypting every row at once
 *
 * The database, a backup and a `SELECT *` are therefore not enough to recover a
 * user's password. Decryption happens in the web process at enqueue time, and
 * the plaintext is passed to the worker in the job payload (the broker is
 * already on the trusted internal network, and the alternative — re-decrypting
 * inside the worker — would mean shipping the master key to a second service).
 *
 * `ciphertext` is `text`, not `bytea`, because it travels to the worker inside a
 * JSON job payload and base64 survives that round trip unambiguously.
 *
 * ## ROTATION
 *
 * A row is never edited in place to change the secret: a new row is inserted and
 * `revokedAt` is set on the old one. `scans.credential_id` keeps pointing at the
 * exact version that was used, so "which secret produced this report" stays
 * answerable after a rotation.
 */
export const scanCredentials = pgTable(
  'scan_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** The verified domain this credential unlocks. Cascades with the domain. */
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),

    /** Owner, kept denormalised so access checks do not need to join `domains`. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Human label (`Production admin`, `Staging`, …). Not a secret. */
    label: text('label').notNull(),

    /**
     * Authentication scheme the worker should apply. `text` + CHECK instead of an
     * enum for the same reason `domains.verification_method` is: a three-value
     * vocabulary does not deserve a database type, but it does deserve rejection
     * at the boundary.
     */
    kind: text('kind').notNull().default('basic'),

    /** Base64 of `iv (12 bytes) | authTag (16 bytes) | ciphertext`. */
    ciphertext: text('ciphertext').notNull(),

    /** Which encryption key sealed this row. Starts at 1 and only grows. */
    keyVersion: integer('key_version').notNull().default(1),

    /** Last time the scanner used it, for the settings UI. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

    /**
     * Soft revocation. NULL means active. A revoked row is kept so historical
     * scans can still resolve the credential they used, while no new scan picks
     * it up.
     */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    /** At most one ACTIVE credential per domain: two active secrets is ambiguous. */
    activePerDomain: uniqueIndex('scan_credentials_active_domain_unique')
      .on(table.domainId)
      .where(sql`${table.revokedAt} IS NULL`),

    /** "Everything I stored for my account". */
    userIdx: index('scan_credentials_user_idx').on(table.userId),

    /** Only the three schemes the worker knows how to apply. */
    kindCheck: check(
      'scan_credentials_kind_check',
      sql`${table.kind} IN ('basic', 'bearer', 'header')`,
    ),
  }),
);

export type ScanCredential = typeof scanCredentials.$inferSelect;
export type NewScanCredential = typeof scanCredentials.$inferInsert;
