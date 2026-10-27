import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { findingStatusEnum, severityEnum } from './enums';
import { scans } from './scans';

/**
 * `findings` — one normalised security finding (Sprint 2, DM-3/DM-4/DM-5).
 *
 * The shape is deliberately tool-independent: Sprint 2 findings come from the
 * worker's own deterministic checks, but the same columns must accept a future
 * Nuclei or ZAP result without a schema change (DM-4). The tool-specific payload
 * is preserved verbatim in `raw`, while `evidence` holds the structured "what we
 * observed" that remediation code will consume in S3.
 *
 * Severity is stored but never computed in Sprint 2: every row is
 * `unclassified` (DM-3). The column exists so classification in S3 is a data
 * change.
 */
export const findings = pgTable(
  'findings',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** The scan that produced this occurrence. Cascades with the scan. */
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),

    /**
     * Stable, tool-independent identity: `sha256(domain_id | check_name |
     * affected_url)`, computed by the worker (design D3).
     *
     * It is stable across re-scans of the same domain — it does NOT include
     * `scan_id` — which is what lets Sprint 3 group occurrences over time. It is
     * unique within a scan (see the index below) but not across scans, because
     * every occurrence is retained (DM-6) rather than deduplicated away.
     */
    findingKey: text('finding_key').notNull(),

    /** Always `unclassified` in Sprint 2; classification rules land in S3 (DM-3). */
    severity: severityEnum('severity').notNull().default('unclassified'),
    status: findingStatusEnum('status').notNull().default('open'),

    /** Which deterministic check produced the finding (e.g. `security_headers`). */
    checkName: text('check_name').notNull(),

    /**
     * OWASP Top 10 (2021) category code (`A01`, `A03`, …).
     *
     * Nullable on purpose. A check that cannot be mapped honestly must leave this
     * empty instead of guessing: a wrong category turns a real finding into
     * misleading remediation advice, which is worse than "not mapped yet".
     */
    owaspCategory: text('owasp_category'),

    /**
     * True when this occurrence did NOT appear in the previous scan of the same
     * domain. Computed at ingest time by comparing `finding_key` against the
     * latest earlier scan, because "new" is a fact about a moment: recomputing it
     * later from a changing scan history would silently rewrite the past.
     */
    isNew: boolean('is_new').notNull().default(false),

    title: text('title').notNull(),
    description: text('description').notNull(),

    /** The specific URL the finding applies to, not just the scan target. */
    affectedUrl: text('affected_url').notNull(),

    /** Structured observation consumed by remediation logic. `{}` when absent. */
    evidence: jsonb('evidence')
      .notNull()
      .default(sql`'{}'::jsonb`),

    /** Verbatim tool output, preserved for audit and future re-parsing. */
    raw: jsonb('raw'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    /**
     * Intra-scan deduplication (D3): the second identical finding in one scan is
     * discarded by the database via `ON CONFLICT DO NOTHING`, not by application
     * logic. The leading `scan_id` also serves the "findings for this scan"
     * listing, so no separate scan index is needed.
     */
    scanKeyUnique: uniqueIndex('findings_scan_key_unique').on(table.scanId, table.findingKey),

    /**
     * Cross-scan grouping for Sprint 3 (trend over re-scans): "every occurrence
     * of this stable key", independent of scan.
     */
    keyIdx: index('findings_key_idx').on(table.findingKey),
  }),
);

export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
