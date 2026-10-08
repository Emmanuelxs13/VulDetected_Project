import 'server-only';

import { auditLogs } from '@vuldetected/db';
import { headers } from 'next/headers';

import { db } from './db';

/**
 * Audit trail writer.
 *
 * ## THE ONE INVARIANT: `audit()` NEVER THROWS
 *
 * An audit failure must not break the operation it is recording. If a missing
 * `audit_logs` table took down every login, the response to that outage would be
 * to disable auditing — the exact outcome an audit trail exists to prevent. So
 * every failure is caught, and logged to stderr, and the request continues.
 *
 * The trade-off, stated plainly: an audit write can fail **silently** as far as
 * the user is concerned. That is why the error goes to stderr with full context —
 * the signal exists for operators even though it is invisible to callers.
 *
 * ## WHAT MUST NEVER BE WRITTEN HERE
 *
 * No passwords, no raw tokens, no cookies, no authorization headers, no whole
 * request bodies. An audit log is a document an operator is asked to hand over
 * during an incident, so a credential written here ends up in an incident report
 * and in every backup that contains it. `AuditEvent.metadata` is typed as
 * `Record<string, string | number | boolean | null>` rather than `unknown`
 * precisely so that a nested object — where a header bag or a token would hide —
 * is a type error instead of a review miss.
 */

/** The closed set of actions. A union, not a string, so a typo cannot ship. */
export type AuditAction =
  'user.registered' | 'auth.login_succeeded' | 'auth.login_failed' | 'auth.logged_out';

export interface AuditEvent {
  action: AuditAction;
  /**
   * The authenticated user. NULLABLE ON PURPOSE: `auth.login_failed` is one of
   * the most valuable rows this table will ever hold and it has no actor yet,
   * because authentication failed. Requiring a non-null actor would mean losing
   * exactly the events that matter.
   */
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /**
   * Structured context. Scalars only — see the note above on why this is not
   * `Record<string, unknown>`.
   */
  metadata?: Record<string, string | number | boolean | null> | null;
}

/**
 * Reads the client address from the request headers.
 *
 * Returns `null` rather than an empty string so that "no address" and "empty
 * address" are the same value, and so `audit_logs.ip` stays `NULL` instead of
 * holding an un-parseable string. `inet` rejects an empty string, which would
 * turn a missing header into a failed insert — and therefore, per the invariant
 * above, into a lost audit row.
 */
async function clientIp(): Promise<string | null> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get('x-forwarded-for');
    if (forwarded) {
      // Left-most entry is the original client. Taken as reported, NOT trusted:
      // see `trustedOrigins` in `auth.ts` — this is for the audit record, not for
      // a security decision.
      const first = forwarded.split(',')[0]?.trim();
      if (first) return first;
    }
    return headerList.get('x-real-ip');
  } catch {
    // `headers()` throws outside a request scope (e.g. a script). An audit row
    // without an address still beats no audit row.
    return null;
  }
}

async function clientUserAgent(): Promise<string | null> {
  try {
    const headerList = await headers();
    return headerList.get('user-agent');
  } catch {
    return null;
  }
}

/**
 * Writes one audit row. Never throws.
 *
 * @param event what happened
 * @param explicitIp overrides header-derived IP, for flows where the caller
 *   already has a trustworthy address
 */
export async function audit(event: AuditEvent, explicitIp?: string | null): Promise<void> {
  try {
    const [ip, userAgent] = await Promise.all([clientIp(), clientUserAgent()]);

    await db()
      .insert(auditLogs)
      .values({
        action: event.action,
        actorUserId: event.actorUserId ?? null,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        metadata: event.metadata ?? {},
        ip: explicitIp ?? ip,
        userAgent,
      });
  } catch (error) {
    // The catch is the feature. Losing an audit row must not lose the request.
    console.error('[audit] failed to write audit row', {
      action: event.action,
      actorUserId: event.actorUserId ?? null,
      targetId: event.targetId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
