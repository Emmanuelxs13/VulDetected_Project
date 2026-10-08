import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accountStatusEnum, citext } from './enums';

/**
 * `users`
 *
 * Primary key is `uuid` with a `gen_random_uuid()` default. Two reasons: a
 * sequential-ID enumeration vector is a real leak (counting `/users/42` tells an
 * attacker how many customers exist), and a per-table sequence grants
 * `CREATE SEQUENCE`, which is a privilege nobody should hand out. Postgres 13+
 * ships `gen_random_uuid()` natively, so this needs no extension (ADR 0004 §3).
 *
 * Better Auth contract (verified against the adapter for the installed version):
 *
 *   - the Drizzle property names MUST match Better Auth's field names
 *     (`name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt`)
 *     because the adapter maps fields by **property** name, not by column name;
 *   - the **column** names are ours — `varchar("email_address")` in the Drizzle
 *     definition keeps the JS property `email` while the database column can be
 *     anything. We keep the `snake_case` column names documented in
 *     `docs/database.md`;
 *   - `status`, `locale`, `failedLoginCount`, `lockedUntil` and `deletedAt` are
 *     declared through Better Auth's `user.additionalFields` (see
 *     `apps/web/src/lib/auth.ts`).
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /**
     * Login identifier. `citext` makes case-insensitive matching a storage-level
     * property, so `A@x.com` and `a@x.com` cannot become two accounts.
     */
    email: citext('email').notNull().unique(),

    /**
     * Whether the address is **proven**, not merely provided.
     *
     * DEVIATION FROM `docs/database.md`: the design of record documented
     * `email_verified_at timestamptz` and reasoned that `NULL` means unverified.
     * Better Auth's `user` model contracts on a boolean `emailVerified`, and
     * diverging from that contract would mean hand-maintaining the field on
     * every auth path. The boolean is therefore the single source of truth; the
     * instant of verification is recoverable from `audit_logs`, which is
     * append-only. One source of truth beats two that can disagree.
     */
    emailVerified: boolean('email_verified').notNull().default(false),

    /**
     * Display name.
     *
     * DEVIATION FROM `docs/database.md`, which left this nullable so that
     * email-only signup would not have to supply one.
     *
     * Verified in the installed Better Auth 1.7.7
     * (`dist/api/routes/sign-up.mjs:150,219`): `signUpEmail` destructures
     * `name` out of the request body and passes it straight into
     * `internalAdapter.createUser`, and its input schema declares
     * `name: z.string()` — **required, not optional**. A `NULL` here is therefore
     * not merely untidy: it contradicts the contract the library validates
     * against, and the value read back is typed `string` while the database
     * holds `NULL`.
     *
     * The product requirement is preserved in the application layer instead:
     * `apps/web/src/features/auth/schema.ts` keeps the form field optional and
     * derives a name from the email's local part when it is left blank, so the
     * user is never forced to type one. The constraint lives in the database
     * because that is where it can never be violated.
     */
    name: text('name').notNull(),

    /** Avatar URL, reserved for OAuth in Sprint 4+. */
    image: text('image'),

    /**
     * DEFAULT: `active`.
     *
     * DEVIATION FROM `docs/database.md`, which defaulted to
     * `pending_verification` so that "a half-finished signup can never look
     * fully active". Sprint 1 ships `requireEmailVerification: false` (an open
     * product question — see `docs/decisions-pending.md`), so a default of
     * `pending` would lock every new account out of `/dashboard` while enforcing
     * nothing. `pending` remains reachable and is what a future
     * require-verification flow sets.
     */
    status: accountStatusEnum('status').notNull().default('active'),

    /**
     * UI language. Default `es` matches the owner's locale; the repository's
     * artifacts are English by contract, and the product copy language is still
     * an open decision. The column exists so that decision is a data change, not
     * a migration.
     */
    locale: text('locale').notNull().default('es'),

    /**
     * Consecutive failed logins. Reset to `0` on any success.
     *
     * This is the per-account half of brute-force throttling. IP-only throttling
     * is defeated by a botnet and cannot stop one password-spraying list
     * hammering a single account from many addresses; the counter cannot be
     * spread across addresses. Read and written by the
     * `databaseHooks.session.create.before` guard in `apps/web/src/lib/auth.ts`.
     */
    failedLoginCount: integer('failed_login_count').notNull().default(0),

    /**
     * While `now() < locked_until`, password login is refused regardless of
     * correctness. `NULL` means not locked.
     *
     * `timestamptz` rather than an integer backoff counter so the lock survives
     * a process restart and is inspectable by an operator with `psql`.
     */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),

    /**
     * Soft-deletion instant for `status = 'deleted'`. Rows are never physically
     * removed so `audit_logs.actor_user_id` keeps a resolvable target.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    /**
     * Account state, for "list every suspended user" and for the
     * `pending` → `active` sweep a future verification flow will need.
     *
     * `status` is four values, so the index stays small regardless of table
     * size and remains cache-resident — which is the entire point of having it.
     */
    usersStatusIdx: index('users_status_idx').on(table.status),

    /**
     * Lockout expiry sweep.
     *
     * Partial on `NOT NULL`, so the index only contains accounts that are
     * actually locked. `WHERE locked_until IS NOT NULL` is immutable and
     * therefore indexable — a predicate on `now()` would not be.
     *
     * Serves `clearExpiredLock()` in `apps/web/src/features/auth/actions.ts`
     * (`WHERE locked_until < now()`), which would otherwise scan the table once
     * per login attempt against a locked account.
     */
    usersLockedUntilIdx: index('users_locked_until_idx')
      .on(table.lockedUntil)
      .where(sql`${table.lockedUntil} IS NOT NULL`),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
