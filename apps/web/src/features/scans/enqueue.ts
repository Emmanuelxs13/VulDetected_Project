import 'server-only';

import { domains, eq, scans } from '@vuldetected/db';

import { audit } from '@/lib/audit';
import { enqueueScanJob } from '@/lib/celery';
import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';

/**
 * The default check set, kept in one place so a manually submitted scan and a
 * scheduled one ask the worker for the same work. The column default in
 * `scans.checks` carries the same list; both exist because a row can legitimately
 * be inserted by either path.
 */
export const DEFAULT_CHECKS = ['security_headers', 'tls', 'cookies', 'redirects'] as const;

/** The normalized target a scan is pointed at (SS-1). */
export interface ScanTarget {
  /** Full URL as stored in `scans.target_url`. */
  url: string;
  scheme: 'http' | 'https';
  host: string;
  port: number;
  baseUrl: string;
}

export type EnqueueScanOutcome =
  { ok: true; scanId: string } | { ok: false; error: 'domain_missing' | 'enqueue_failed' };

/**
 * Inserts a `queued` scan row and publishes the job, in that order (SS-6).
 *
 * ## WHY THIS IS A MODULE AND NOT PART OF A SERVER ACTION
 *
 * Two callers need exactly this sequence: the interactive submit
 * (`submitScanAction`) and the scheduler (`runDueSchedules`). Duplicating it
 * would create a second place that could get the "row first, then publish"
 * order wrong, and that ordering is the whole recoverability argument — a row
 * that failed to enqueue is visible and repairable, while a broker message with
 * no row is invisible and unrepairable.
 *
 * A `'use server'` module would export this as a client-callable endpoint, which
 * would let any visitor queue a scan for a hostname they never proved. Hence a
 * plain server module.
 *
 * The caller is responsible for having authorised the domain first; this
 * function trusts `domainId` only because every caller obtains it from an
 * ownership-checked lookup.
 */
export async function enqueueScanForDomain(input: {
  domainId: string;
  target: ScanTarget;
  /** The user credited in the audit trail, or null for an automated run. */
  actorUserId: string | null;
  source: 'manual' | 'schedule';
}): Promise<EnqueueScanOutcome> {
  const domainRows = await db()
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.id, input.domainId))
    .limit(1);

  if (domainRows.length === 0) {
    return { ok: false, error: 'domain_missing' };
  }

  const scanRows = await db()
    .insert(scans)
    .values({
      domainId: input.domainId,
      targetUrl: input.target.url,
      status: 'queued',
      checks: [...DEFAULT_CHECKS],
    })
    .returning({ id: scans.id });

  const scanId = scanRows[0]?.id;
  if (scanId === undefined) {
    return { ok: false, error: 'enqueue_failed' };
  }

  try {
    const env = getEnv();
    await enqueueScanJob({
      scan_id: scanId,
      domain_id: input.domainId,
      target: {
        scheme: input.target.scheme,
        host: input.target.host,
        port: input.target.port,
        base_url: input.target.baseUrl,
      },
      checks: [...DEFAULT_CHECKS],
      callback_base_url: env.NEXT_PUBLIC_APP_URL ?? env.AUTH_URL ?? 'http://localhost:3000',
    });
  } catch {
    // Publication failed: the row stays, marked failed, so the gap is visible
    // and the schedule does not silently look healthy.
    await db()
      .update(scans)
      .set({ status: 'failed', error: 'enqueue_failed' })
      .where(eq(scans.id, scanId));

    await audit({
      action: 'scan.failed',
      actorUserId: input.actorUserId,
      targetType: 'scan',
      targetId: scanId,
      metadata: { reason: 'enqueue_failed', source: input.source },
    });

    return { ok: false, error: 'enqueue_failed' };
  }

  await audit({
    action: 'scan.enqueued',
    actorUserId: input.actorUserId,
    targetType: 'scan',
    targetId: scanId,
    metadata: { source: input.source },
  });

  return { ok: true, scanId };
}

/** The target a scheduled scan always uses: the domain over HTTPS on 443. */
export function scheduleTarget(hostname: string): ScanTarget {
  const url = `https://${hostname}`;
  return { url, scheme: 'https', host: hostname, port: 443, baseUrl: url };
}
