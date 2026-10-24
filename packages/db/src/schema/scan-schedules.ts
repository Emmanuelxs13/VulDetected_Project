import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
    userIdx: index('scan_schedules_user_idx').on(table.userId),
    nextRunIdx: index('scan_schedules_next_run_idx').on(table.nextRunAt),
  }),
);

export type ScanSchedule = typeof scanSchedules.$inferSelect;
export type NewScanSchedule = typeof scanSchedules.$inferInsert;
