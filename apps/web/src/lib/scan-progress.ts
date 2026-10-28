/**
 * ETA for a running scan, computed from the events the server already stores.
 *
 * ## WHY THE ESTIMATE IS DERIVED FROM HISTORY, NOT A CONSTANT
 *
 * A hardcoded "about two minutes" is wrong for every site that is not the one it
 * was measured on: ten checks against a fast static site and ten against a slow
 * application are not the same work. The only honest predictor available is how
 * long THIS scan's completed checks actually took.
 *
 * ## WHY IT IS PURE
 *
 * The component that renders the number is also the one that receives the live
 * stream, and both a reload and a live update must show the same estimate for the
 * same history. A function of `(events, checks)` gives that for free, and lets the
 * arithmetic be tested without a browser.
 *
 * ## WHAT IT DOES NOT CLAIM
 *
 * With zero completed checks there is nothing to average, so `remainingMs` is
 * `null` and the UI says "calculating" instead of inventing a number. Likewise a
 * finished scan has no remaining time at all.
 */

export interface ScanProgressEvent {
  type: string;
  payload: unknown;
  /** ISO-8601 instant, as stored in `scan_events.created_at`. */
  createdAt: string;
}

export type ScanProgressState = 'pending' | 'running' | 'finished';

export interface ScanProgressEstimate {
  /** How many checks this scan is expected to run (0 when the list is unknown). */
  total: number;
  /** How many distinct checks reported `check.completed`. */
  completed: number;
  /** 0–100, rounded. 0 when `total` is unknown. */
  percent: number;
  /** Mean duration of the completed checks, in milliseconds. */
  averageCheckMs: number | null;
  /** Estimated time left, in milliseconds. `null` when it cannot be estimated. */
  remainingMs: number | null;
  state: ScanProgressState;
}

const FINISHING_EVENTS = new Set(['scan.completed', 'scan.failed', 'scan.cancelled']);

function readCheckName(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'check' in payload) {
    const value = (payload as { check: unknown }).check;
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }
  return null;
}

function toMillis(iso: string): number | null {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
}

export function estimateScanProgress(
  events: readonly ScanProgressEvent[],
  checks: readonly string[],
): ScanProgressEstimate {
  const total = checks.length;
  const known = new Set(checks);

  /** Start instant of each check, from its own `check.started`. */
  const startedAt = new Map<string, number>();
  const completed = new Set<string>();
  const durations: number[] = [];

  let lastBoundary: number | null = null;
  let state: ScanProgressState = 'pending';

  for (const event of events) {
    const at = toMillis(event.createdAt);
    if (at === null) continue;

    if (event.type === 'scan.started') {
      state = 'running';
      lastBoundary = at;
      continue;
    }

    if (FINISHING_EVENTS.has(event.type)) {
      state = 'finished';
      continue;
    }

    const check = readCheckName(event.payload);
    if (check === null || (known.size > 0 && !known.has(check))) {
      continue;
    }

    if (event.type === 'check.started') {
      state = 'running';
      if (!startedAt.has(check)) startedAt.set(check, at);
      continue;
    }

    if (event.type === 'check.completed') {
      state = 'running';
      if (completed.has(check)) continue;
      completed.add(check);

      // The check's own start is the honest boundary. When the event is missing
      // (a worker that crashed mid-check and resumed), the previous boundary is
      // the best available approximation and still far better than zero.
      const start = startedAt.get(check) ?? lastBoundary;
      if (start !== null && at > start) {
        durations.push(at - start);
      }
      lastBoundary = at;
    }
  }

  const completedCount = completed.size;
  const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const averageCheckMs =
    durations.length > 0
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : null;

  const remainingChecks = total > 0 ? Math.max(total - completedCount, 0) : 0;
  const remainingMs =
    state === 'finished' || averageCheckMs === null || remainingChecks === 0
      ? null
      : averageCheckMs * remainingChecks;

  return {
    total,
    completed: completedCount,
    percent,
    averageCheckMs,
    remainingMs,
    state,
  };
}

/** "45 s", "2 min 10 s" — short enough for a status line. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
