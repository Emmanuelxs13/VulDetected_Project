import 'server-only';

import { and, count, domains, eq, findings, notifications, scans, users } from '@vuldetected/db';

import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';

import { enqueueMail } from './outbox';
import {
  mailLocaleOf,
  renderMail,
  RESET_TTL_MINUTES,
  VERIFICATION_TTL_HOURS,
  type MailLocale,
  type MailTemplate,
  type MailTemplateData,
  type SeverityCounts,
} from './templates';

/**
 * The product-level mail API.
 *
 * Callers say *what happened* (`a scan finished`, `this account needs to confirm
 * its address`); this module decides which template that is, in which language,
 * and turns it into an outbox row. Keeping the template choice here rather than
 * at each call site is what stops the verification email and the reset email
 * from drifting into two different shapes.
 *
 * None of these functions throw on a mail problem in a user-facing path: the
 * outbox write is the only failure that matters, and that is caught where the
 * caller cannot be allowed to fail (registration, callback). See the call sites.
 */

/** Public origin for links inside emails. */
export function appUrl(): string {
  const env = getEnv();
  return env.NEXT_PUBLIC_APP_URL ?? env.AUTH_URL;
}

export interface TransactionalTarget {
  to: string;
  locale?: string | null;
}

async function queue<T extends MailTemplate>(
  template: T,
  target: TransactionalTarget,
  data: MailTemplateData[T],
): Promise<void> {
  const locale: MailLocale = mailLocaleOf(target.locale);
  const rendered = renderMail(template, locale, data);

  await enqueueMail({
    to: target.to,
    template,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

/** "Confirm your address" — sent at registration. */
export async function queueVerificationEmail(
  target: TransactionalTarget & { url: string },
): Promise<void> {
  await queue('verify_email', target, {
    url: target.url,
    expiresInHours: VERIFICATION_TTL_HOURS,
  });
}

/** "Choose a new password" — sent by the reset request. */
export async function queuePasswordResetEmail(
  target: TransactionalTarget & { url: string },
): Promise<void> {
  await queue('reset_password', target, {
    url: target.url,
    expiresInMinutes: RESET_TTL_MINUTES,
  });
}

/**
 * Better Auth's default lifetimes, re-exported so a caller that renders mail
 * does not have to know which module owns them.
 */
export { RESET_TTL_MINUTES, VERIFICATION_TTL_HOURS } from './templates';

interface ScanMailContext {
  scanId: string;
  targetUrl: string;
  hostname: string;
  userEmail: string;
  locale: string | null;
}

async function loadScanMailContext(scanId: string): Promise<ScanMailContext | null> {
  const rows = await db()
    .select({
      scanId: scans.id,
      targetUrl: scans.targetUrl,
      hostname: domains.normalizedHostname,
      userEmail: users.email,
      locale: users.locale,
    })
    .from(scans)
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .innerJoin(users, eq(domains.userId, users.id))
    .where(eq(scans.id, scanId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Severity histogram for one scan.
 *
 * One grouped query instead of five counts: the summary is rendered from the
 * same snapshot in both the completed email and the alert, and they must agree.
 */
export async function readSeverityCounts(scanId: string): Promise<SeverityCounts> {
  const rows = await db()
    .select({ severity: findings.severity, total: count() })
    .from(findings)
    .where(and(eq(findings.scanId, scanId), eq(findings.status, 'open')))
    .groupBy(findings.severity);

  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, other: 0, total: 0 };

  for (const row of rows) {
    const total = Number(row.total);
    counts.total += total;
    switch (row.severity) {
      case 'critical':
        counts.critical += total;
        break;
      case 'high':
        counts.high += total;
        break;
      case 'medium':
        counts.medium += total;
        break;
      case 'low':
        counts.low += total;
        break;
      default:
        counts.other += total;
        break;
    }
  }

  return counts;
}

/**
 * After a scan reaches a terminal state: the summary email, plus a dedicated
 * alert when the run found something critical.
 *
 * The notification row is written for every plan. It used to be gated to active
 * Pro/Business subscriptions, which made a guarantee ("free lets you try every
 * capability") false for the one alert that matters most; plan differences are
 * numeric limits, never hiding a finding from the person who asked for the scan.
 */
export async function notifyScanCompleted(scanId: string): Promise<void> {
  const context = await loadScanMailContext(scanId);
  if (context === null) {
    return;
  }

  const counts = await readSeverityCounts(scanId);
  const scanUrl = `${appUrl()}/scans/${scanId}`;

  await queue(
    'scan_completed',
    { to: context.userEmail, locale: context.locale },
    {
      hostname: context.hostname,
      targetUrl: context.targetUrl,
      scanUrl,
      counts,
    },
  );

  if (counts.critical === 0) {
    return;
  }

  const critical = await db()
    .select({ title: findings.title, affectedUrl: findings.affectedUrl })
    .from(findings)
    .where(
      and(
        eq(findings.scanId, scanId),
        eq(findings.severity, 'critical'),
        eq(findings.status, 'open'),
      ),
    )
    .orderBy(findings.checkName)
    .limit(10);

  await queue(
    'new_critical_finding',
    { to: context.userEmail, locale: context.locale },
    {
      hostname: context.hostname,
      scanUrl,
      findings: critical.map((row) => ({
        title: row.title,
        affectedUrl: row.affectedUrl,
      })),
    },
  );

  /**
   * The in-app bell. `notifications` has `unique(scan_id, type)`, so a replayed
   * callback cannot produce a second badge for the same scan.
   */
  const owner = await db()
    .select({ userId: domains.userId })
    .from(scans)
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(eq(scans.id, scanId))
    .limit(1);

  const userId = owner[0]?.userId;
  if (userId !== undefined) {
    await db()
      .insert(notifications)
      .values({
        userId,
        scanId,
        type: 'critical_finding',
        message: 'A completed scan contains a critical finding.',
      })
      .onConflictDoNothing();
  }
}
