import 'server-only';

import { and, asc, domains, eq, isNull, lte, or, scanSchedules } from '@vuldetected/db';

import { enqueueScanForDomain, scheduleTarget } from '@/features/scans/enqueue';
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
            : eq(scanSchedules.nextRunAt, previous),
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

    const outcome = await enqueueScanForDomain({
      domainId: row.domainId,
      target: scheduleTarget(row.hostname),
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
