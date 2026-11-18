import type { Severity } from '@vuldetected/db';

/**
 * Comparative history, as a pure decision over rows.
 *
 * ## Why this is a separate module
 *
 * "Is this scan comparable with the one before it" is the whole intellectual
 * content of HU-10, and it must be answerable without a database, a browser or a
 * clock. Keeping it pure means every rule in ADR 0022 has a test that names the
 * criterion instead of a page test that would need a fixture per rule.
 *
 * ## What is NOT here
 *
 * There is no score. The history shows snapshots: how many findings of each
 * severity were open at that moment. A single number would hide which severity
 * moved, and the sprint explicitly refuses to invent one.
 */

export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  unclassified: number;
}

export interface ScanSnapshotInput {
  scanId: string;
  createdAt: Date;
  status: ScanStatus;
  partial: boolean;
  isDemo: boolean;
  scanMode: 'passive' | 'active';
  severityCatalogVersion: string;
  /** Open findings per severity at that scan. */
  counts: SeverityCounts;
}

export type ExcludedReason = 'not_completed' | 'partial';

export type ComparabilityReason =
  | 'first'
  | 'mode_changed'
  | 'catalog_changed'
  | 'demo_mixed';

export interface HistoryRow {
  snapshot: ScanSnapshotInput;
  total: number;
  /** Critical + high, open. The number the trend line follows. */
  risky: number;
  /** `null` when the row is excluded or has nothing to compare against. */
  delta: number | null;
  /** Present when the row cannot enter the comparable series at all. */
  excluded: ExcludedReason | null;
  /** Why `delta` is `null` for an included row. */
  reason: ComparabilityReason | null;
}

export function emptySeverityCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0, unclassified: 0 };
}

export function countFindings(counts: SeverityCounts): { total: number; risky: number } {
  const total =
    counts.critical + counts.high + counts.medium + counts.low + counts.info + counts.unclassified;

  return { total, risky: counts.critical + counts.high };
}

/**
 * Why a run cannot join the series, or `null` when it can.
 *
 * A run that never completed has no full picture; a partial run has one it did
 * not finish. Both keep their findings and stay visible in the list, but neither
 * may set the baseline another run is compared against.
 */
export function exclusionFor(snapshot: ScanSnapshotInput): ExcludedReason | null {
  if (snapshot.status !== 'completed') {
    return 'not_completed';
  }

  if (snapshot.partial) {
    return 'partial';
  }

  return null;
}

/**
 * Builds the series from the caller's newest-first list and returns it in the
 * same order.
 *
 * The baseline is the previous *included* snapshot, not the previous row: an
 * excluded run in between does not erase the comparison. When the baseline and
 * the current run were produced under different conditions, the delta is
 * withheld and the reason is stated — a difference caused by our own check set
 * or severity rules must never be presented as a change in the website.
 *
 * The walk goes oldest to newest, because a delta needs the past; the result is
 * reversed back to newest first, which is the order a reader expects.
 */
export function buildHistoryRows(snapshots: readonly ScanSnapshotInput[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let baseline: ScanSnapshotInput | null = null;
  let baselineRisky = 0;

  for (const snapshot of [...snapshots].reverse()) {
    const { total, risky } = countFindings(snapshot.counts);
    const excluded = exclusionFor(snapshot);

    if (excluded !== null) {
      rows.push({ snapshot, total, risky, delta: null, excluded, reason: null });
      continue;
    }

    let reason: ComparabilityReason | null = null;
    let delta: number | null = null;

    if (baseline === null) {
      reason = 'first';
    } else if (baseline.scanMode !== snapshot.scanMode) {
      reason = 'mode_changed';
    } else if (baseline.severityCatalogVersion !== snapshot.severityCatalogVersion) {
      reason = 'catalog_changed';
    } else if (baseline.isDemo !== snapshot.isDemo) {
      reason = 'demo_mixed';
    } else {
      delta = risky - baselineRisky;
    }

    rows.push({ snapshot, total, risky, delta, excluded: null, reason });

    baseline = snapshot;
    baselineRisky = risky;
  }

  return rows.reverse();
}

/** True when at least two rows form a comparable pair, so the page can say so. */
export function hasComparablePair(rows: readonly HistoryRow[]): boolean {
  return rows.some((row) => row.delta !== null);
}

export const HISTORY_SEVERITIES: readonly Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
  'unclassified',
];
