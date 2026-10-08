import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
  uuid,
} from 'drizzle-orm/pg-core';
import { inet } from './enums';
import { users } from './users';

/**
 * `audit_logs` — fully owned by VulDetected, no Better Auth involvement.
 *
 * Incident response starts with two questions: *when* did this happen and *who*
 * did it. Without an answerable record there is nothing to investigate, so this
 * table exists from Sprint 1 even though Sprint 1 has nothing interesting to log
 * yet.
 *
 * ---------------------------------------------------------------------------
 * APPEND-ONLY IS ENFORCED BY THE DATABASE, NOT BY DISCIPLINE.
 * ---------------------------------------------------------------------------
 *
 * `migrations/0002_audit_logs_append_only.sql` installs a rule that raises an
 * exception on any `UPDATE` or `DELETE` against this table. Application code is
 * therefore structurally incapable of rewriting history, and no future
 * contributor has to remember not to.
 *
 * Rationale: **OWASP Top 10 A09:2021 — Security Logging and Monitoring
 * Failures**, whose core requirement is that log records are tamper-evident. An
 * audit log that can be rewritten is not evidence; it is a convenience that an
 * attacker with database write access will use to erase their own trail, and it
 * is rewritten precisely by the privileged code paths that are hardest to audit.
 * Enforcing it in the database means the guarantee does not depend on any
 * particular call site being reviewed.
 *
 * The mechanism is plain portable PL/pgSQL — `CREATE RULE` / `RAISE EXCEPTION`,
 * core Postgres, no extension — so it is identical on a local container and on
 * Supabase (ADR 0004).
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    /**
     * `bigserial`, not `uuid` — a DEVIATION from `docs/database.md`, and a
     * deliberate one.
     *
     * Every other table uses `uuid` to avoid a sequential-ID enumeration vector.
     * That argument does not apply here: this table has no per-row public URL,
     * no `GET /audit-log/:id`, and its primary key is never accepted as input.
     * What it does need is a **monotonic** ordering key that cannot be
     * contradicted by clock skew — `created_at` is set by the application host,
     * so two events from two hosts can be out of order, while a sequence cannot.
     * For an append-only ledger, a gapless increasing key is worth more than
     * unguessability. `created_at` remains the authoritative *time*; `id` is the
     * authoritative *order*.
     */
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    /**
     * The actor. Nullable **on purpose**: the events worth recording most are
     * exactly the ones with no authenticated actor yet — a failed login, a
     * rejected registration. `ON DELETE SET NULL` (not `CASCADE`) so closing an
     * account does not erase the history of what that account did.
     */
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),

    /**
     * Stable machine-readable verb, `varchar(64)`-bounded.
     *
     * Not a free-text message: an audit query that has to parse English is an
     * audit query that will be wrong. Sprint 1 vocabulary:
     * `user.registered`, `auth.login_succeeded`, `auth.login_failed`,
     * `auth.logged_out`. Dotted namespace so a prefix filter is possible.
     *
     * A `CHECK (action ~ '^[a-z_]+\.[a-z_]+$')` constraint is a natural
     * hardening step but is deliberately NOT added here: the vocabulary is still
     * growing and a bad regex is a migration every time a verb is coined.
     *
     * DEVIATION FIXED: this was `text()`, which cannot enforce the documented
     * 64-character bound — `text` is unbounded, so the bound existed only in a
     * comment. `varchar(64)` makes it real, and an action longer than 64
     * characters now fails at the database rather than silently bloating an
     * index that every audit query has to touch.
     */
    action: varchar('action', { length: 64 }).notNull(),

    /** Kind of entity acted upon, e.g. `user`, `session`, `scan`. */
    targetType: text('target_type'),

    /**
     * Identifier of the affected entity. `text`, not `uuid`, because scan ids and
     * session ids are not guaranteed to be UUIDs in every future provider of
     * those tables — a `uuid` column here would make this table the thing that
     * blocks them.
     */
    targetId: text('target_id'),

    /**
     * Structured context. Defaults to `'{}'` and is NOT NULL so a reader never
     * has to write `coalesce(metadata, '{}')`.
     *
     * NEVER stores passwords, raw tokens, cookies, or authorization headers. An
     * audit log is a document people are asked to share during an incident; a
     * credential in it is a credential in every incident report.
     */
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),

    /**
     * Source address of the event. `inet`, not `text`: an unvalidated string is
     * not an address, and CIDR containment queries ("was this one attacker
     * across many accounts?") need a real address type to be possible.
     */
    ip: inet('ip'),

    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /**
     * The dominant access pattern: "what happened between T1 and T2". Serves
     * the live feed, the daily digest, and any retention sweep — one index,
     * three features.
     *
     * DEVIATION FIXED: declared DESC. Every one of those three queries reads
     * backwards in time ("most recent first"), and a backward scan of an
     * ascending index is exactly as cheap — but only if the index is built in
     * that direction. An ascending index forces a sort on each of them.
     */
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt.desc()),

    /**
     * FK support for `audit_logs.actor_user_id`.
     *
     * PostgreSQL indexes the referenced side of a foreign key, never the
     * referencing side, so "everything this actor did" would be a sequential
     * scan of a table that is designed to grow without bound. This is the index
     * that makes the answer to an incident question fast instead of a reason to
     * run a nightly `VACUUM ANALYZE`.
     */
    actorUserIdx: index('audit_logs_actor_user_id_idx').on(table.actorUserId),

    /**
     * "What was done to entity X" — e.g. every event against one scan.
     *
     * Added now rather than in Sprint 2 because `audit_logs` is append-only and
     * therefore cannot be backfilled cheaply: an index added after two million
     * rows exists means a production `CREATE INDEX` under load. The cost while
     * the table is small is one write-side index maintenance per row.
     */
    targetIdx: index('audit_logs_target_idx').on(table.targetType, table.targetId),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
