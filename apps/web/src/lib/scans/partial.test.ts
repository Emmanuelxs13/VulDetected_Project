import { describe, expect, it } from 'vitest';

import { isPartialScan } from './partial';

const CHECKS = ['security_headers', 'tls', 'cookies', 'xss', 'sqli'] as const;

describe('Sprint 2 · HU-06 · CA-22 — partial results are kept but marked partial', () => {
  it('CA-22: a cancelled run is partial even if every check happened to finish', () => {
    expect(
      isPartialScan({
        status: 'cancelled',
        requestedChecks: CHECKS,
        ranChecks: CHECKS,
      }),
    ).toBe(true);
  });

  it('CA-22: a run the row already marked cancelled is partial when the callback arrives', () => {
    expect(
      isPartialScan({
        status: 'completed',
        requestedChecks: CHECKS,
        ranChecks: CHECKS,
        alreadyCancelled: true,
      }),
    ).toBe(true);
  });

  it('CA-22: a completed run that skipped checks is partial', () => {
    expect(
      isPartialScan({
        status: 'completed',
        requestedChecks: CHECKS,
        ranChecks: ['security_headers', 'tls'],
      }),
    ).toBe(true);
  });

  it('CA-22: a completed run that covered every check is comparable', () => {
    expect(
      isPartialScan({
        status: 'completed',
        requestedChecks: CHECKS,
        ranChecks: CHECKS,
      }),
    ).toBe(false);
  });

  it('CA-22: a failed run is not partial, because it never yields a comparable result set', () => {
    expect(
      isPartialScan({
        status: 'failed',
        requestedChecks: CHECKS,
        ranChecks: ['tls'],
      }),
    ).toBe(false);
  });

  it('CA-22: a row with no recorded check list cannot claim incompleteness', () => {
    expect(
      isPartialScan({
        status: 'completed',
        requestedChecks: [],
        ranChecks: [],
      }),
    ).toBe(false);
  });
});
