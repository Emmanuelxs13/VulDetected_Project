import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { domains } from './domains';
import { scanStatusEnum } from './enums';
import { scanCredentials } from './scan-credentials';

/**
 * `scans` — one request to scan one verified domain (Sprint 2, DM-2).
 *
 * Status lives here and nowhere else. The Celery result backend is deliberately
 * ignored (`task_ignore_result=true`): the authoritative lifecycle is this row,
 * written by the web app — the single writer of scan state (design D1/TB2).
 *
 * The row is inserted as `queued` BEFORE the job is published to the broker
 * (SS-6). If publication then fails, the row is moved to `failed` with
 * `error='enqueue_failed'` and the response is 503 — a scan that exists but was
 * never queued is recoverable and visible; a broker message with no row is not.
 */
export const scans = pgTable(
  'scans',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /**
     * The verified domain that was scanned. `ON DELETE CASCADE` so removing a
     * domain removes its scan history; findings and events cascade from this row
     * in turn.
     */
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),

    /** The normalised, validated target URL that was submitted (SS-1). */
    targetUrl: text('target_url').notNull(),

    /**
     * Where the scan came from. `manual` is an interactive submission; `schedule`
     * is the durable scheduler. Recorded because the two have different failure
     * handling and because "how much of my usage is automated" is a real product
     * question.
     */
    source: text('source').notNull().default('manual'),

    /**
     * The credential used to reach authenticated pages, if the domain had one at
     * enqueue time. `ON DELETE SET NULL` never fires in practice (credentials are
     * soft-revoked, not deleted), but it keeps a hard delete from erasing scan
     * history.
     */
    credentialId: uuid('credential_id').references(() => scanCredentials.id, {
      onDelete: 'set null',
    }),

    /** Lifecycle state. Starts `queued`; only the web app transitions it (design D9). */
    status: scanStatusEnum('status').notNull().default('queued'),

    /**
     * The checks to run, as a JSON array.
     *
     * Defaults to the full check set (four passive checks plus six active ones).
     * A default in the database — rather than only in application code — means a
     * row inserted by any future path still carries a coherent instruction set
     * for the worker.
     */
    checks: jsonb('checks')
      .notNull()
      .default(
        sql`'["security_headers","tls","cookies","redirects","xss","sqli","open_redirect","cors","directory_listing","sensitive_files"]'::jsonb`,
      ),

    /**
     * The Celery task id, echoed into the published message's `id`/`root_id`.
     * Nullable: it is only known once publication succeeds, and a row that failed
     * to enqueue legitimately never has one.
     */
    celeryTaskId: text('celery_task_id'),

    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),

    /**
     * DEMO ONLY. Marks rows produced by `pnpm demo:seed-history` (CA-29).
     *
     * The history chart must never mix invented data with real data without
     * saying so. A boolean on the row is the only version of that which cannot
     * be forgotten by a query: every surface that aggregates scans can filter or
     * label on it, and the UI badge reads from the same column.
     */
    isDemo: boolean('is_demo').notNull().default(false),

    /**
     * Which check set this scan actually ran: `passive` (headers, TLS, cookies,
     * redirects) or `active` (the above plus crafted-request checks).
     *
     * Stored rather than derived from `checks` at read time because the meaning
     * of "comparable" depends on it: a passive scan and an active scan of the
     * same domain do not produce comparable finding counts, so the history must
     * be able to say so (CA-29). Deriving it later would let a change to the
     * default check list silently rewrite what past scans meant.
     */
    scanMode: text('scan_mode').notNull().default('active'),

    /**
     * Version of the severity catalog used when this scan's findings were
     * classified (CA-29).
     *
     * Severity is a judgement made by a rule set, and rule sets change. Without
     * this column a chart could compare a scan scored by one catalog against a
     * scan scored by another and present the difference as a trend in the
     * website's security rather than a change in our own rules.
     */
    severityCatalogVersion: text('severity_catalog_version').notNull().default('1.0'),

    /** Machine-readable failure reason (e.g. `enqueue_failed`), never a stack trace. */
    error: text('error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    /**
     * "My scans for this domain, newest first" — the dominant read for the scan
     * list. Declared DESC because that query reads backwards in time and an
     * ascending index would force a sort on every page load.
     */
    domainCreatedIdx: index('scans_domain_created_idx').on(table.domainId, table.createdAt.desc()),

    /**
     * Status sweeps. Sprint 2 has no scheduler, but a future TTL/gatekeeper will
     * scan by status, and adding the index later against a large table is a
     * production `CREATE INDEX` under load.
     */
    statusIdx: index('scans_status_idx').on(table.status),

    /** `source` is a two-value CHECK, kept at the database boundary. */
    sourceCheck: check('scans_source_check', sql`${table.source} IN ('manual', 'schedule')`),

    /** `scan_mode` is a two-value CHECK for the same reason. */
    scanModeCheck: check('scans_scan_mode_check', sql`${table.scanMode} IN ('passive', 'active')`),
  }),
);

export type Scan = typeof scans.$inferSelect;
export type NewScan = typeof scans.$inferInsert;
