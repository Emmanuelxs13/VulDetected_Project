'use server';

import { and, desc, domains, eq, scanSchedules } from '@vuldetected/db';

import type { ActionResult } from '@/features/auth/actions';
import { requireUser } from '@/features/auth/session';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { checkScheduleAllowance } from '@/lib/plan-limits';

import { computeNextRunAt, createScheduleSchema, updateScheduleSchema } from './schedule-schema';
/** What the schedule list renders. */
export interface ScheduleRow {
  id: string;
  domainId: string;
  hostname: string;
  interval: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

/**
 * Every schedule owned by the caller, joined to its domain.
 *
 * Ownership is enforced in the WHERE clause, not after the fact: a schedule row
 * carries `user_id`, and every read and write below scopes on it. There is no
 * "list all, then filter in the UI" path that could leak another account's
 * targets.
 */
export async function listSchedulesAction(): Promise<ActionResult<ScheduleRow[]>> {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const rows = await db()
    .select({
      id: scanSchedules.id,
      domainId: scanSchedules.domainId,
      hostname: domains.normalizedHostname,
      interval: scanSchedules.interval,
      enabled: scanSchedules.enabled,
      lastRunAt: scanSchedules.lastRunAt,
      nextRunAt: scanSchedules.nextRunAt,
    })
    .from(scanSchedules)
    .innerJoin(domains, eq(scanSchedules.domainId, domains.id))
    .where(eq(scanSchedules.userId, userId))
    .orderBy(desc(scanSchedules.createdAt));

  return {
    success: true,
    data: rows.map((row) => ({
      id: row.id,
      domainId: row.domainId,
      hostname: row.hostname,
      interval: row.interval,
      enabled: row.enabled,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      nextRunAt: row.nextRunAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Creates a schedule for one of the caller's *verified* domains.
 *
 * The domain lookup requires `verified = true` as well as ownership: a cadence
 * attached to an unproven hostname would queue scans of a site the user never
 * demonstrated they control, which is the exact scan-target abuse the ownership
 * flow exists to prevent.
 *
 * One schedule per domain: a second row for the same domain would queue two
 * scans on the same tick, so an existing schedule is updated instead of
 * silently duplicated.
 */
export async function createScheduleAction(input: {
  domainId: string;
  interval: string;
}): Promise<ActionResult<{ id: string }>> {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = createScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid schedule.' };
  }

  const domainRows = await db()
    .select({ id: domains.id })
    .from(domains)
    .where(
      and(
        eq(domains.id, parsed.data.domainId),
        eq(domains.userId, userId),
        eq(domains.verified, true),
      ),
    )
    .limit(1);

  if (domainRows.length === 0) {
    return { success: false, error: 'Domain not verified' };
  }

  const now = new Date();
  const nextRunAt = computeNextRunAt(now, parsed.data.interval);

  const existing = await db()
    .select({ id: scanSchedules.id })
    .from(scanSchedules)
    .where(eq(scanSchedules.domainId, parsed.data.domainId))
    .limit(1);

  if (existing[0] !== undefined) {
    const updated = await db()
      .update(scanSchedules)
      .set({ interval: parsed.data.interval, enabled: true, nextRunAt, userId })
      .where(eq(scanSchedules.id, existing[0].id))
      .returning({ id: scanSchedules.id });

    const id = updated[0]?.id;
    if (id === undefined) {
      return { success: false, error: 'Service unavailable' };
    }

    await audit({
      action: 'scan_schedule.updated',
      actorUserId: userId,
      targetType: 'scan_schedule',
      targetId: id,
      metadata: { interval: parsed.data.interval, enabled: true },
    });

    return { success: true, data: { id } };
  }

  /**
   * The cap applies to CREATING a schedule, not to editing one that already
   * exists: a user at the limit must still be able to change the cadence or
   * pause the schedule they already have.
   */
  const limit = await checkScheduleAllowance(userId);
  if (limit !== null) {
    return { success: false, error: limit };
  }

  const inserted = await db()
    .insert(scanSchedules)
    .values({
      domainId: parsed.data.domainId,
      userId,
      interval: parsed.data.interval,
      enabled: true,
      nextRunAt,
    })
    .returning({ id: scanSchedules.id });

  const id = inserted[0]?.id;
  if (id === undefined) {
    return { success: false, error: 'Service unavailable' };
  }

  await audit({
    action: 'scan_schedule.created',
    actorUserId: userId,
    targetType: 'scan_schedule',
    targetId: id,
    metadata: { interval: parsed.data.interval },
  });

  return { success: true, data: { id } };
}

/**
 * Changes the cadence or pauses/resumes a schedule.
 *
 * The `user_id` predicate is part of the UPDATE itself, so a guessed schedule id
 * belonging to another account matches zero rows and returns the same "not
 * found" a nonexistent id does. Ownership is not a check that can be forgotten
 * between a read and a write here.
 */
export async function updateScheduleAction(input: {
  scheduleId: string;
  interval?: string;
  enabled?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = updateScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid schedule.' };
  }

  const currentRows = await db()
    .select({ id: scanSchedules.id, interval: scanSchedules.interval })
    .from(scanSchedules)
    .where(and(eq(scanSchedules.id, parsed.data.scheduleId), eq(scanSchedules.userId, userId)))
    .limit(1);
  const current = currentRows[0];
  if (current === undefined) {
    return { success: false, error: 'Schedule not found' };
  }

  const now = new Date();
  const patch: {
    interval?: string;
    enabled?: boolean;
    nextRunAt?: Date;
  } = {};

  if (parsed.data.interval !== undefined) {
    patch.interval = parsed.data.interval;
    // A cadence change re-arms from now: leaving the old `next_run_at` would
    // apply the new interval only after the previous one elapsed.
    patch.nextRunAt = computeNextRunAt(now, parsed.data.interval);
  }
  if (parsed.data.enabled !== undefined) {
    patch.enabled = parsed.data.enabled;
    if (parsed.data.enabled && parsed.data.interval === undefined) {
      // Resuming a paused schedule re-arms it rather than firing immediately for
      // every tick it was paused.
      patch.nextRunAt = computeNextRunAt(now, current.interval);
    }
  }

  if (Object.keys(patch).length === 0) {
    return { success: false, error: 'Nothing to update.' };
  }

  const updated = await db()
    .update(scanSchedules)
    .set(patch)
    .where(and(eq(scanSchedules.id, parsed.data.scheduleId), eq(scanSchedules.userId, userId)))
    .returning({ id: scanSchedules.id });

  const id = updated[0]?.id;
  if (id === undefined) {
    return { success: false, error: 'Schedule not found' };
  }

  await audit({
    action: 'scan_schedule.updated',
    actorUserId: userId,
    targetType: 'scan_schedule',
    targetId: id,
    metadata: {
      interval: patch.interval ?? null,
      enabled: patch.enabled ?? null,
    },
  });

  return { success: true, data: { id } };
}

/** Deletes a schedule. Ownership scoped in the DELETE, as above. */
export async function deleteScheduleAction(scheduleId: string): Promise<ActionResult<null>> {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const deleted = await db()
    .delete(scanSchedules)
    .where(and(eq(scanSchedules.id, scheduleId), eq(scanSchedules.userId, userId)))
    .returning({ id: scanSchedules.id });

  if (deleted.length === 0) {
    return { success: false, error: 'Schedule not found' };
  }

  await audit({
    action: 'scan_schedule.deleted',
    actorUserId: userId,
    targetType: 'scan_schedule',
    targetId: scheduleId,
  });

  return { success: true, data: null };
}
