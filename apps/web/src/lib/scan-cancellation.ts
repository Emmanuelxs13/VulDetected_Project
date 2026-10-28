import 'server-only';

import { withRedis } from '@/lib/redis';

/**
 * Cooperative cancellation channel between the web app and the worker.
 *
 * ## WHY A FLAG AND NOT A BROKER REVOKE
 *
 * The scan lifecycle is owned by `scans.status`, written only by the web app
 * (design D9). Revoking a Celery job by id would require a result backend the
 * worker deliberately does not enable, and it would still race with a job that
 * already started. A flag the worker checks before every outbound request works
 * in both cases: a queued job sees it on its first request and stops before
 * touching the target, and a running job stops at the next checkpoint.
 *
 * ## WHY A TTL
 *
 * The key must not outlive the scan it belongs to. If a cancellation arrives
 * just as the scan finishes, the TTL guarantees the flag disappears instead of
 * waiting for the next process to notice. The window only has to cover the scan
 * timeout (300 s in the worker's task limits), so one hour is generous and still
 * self-cleaning.
 *
 * ## WHY FAILURE IS SILENT
 *
 * `cancelScanAction` already moved the row to `cancelled`, which is the durable
 * truth: the callback refuses to touch a cancelled scan. If Redis is down the
 * worker will run to completion and its callback will be ignored. That is a
 * worse outcome than an immediate stop but a far better one than failing the
 * user's cancellation because an internal channel was unavailable.
 */

export const SCAN_CANCEL_KEY_PREFIX = 'vuldetected:scan:cancel:';
export const SCAN_CANCEL_TTL_SECONDS = 3600;

export function scanCancelKey(scanId: string): string {
  return `${SCAN_CANCEL_KEY_PREFIX}${scanId}`;
}

/** Publishes the cancellation flag. Returns whether Redis accepted it. */
export async function requestScanCancellation(scanId: string): Promise<boolean> {
  try {
    await withRedis((client) => client.set(scanCancelKey(scanId), '1', { EX: SCAN_CANCEL_TTL_SECONDS }));
    return true;
  } catch {
    return false;
  }
}

/** Test/diagnostics helper: is the flag set for this scan? */
export async function isScanCancellationRequested(scanId: string): Promise<boolean> {
  try {
    return (await withRedis((client) => client.exists(scanCancelKey(scanId)))) === 1;
  } catch {
    return false;
  }
}
