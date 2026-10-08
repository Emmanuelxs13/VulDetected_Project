import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * `accounts`
 *
 * This table is **required for email + password to work at all**, which the
 * original `docs/database.md` design missed. It was not discovered by reading
 * Better Auth's marketing page; it is what the adapter's `account` model
 * demands, and email + password credentials live here in `accounts.password`
 * rather than in `users.password_hash`.
 *
 * The `(provider_id, account_id)` shape is Better Auth's: one user can hold
 * several credentials, and the uniqueness constraint is what stops a second
 * account row from being inserted for the same credential. OAuth token columns
 * (`access_token`, `refresh_token`, `id_token`, …) are nullable and unused in
 * Sprint 1 — social login is Sprint 4+ per the roadmap — but they are declared
 * now because adding an OAuth provider must not be a schema migration.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Identifier of the account **within** the provider. For credentials this is the user's id. */
    accountId: text('account_id').notNull(),

    /**
     * Better Auth uses the literal `credential` for email + password rows.
     * Free text rather than an enum because every OAuth provider adds a new
     * value, and an enum would mean a migration per provider.
     */
    providerId: text('provider_id').notNull(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** OAuth only. Nullable in Sprint 1 because no OAuth provider is enabled. */
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),

    /**
     * argon2id hash — never a plaintext or recoverable form.
     *
     * This column REPLACES the `users.password_hash` column from the original
     * `docs/database.md`. Reason: a user may hold several credentials (this one
     * now, a Google account from Sprint 4), and a single `password_hash` on the
     * user row cannot represent that. Keeping the hash in the credential row is
     * what makes "one user, N providers" a data change instead of a redesign.
     */
    password: text('password'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    /**
     * One credential per (provider, account). This is the constraint that makes
     * "the same email cannot end up with two password credentials" a database
     * invariant instead of a race someone has to remember to check.
     *
     * It is a UNIQUE index, not a plain one, so it does double duty as the
     * lookup index for sign-in.
     *
     * DEVIATION FIXED: this was declared as a plain `index()` while the comment
     * claimed uniqueness. A plain index would leave the invariant unenforced —
     * two rows for the same credential could both be inserted, and sign-in would
     * then pick one arbitrarily. `uniqueIndex()` makes the claim true.
     */
    providerAccountUniqueIdx: uniqueIndex('accounts_provider_account_key').on(
      table.providerId,
      table.accountId,
    ),

    /**
     * FK support index for `accounts.user_id`.
     *
     * PostgreSQL does not index the referencing side of a foreign key. Without
     * this, "delete this user" (`ON DELETE CASCADE`) and "list this user's
     * linked providers" both scan the whole table.
     */
    accountsUserIdx: index('accounts_user_id_idx').on(table.userId),
  }),
);

/** PostgreSQL needs this index to execute the cascade efficiently. */
export const CASCADE_TARGETS = sql`accounts.user_id`;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
