import { and, asc, domains, eq, inArray, isNull, lte, or, scanSchedules, scans, sql } from '@vuldetected/db';

import { enqueueScanForDomain, scheduleTargetFor } from '@/features/scans/enqueue';
import { computeNextRunAt, isDue } from '@/features/scans/schedule-schema';
import { db } from '@/lib/db';

/**
 * Upper bound on how many schedules one runner pass will fire.
 *
 * A pass is a synchronous HTTP request, and every fired schedule costs one
 * broker publish. The cap turns "the runner was down for a week" into several
 * bounded passes instead of one request that times out halfway and leaves the
 * remaining rows due forever.
 */
export const RUN_BATCH_SIZE = 25;

export interface RunSchedulesResult {
  due: number;
  enqueued: number;
  failed: number;
  skipped: number;
}

/**
 * Fires every schedule that is due, once.
 *
 * ## WHY CLAIM FIRST, THEN ENQUEUE
 *
 * This runner is invoked by an external clock and can overlap with itself: two
 * overlapping requests that both read "due" would queue two scans for the same
 * domain. So each row is claimed by an UPDATE that both advances
 * `next_run_at` and predicates on the previous value. The update is the lock:
 * the row that a concurrent pass already advanced no longer matches `lte(now)`,
 * so exactly one pass wins it.
 *
 * If publishing then fails, the claim is NOT rolled back. Retrying the same tick
 * would turn a broker outage into an unbounded burst as soon as the broker
 * returns; instead the failed scan row is visible as `failed`/`enqueue_failed`
 * and the schedule waits for its next interval. The trade-off is deliberate:
 * one missed run is auditable, an unbounded burst is not.
 *
 * ## WHY DISABLED AND UNVERIFIED DOMAINS ARE SKIPPED
 *
 * A schedule can outlive the verification that justified it. Re-checking
 * `domains.verified` at run time — not only at creation — means revoking a
 * domain stops its traffic on the next tick rather than at the next user visit.
 * The unverified row is still claimed (its clock advances) so it cannot sit at
 * the head of every batch and starve verified schedules behind it.
 *
 * ## WHY THE CLOCK IS INJECTABLE
 *
 * `now` is a parameter so a test can assert the exact instant written to
 * `last_run_at`/`next_run_at` without freezing the process clock. The production
 * caller passes nothing and gets the real time.
 */
export async function runDueSchedules(now: Date = new Date()): Promise<RunSchedulesResult> {
  const dueRows = await db()
    .select({
      id: scanSchedules.id,
      domainId: scanSchedules.domainId,
      userId: scanSchedules.userId,
      interval: scanSchedules.interval,
      enabled: scanSchedules.enabled,
      nextRunAt: scanSchedules.nextRunAt,
      targetUrl: scanSchedules.targetUrl,
      hostname: domains.normalizedHostname,
      verified: domains.verified,
    })
    .from(scanSchedules)
    .innerJoin(domains, eq(scanSchedules.domainId, domains.id))
    .where(
      and(
        eq(scanSchedules.enabled, true),
        or(isNull(scanSchedules.nextRunAt), lte(scanSchedules.nextRunAt, now)),
      ),
    )
    .orderBy(asc(scanSchedules.nextRunAt))
    .limit(RUN_BATCH_SIZE);

  const result: RunSchedulesResult = { due: dueRows.length, enqueued: 0, failed: 0, skipped: 0 };

  for (const row of dueRows) {
    if (!isDue({ enabled: row.enabled, nextRunAt: row.nextRunAt }, now)) {
      result.skipped += 1;
      continue;
    }

    // Compare-and-set: only the pass that still sees the value it read claims it.
    const previous = row.nextRunAt;
    const claimed = await db()
      .update(scanSchedules)
      .set({ lastRunAt: now, nextRunAt: computeNextRunAt(now, row.interval) })
      .where(
        and(
          eq(scanSchedules.id, row.id),
          previous === null
            ? isNull(scanSchedules.nextRunAt)
            : /**
               * Truncated to milliseconds on purpose.
               *
               * `next_run_at` is a `timestamptz`, which stores microseconds, and
               * the driver hands it back as a JS `Date`, which only holds
               * milliseconds. A plain equality would therefore never match a
               * value written by SQL (`now()`, a column default, the demo
               * accelerator) and the schedule would silently never fire — the
               * runner would report it as skipped on every tick, forever.
               */
              sql`date_trunc('milliseconds', ${scanSchedules.nextRunAt}) = ${previous.toISOString()}::timestamptz`,
        ),
      )
      .returning({ id: scanSchedules.id });

    if (claimed.length === 0) {
      result.skipped += 1;
      continue;
    }

    if (!row.verified) {
      result.skipped += 1;
      continue;
    }

    /**
     * Overlap is skipped, not queued (Sprint 2, CA-23).
     *
     * If the previous run of this domain is still queued or running, firing
     * another scan would put two workers on the same target and double the load
     * on someone else's server. The window is consumed — `next_run_at` already
     * advanced in the claim above — because replaying it after the overlap
     * clears would just create the burst the skip exists to prevent.
     */
    const active = await db()
      .select({ id: scans.id })
      .from(scans)
      .where(
        and(eq(scans.domainId, row.domainId), inArray(scans.status, ['queued', 'running'])),
      )
      .limit(1);

    if (active.length > 0) {
      result.skipped += 1;
      continue;
    }

    const outcome = await enqueueScanForDomain({
      domainId: row.domainId,
      target: scheduleTargetFor(row.hostname, row.targetUrl),
      actorUserId: row.userId,
      source: 'schedule',
    });

    if (outcome.ok) {
      result.enqueued += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}
