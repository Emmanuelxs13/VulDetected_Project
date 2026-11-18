import { describe, expect, it } from 'vitest';

import {
  buildHistoryRows,
  countFindings,
  emptySeverityCounts,
  exclusionFor,
  hasComparablePair,
  type ScanSnapshotInput,
  type SeverityCounts,
} from './comparability';

/**
 * Sprint 2 · HU-10 (SCRUM-27) — the comparative history.
 *
 * ## What the criteria demand
 *
 * CA-10 and CA-29 describe the dashboard: the history of a domain, comparing
 * one scan with the previous one. ADR 0021 requires demo data to be visible as
 * demo. The comparability rules require that a comparison only happens between
 * runs that can actually be compared.
 *
 * ## Why the tests feed the pure function
 *
 * Every rule here is a decision about data, not about pixels. Testing it through
 * a rendered page would need one fixture per rule and would still fail to prove
 * the rule; testing the function proves it and names the criterion.
 */

function counts(overrides: Partial<SeverityCounts> = {}): SeverityCounts {
  return { ...emptySeverityCounts(), ...overrides };
}

function snapshot(overrides: Partial<ScanSnapshotInput> = {}): ScanSnapshotInput {
  return {
    scanId: `scan-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date('2026-11-01T12:00:00Z'),
    status: 'completed',
    partial: false,
    isDemo: false,
    scanMode: 'active',
    severityCatalogVersion: '1.0',
    counts: counts({ high: 2 }),
    ...overrides,
  };
}

describe('Sprint 2 · HU-10', () => {
  it('CA-10: each scan is a snapshot with per-severity counts and no composite score', () => {
    const rows = buildHistoryRows([
      snapshot({ counts: counts({ critical: 1, high: 2, medium: 3, low: 4, info: 5 }) }),
    ]);

    const [row] = rows;
    expect(row!.total).toBe(15);
    expect(row!.risky).toBe(3);
    // The shape has no score field at all: the rule is enforced by the type, and
    // this assertion keeps someone from adding one quietly.
    expect(Object.keys(row!).sort()).toEqual(
      ['delta', 'excluded', 'reason', 'risky', 'snapshot', 'total'].sort(),
    );
  });

  it('CA-10: the delta compares with the previous complete scan', () => {
    const rows = buildHistoryRows([
      snapshot({ scanId: 'newest', counts: counts({ critical: 1 }) }),
      snapshot({ scanId: 'older', counts: counts({ critical: 4 }) }),
    ]);

    // Newest first: 1 critical now against 4 before is an improvement of 3.
    expect(rows[0]!.delta).toBe(-3);
    expect(rows[1]!.delta).toBeNull();
    expect(rows[1]!.reason).toBe('first');
    expect(hasComparablePair(rows)).toBe(true);
  });

  it('CA-10: an excluded run in between does not erase the baseline', () => {
    const rows = buildHistoryRows([
      snapshot({ scanId: 'newest', counts: counts({ high: 1 }) }),
      snapshot({ scanId: 'cancelled', status: 'cancelled', partial: true, counts: counts() }),
      snapshot({ scanId: 'older', counts: counts({ high: 5 }) }),
    ]);

    expect(rows[1]!.excluded).toBe('not_completed');
    // The newest still compares against `older`, skipping the cancelled run.
    expect(rows[0]!.delta).toBe(-4);
  });

  it('CA-10: a partial run is kept but cannot be compared', () => {
    const rows = buildHistoryRows([
      snapshot({ scanId: 'partial', partial: true, counts: counts({ critical: 2 }) }),
      snapshot({ scanId: 'complete', counts: counts({ critical: 2 }) }),
    ]);

    expect(rows[0]!.excluded).toBe('partial');
    expect(rows[0]!.delta).toBeNull();
    // Its numbers are still reported: the reader sees what was found.
    expect(rows[0]!.total).toBe(2);
  });

  it('CA-10: a different scan mode withholds the delta and says why', () => {
    const rows = buildHistoryRows([
      snapshot({ scanId: 'active', scanMode: 'active', counts: counts({ high: 1 }) }),
      snapshot({ scanId: 'passive', scanMode: 'passive', counts: counts({ high: 9 }) }),
    ]);

    expect(rows[0]!.delta).toBeNull();
    expect(rows[0]!.reason).toBe('mode_changed');
  });

  it('CA-10: a different severity catalogue withholds the delta and says why', () => {
    const rows = buildHistoryRows([
      snapshot({ scanId: 'v2', severityCatalogVersion: '2.0', counts: counts({ high: 1 }) }),
      snapshot({ scanId: 'v1', severityCatalogVersion: '1.0', counts: counts({ high: 9 }) }),
    ]);

    expect(rows[0]!.delta).toBeNull();
    expect(rows[0]!.reason).toBe('catalog_changed');
  });

  it('ADR 0021: demo rows are labelled and never compared against real rows', () => {
    const rows = buildHistoryRows([
      snapshot({ scanId: 'real', isDemo: false, counts: counts({ high: 1 }) }),
      snapshot({ scanId: 'demo', isDemo: true, counts: counts({ high: 9 }) }),
    ]);

    expect(rows[0]!.delta).toBeNull();
    expect(rows[0]!.reason).toBe('demo_mixed');
    // Within demo data the comparison still works, so the demo can be shown.
    const demoOnly = buildHistoryRows([
      snapshot({ scanId: 'demo-new', isDemo: true, counts: counts({ high: 1 }) }),
      snapshot({ scanId: 'demo-old', isDemo: true, counts: counts({ high: 4 }) }),
    ]);
    expect(demoOnly[0]!.delta).toBe(-3);
  });

  it('CA-10: every non-completed status is excluded, not silently dropped', () => {
    for (const status of ['queued', 'running', 'failed', 'cancelled'] as const) {
      expect(exclusionFor(snapshot({ status }))).toBe('not_completed');
    }
    expect(exclusionFor(snapshot())).toBeNull();
  });

  it('CA-10: the totals count every severity and the risky figure only critical and high', () => {
    expect(countFindings(counts({ critical: 2, high: 3, medium: 1, low: 4, info: 5 }))).toEqual({
      total: 15,
      risky: 5,
    });
  });
});
