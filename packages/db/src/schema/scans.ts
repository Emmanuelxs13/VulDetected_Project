import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { domains } from './domains';
import { scanStatusEnum } from './enums';

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

    /** Lifecycle state. Starts `queued`; only the web app transitions it (design D9). */
    status: scanStatusEnum('status').notNull().default('queued'),

    /**
     * The checks to run, as a JSON array.
     *
     * Defaults to the four deterministic Sprint 2 checks. A default in the
     * database — rather than only in application code — means a row inserted by
     * any future path still carries a coherent instruction set for the worker.
     */
    checks: jsonb('checks')
      .notNull()
      .default(sql`'["security_headers","tls","cookies","redirects"]'::jsonb`),

    /**
     * The Celery task id, echoed into the published message's `id`/`root_id`.
     * Nullable: it is only known once publication succeeds, and a row that failed
     * to enqueue legitimately never has one.
     */
    celeryTaskId: text('celery_task_id'),

    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),

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
  }),
);

export type Scan = typeof scans.$inferSelect;
export type NewScan = typeof scans.$inferInsert;
