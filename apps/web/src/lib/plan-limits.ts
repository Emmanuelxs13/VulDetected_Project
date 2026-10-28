import 'server-only';

import {
  and,
  count,
  domains,
  eq,
  gte,
  or,
  scanSchedules,
  scans,
  sql,
  users,
  type SubscriptionPlan,
} from '@vuldetected/db';
import { db } from '@/lib/db';
import { getPlanDefinition, type PlanDefinition } from '@/lib/plans';

/**
 * Server-side plan enforcement.
 *
 * Every check here answers one question with a database read and returns a
 * machine code, never a user-facing sentence. The caller decides how to phrase
 * the refusal (and translates it), which keeps this module usable from a server
 * action, a route handler and the scheduler without dragging i18n along.
 *
 * The alternative — trusting the UI to hide the button — is not enforcement.
 * A server action is a public endpoint: anybody can call it directly.
 */

export type PlanLimitCode =
  | 'domain_limit'
  | 'monthly_scan_limit'
  | 'concurrent_scan_limit'
  | 'schedule_limit';

export interface PlanUsage {
  domains: number;
  scansThisMonth: number;
  activeScans: number;
  schedules: number;
}

/** The plan behind an account, defaulting to Free when the row is missing. */
export async function getPlanForUser(userId: string): Promise<PlanDefinition> {
  const rows = await db()
    .select({ subscriptionPlan: users.subscriptionPlan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const plan: SubscriptionPlan = rows[0]?.subscriptionPlan ?? 'free';
  return getPlanDefinition(plan);
}

/** First instant of the current calendar month in UTC. */
export function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Current usage, in one round trip per counter.
 *
 * Deliberately not a single query with subselects: four small indexed counts are
 * easier to reason about and to test than one clever aggregate, and this runs
 * once per user action, not per request.
 */
export async function readPlanUsage(userId: string, now = new Date()): Promise<PlanUsage> {
  const database = db();

  const [domainRows, monthlyRows, activeRows, scheduleRows] = await Promise.all([
    database.select({ value: count() }).from(domains).where(eq(domains.userId, userId)),
    database
      .select({ value: count() })
      .from(scans)
      .innerJoin(domains, eq(scans.domainId, domains.id))
      .where(and(eq(domains.userId, userId), gte(scans.createdAt, startOfMonthUtc(now)))),
    database
      .select({ value: count() })
      .from(scans)
      .innerJoin(domains, eq(scans.domainId, domains.id))
      .where(
        and(
          eq(domains.userId, userId),
          or(eq(scans.status, 'queued'), eq(scans.status, 'running')),
        ),
      ),
    database
      .select({ value: count() })
      .from(scanSchedules)
      .where(eq(scanSchedules.userId, userId)),
  ]);

  return {
    domains: Number(domainRows[0]?.value ?? 0),
    scansThisMonth: Number(monthlyRows[0]?.value ?? 0),
    activeScans: Number(activeRows[0]?.value ?? 0),
    schedules: Number(scheduleRows[0]?.value ?? 0),
  };
}

/** What the caller can show the user without a second query. */
export interface PlanSnapshot {
  plan: PlanDefinition;
  usage: PlanUsage;
}

export async function readPlanSnapshot(userId: string, now = new Date()): Promise<PlanSnapshot> {
  const [plan, usage] = await Promise.all([getPlanForUser(userId), readPlanUsage(userId, now)]);
  return { plan, usage };
}

/**
 * Whether this account may add `normalizedHostname`.
 *
 * ## WHY THIS IS ONE QUERY AND NOT A SNAPSHOT
 *
 * `verifyOwnershipAction` runs this on every proof attempt, including the failed
 * ones, so the cost matters. The subselects answer all three questions the
 * decision needs — plan, domains already owned, and whether this hostname is one
 * of them — in a single round trip.
 *
 * ## WHY RE-VERIFYING IS FREE
 *
 * A user who loses the TXT record and re-publishes it is not adding a domain;
 * charging them a slot would let a botched DNS edit lock them out of their own
 * site. So ownership of the exact hostname wins over the cap.
 */
export async function checkDomainAllowance(
  userId: string,
  normalizedHostname: string,
): Promise<PlanLimitCode | null> {
  const rows = await db()
    .select({
      subscriptionPlan: users.subscriptionPlan,
      domainCount: sql<number>`(select count(*) from ${domains} where ${domains.userId} = ${users.id})`,
      alreadyOwned: sql<number>`(select count(*) from ${domains} where ${domains.userId} = ${users.id} and ${domains.normalizedHostname} = ${normalizedHostname})`,
      ownedByAnotherAccount: sql<number>`(select count(*) from ${domains} where ${domains.userId} <> ${users.id} and ${domains.normalizedHostname} = ${normalizedHostname})`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  const plan = getPlanDefinition(row?.subscriptionPlan ?? 'free');

  if (Number(row?.alreadyOwned ?? 0) > 0) {
    return null;
  }

  /**
   * A hostname another account already proved is refused by the upsert with a
   * specific message. Letting the cap answer first would blame the user's plan
   * for a domain they cannot have at all, so this case is not limited either.
   */
  if (Number(row?.ownedByAnotherAccount ?? 0) > 0) {
    return null;
  }

  return Number(row?.domainCount ?? 0) >= plan.maxDomains ? 'domain_limit' : null;
}

/**
 * Whether one more scan may be queued.
 *
 * Two independent limits, checked in the order the user is more likely to hit:
 * concurrency first (it is the one that is visible right now), then the monthly
 * allowance. A `null` monthly cap means unlimited.
 */
export async function checkScanAllowance(
  userId: string,
  now = new Date(),
): Promise<PlanLimitCode | null> {
  const { plan, usage } = await readPlanSnapshot(userId, now);

  if (usage.activeScans >= plan.concurrentScans) return 'concurrent_scan_limit';
  if (plan.monthlyScans !== null && usage.scansThisMonth >= plan.monthlyScans) {
    return 'monthly_scan_limit';
  }
  return null;
}

/** Whether one more recurring schedule fits. */
export async function checkScheduleAllowance(
  userId: string,
  now = new Date(),
): Promise<PlanLimitCode | null> {
  const { plan, usage } = await readPlanSnapshot(userId, now);
  return usage.schedules >= plan.maxSchedules ? 'schedule_limit' : null;
}
