import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tokenPurposeEnum } from './enums';

/**
 * `verification_tokens`
 *
 * Better Auth's `verification` model is `(identifier, value, expiresAt)` and it
 * uses `identifier` as the **lookup key** for its own flows: the email-verification
 * and password-reset paths call `findVerificationValue(…, identifier, secret)`
 * with the plain email address.
 *
 * VERIFIED CONSEQUENCE: the purpose **cannot** be encoded into `identifier`.
 * Doing so (`"reset_password:user@example.com"`) would break every built-in
 * Better Auth email flow, because the library would then look up a value that
 * was never written. That is the reason a dedicated column exists instead of a
 * clever string convention.
 *
 * `purpose` is therefore NULLABLE, which is the honest modelling:
 *
 *   - `NULL` — the row was written by Better Auth's internal flow, which tags
 *     nothing. Scope is determined by the endpoint that consumes the token, and
 *     those endpoints are ours.
 *   - `'reset_password'` etc. — written by **our** code, which sets the purpose
 *     explicitly. Used from Sprint 2, when we own the mailer and therefore own
 *     token creation.
 *
 * A NOT NULL column with a default would be a trap: Better Auth's inserts would
 * silently receive `verify_email`, so a password-reset token would be labelled
 * as an email verification. A mislabelled token is worse than an unlabelled one,
 * because unlabelled means "ask the endpoint" and mislabelled means "trust a
 * value nobody chose". Recorded as an open item in `docs/security.md`.
 */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /**
     * What the token is FOR, not who it is for. Nullable — see the file header.
     */
    purpose: tokenPurposeEnum('purpose'),

    /**
     * The subject of the token: an email address today, a normalised hostname in
     * Sprint 2. Deliberately **not** a foreign key to `users`: tokens are
     * addressed before the user row exists, and a FK would make pre-signup
     * verification impossible.
     */
    identifier: text('identifier').notNull(),

    /**
     * The token secret, stored recoverable.
     *
     * SECURITY: Better Auth writes this value, sends it by email, and resolves it
     * back through the adapter by exact match. It is therefore subject to the
     * same constraint that blocks hashing `sessions.token` — see the SECURITY
     * block in `sessions.ts` for the traced code path.
     *
     * The accepted exposure is narrower than the session case: a verification
     * token is single-use, short-lived, and its value is compared against the
     * link the user just clicked, so it cannot be replayed as a cookie. Tracked
     * in `docs/security.md`.
     */
    value: text('value').notNull(),

    /**
     * Absolute expiry. Verification tokens are deliberately short-lived: an
     * indefinitely valid verification link is a standing takeover invitation.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    /**
     * The token-consumption lookup.
     *
     * Better Auth's flow is `findOne({ identifier, value })`, so this composite
     * index — rather than two single-column indexes — is the one that turns
     * every verification click into a single index hit. Two single-column
     * indexes on a multi-column predicate would be strictly worse: Postgres would
     * use one and filter the rest.
     */
    lookupIdx: index('verification_tokens_lookup_idx').on(table.identifier, table.value),

    /**
     * Expired-token cleanup without scanning every row. Same reasoning as
     * `sessions_expires_at_idx`: an unbounded table of dead tokens is wasted
     * storage, and a cleanup job that silently stops running is a liability.
     */
    expiresAtIdx: index('verification_tokens_expires_at_idx').on(table.expiresAt),

    /**
     * Scope lookup by purpose, for "what is outstanding for this address, and
     * for what". `domain_ownership` in Sprint 2 resolves a hostname to its
     * pending challenge through exactly this path, so it is created now while
     * the vocabulary is still being changed.
     */
    purposeIdx: index('verification_tokens_purpose_idx').on(table.purpose),
  }),
);

/*
 * No `relations()` entry on purpose.
 *
 * The original design documented `user_id uuid` on this table, which would have
 * made a relation trivial. That column is deliberately dropped: a verification
 * token is addressed to an `identifier` (an email address today, a hostname in
 * Sprint 2), and it very often exists **before** the user row it will produce.
 * A nullable FK would invite the mistake of resolving tokens by user id instead
 * of by the value that was actually emailed.
 *
 * A relation from `verification_tokens.id` to `users.id` would be a lie that
 * TypeScript happily accepts and Postgres happily returns zero rows for. Absent
 * is the correct answer.
 */

export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;
