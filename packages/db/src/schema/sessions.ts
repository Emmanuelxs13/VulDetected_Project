import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * `sessions`
 *
 * Sessions are server-authoritative: a cookie is not a session until this table
 * agrees. Every protected request costs one indexed lookup, and that is the
 * price of real revocation ("log out everywhere", "revoke a compromised
 * session"), which stateless JWTs cannot offer (ADR 0002).
 *
 * ===========================================================================
 * SECURITY — `token` STORES THE RAW SESSION TOKEN. THIS IS AN OPEN FINDING.
 * ===========================================================================
 *
 * `docs/database.md` and ADR 0002 both promised `sessions.token_hash`, a SHA-256
 * digest, so that a leaked database could not be replayed as live cookies.
 * That promise is NOT kept by this schema, and the reason is a hard contract in
 * Better Auth 1.7.7, not an oversight.
 *
 * The contract, traced through the installed package:
 *
 *   1. `internal-adapter.mjs:273` generates the raw token in JavaScript
 *      (`token: generateId(32)`).
 *   2. It is inserted via the adapter; the adapter returns the row as read back
 *      from Postgres (`RETURNING`), so `create` returns the **stored** value.
 *   3. `api/routes/sign-in.mjs:213,216` then does
 *      `setSessionCookie(c, data.data)` and returns
 *      `token: data.data.session.token` — the value that came back out of the
 *      INSERT.
 *
 * So the **cookie value is derived from what the database returned**. Hashing on
 * write therefore puts the digest in the user's cookie, and the very next
 * request looks up `sha256(digest)` against a column holding `sha256(raw)` and
 * matches nothing. The failure mode is not "sessions stop working in an edge
 * case" — it is that nobody can ever log in, discovered only after a deploy.
 *
 * The same value also flows back INTO the adapter: `findSession` returns the
 * stored row, and `api/routes/session.mjs:199` calls
 * `updateSession(session.session.token, …)`. A stored digest would be hashed a
 * second time. Making such a transform idempotent (by digest length or prefix)
 * is a heuristic, and a heuristic in the authentication path that cannot be
 * integration-tested here — no database may be started in this milestone — is a
 * worse engineering outcome than an honestly documented gap.
 *
 * The library exposes no first-class alternative: there is no `hashToken`,
 * `tokenHash`, or `sessionToken` transform option anywhere in the 1.7.7 type
 * surface (verified by grepping the published `.d.mts` declarations).
 *
 * WHAT IS IN PLACE INSTEAD:
 *
 *   - `HttpOnly` + `SameSite=Lax` + `Secure`-outside-local cookie flags, so the
 *     token is not readable by JavaScript and is not sent on cross-site
 *     subrequests;
 *   - short absolute `expires_at`, so a stolen cookie dies on its own;
 *   - real revocation — `deleteSession` DELETEs the row by default
 *     (`preserveSessionInDatabase` is opt-in and left off), so sign-out
 *     genuinely erases the token from storage;
 *   - `databaseHooks` rejecting suspended/deleted/locked accounts before a
 *     session row is created.
 *
 * Tracked as an open item in `docs/security.md` §4 and in ADR 0002. The fix is
 * upstream: a hashing option in Better Auth, or a deliberate decision to accept
 * the raw column with the mitigations above. Do not "fix" this column without
 * re-reading the trace above.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /**
     * Absolute expiry. Not renewable indefinitely: an absolute ceiling is what
     * makes a stolen cookie die on its own, without anyone remembering to
     * revoke it.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /**
     * The raw session token, as issued in the user's cookie.
     *
     * SECURITY: stored recoverable. See the SECURITY block at the top of this
     * file for why Better Auth 1.7.7 makes this unavoidable, and for the
     * mitigations that do apply. This is an OPEN item in `docs/security.md`.
     */
    token: text('token').notNull().unique(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    /**
     * Session created from this address, for abuse investigation.
     *
     * Metadata, not an identifier. Deliberately **not** used for lockout
     * decisions: a shared office, a NAT, or a mobile carrier hands the same
     * address to hundreds of legitimate users, and locking on an address locks
     * all of them.
     */
    ipAddress: text('ip_address'),

    /**
     * Client identity. Without it, spotting a hijacked session is guesswork —
     * this is the column that turns "was this me?" into a comparison.
     */
    userAgent: text('user_agent'),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    /**
     * Session-expiry sweeps and revocation.
     *
     * Every expired row must be collectable without scanning the table, because
     * an unbounded `sessions` table is both a storage cost and a wider window
     * for token replay if a cleanup job ever stops running. Cheap "cheap
     * TTL-style cleanup": `DELETE FROM sessions WHERE expires_at < now()`
     * becomes an index range scan.
     */
    sessionsExpiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),

    /**
     * FK support for `sessions.user_id`.
     *
     * PostgreSQL does not index the referencing side of a foreign key, so this
     * is what makes `ON DELETE CASCADE` and "revoke every session for this user"
     * (sign-out-everywhere, incident response) into index scans instead of full
     * table scans. `expires_at` alone cannot serve either — it does not narrow
     * by user.
     */
    sessionsUserIdx: index('sessions_user_id_idx').on(table.userId),
  }),
);

/** Every expired session, as a range-scan-friendly predicate. */
export const EXPIRED_SESSIONS = sql`${sessions.expiresAt} < now()`;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
