import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { domains } from './domains';
import { users } from './users';

export const scanSchedules = pgTable(
  'scan_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    interval: text('interval').notNull().default('daily'),
    enabled: boolean('enabled').notNull().default(true),

    /**
     * The exact target this schedule scans, inherited from the domain's most
     * recent scan when the schedule is created.
     *
     * ## Why the schedule stores a target instead of assuming `https://host`
     *
     * `https://<hostname>` on 443 is the right default for a production site, and
     * it is what a schedule with a NULL `target_url` uses. But a domain can
     * legitimately be served somewhere else: a staging host on a non-standard
     * port, a site that is still HTTP-only, or a demo fixture. A schedule that
     * ignored that would silently scan a different URL than the one the user
     * verified and reported on, and the resulting history would compare two
     * different things while looking like one trend.
     *
     * NULL means "no target was recorded; use the HTTPS default".
     */
    targetUrl: text('target_url'),

    /**
     * Whether a NEW critical finding must notify the owner. On by default:
     * silence about a critical regression is the failure mode users cannot
     * forgive, and it costs nothing to switch off per schedule.
     */
    alertOnNewCritical: boolean('alert_on_new_critical').notNull().default(true),

    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    domainIdx: index('scan_schedules_domain_idx').on(table.domainId),
    domainUnique: uniqueIndex('scan_schedules_domain_unique').on(table.domainId),
    userIdx: index('scan_schedules_user_idx').on(table.userId),
    nextRunIdx: index('scan_schedules_next_run_idx').on(table.nextRunAt),
  }),
);

export type ScanSchedule = typeof scanSchedules.$inferSelect;
export type NewScanSchedule = typeof scanSchedules.$inferInsert;
