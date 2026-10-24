import { z } from 'zod';

/**
 * How often a schedule runs. Stored as text in `scan_schedules.interval`.
 *
 * Two intervals rather than a cron expression on purpose: a cron editor is a
 * product surface of its own (validation, preview, timezone), and a scan cadence
 * that a user can reason about is what the roadmap asks for. Adding `monthly`
 * later is one entry in the map below plus one dictionary key.
 */
export const SCAN_INTERVALS = ['daily', 'weekly'] as const;

export type ScanInterval = (typeof SCAN_INTERVALS)[number];

/** Interval length in milliseconds. Fixed spans: no calendar or DST arithmetic. */
const INTERVAL_MS: Record<ScanInterval, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export const scanIntervalSchema = z.enum(SCAN_INTERVALS);

/**
 * The next instant a schedule should fire, given the moment it last fired.
 *
 * Pure and total: every input has exactly one answer, so the runner and the UI
 * can never disagree about when the next scan lands. An unknown interval is
 * treated as one day rather than thrown — a row written by an older build, or by
 * someone editing the database, must not wedge the whole runner.
 */
export function computeNextRunAt(from: Date, interval: string): Date {
  const span = INTERVAL_MS[interval as ScanInterval] ?? INTERVAL_MS.daily;
  return new Date(from.getTime() + span);
}

/** True when a schedule is enabled and its next run is due at `now`. */
export function isDue(schedule: { enabled: boolean; nextRunAt: Date | null }, now: Date): boolean {
  if (!schedule.enabled) {
    return false;
  }
  // A schedule with no `next_run_at` has never been armed (for example, a row
  // created before the column was populated). It is due immediately: the user
  // asked for a cadence, not for silence.
  if (schedule.nextRunAt === null) {
    return true;
  }
  return schedule.nextRunAt.getTime() <= now.getTime();
}

/** Input accepted by the create/update actions. A server action is public. */
export const createScheduleSchema = z.object({
  domainId: z.string().uuid(),
  interval: scanIntervalSchema,
});

export const updateScheduleSchema = z.object({
  scheduleId: z.string().uuid(),
  interval: scanIntervalSchema.optional(),
  enabled: z.boolean().optional(),
});
