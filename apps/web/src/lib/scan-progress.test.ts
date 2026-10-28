import { describe, expect, it } from 'vitest';

import {
  estimateScanProgress,
  formatDuration,
  type ScanProgressEvent,
} from './scan-progress';

const CHECKS = ['security_headers', 'tls', 'cookies', 'redirects'];

function event(type: string, second: number, payload: Record<string, unknown> = {}) {
  return {
    type,
    payload,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, second)).toISOString(),
  } satisfies ScanProgressEvent;
}

describe('estimateScanProgress', () => {
  it('reports pending when nothing has happened yet', () => {
    const result = estimateScanProgress([], CHECKS);
    expect(result.state).toBe('pending');
    expect(result.completed).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.remainingMs).toBeNull();
  });

  it('cannot invent a remaining time before the first check finishes', () => {
    const result = estimateScanProgress(
      [event('scan.started', 0), event('check.started', 1, { check: 'tls' })],
      CHECKS,
    );
    expect(result.state).toBe('running');
    expect(result.completed).toBe(0);
    expect(result.averageCheckMs).toBeNull();
    expect(result.remainingMs).toBeNull();
  });

  it('projects the remaining checks from the measured average', () => {
    const result = estimateScanProgress(
      [
        event('scan.started', 0),
        event('check.started', 0, { check: 'security_headers' }),
        event('check.completed', 2, { check: 'security_headers' }),
        event('check.started', 2, { check: 'tls' }),
        event('check.completed', 6, { check: 'tls' }),
      ],
      CHECKS,
    );

    expect(result.state).toBe('running');
    expect(result.completed).toBe(2);
    expect(result.percent).toBe(50);
    // 2000 ms and 4000 ms → average 3000 ms; two checks left → 6000 ms.
    expect(result.averageCheckMs).toBe(3000);
    expect(result.remainingMs).toBe(6000);
  });

  it('counts a check once even when the callback retries its event', () => {
    const result = estimateScanProgress(
      [
        event('check.started', 0, { check: 'tls' }),
        event('check.completed', 1, { check: 'tls' }),
        event('check.completed', 1, { check: 'tls' }),
      ],
      CHECKS,
    );
    expect(result.completed).toBe(1);
    expect(result.percent).toBe(25);
  });

  it('ignores a check that is not part of this scan', () => {
    const result = estimateScanProgress(
      [event('check.completed', 1, { check: 'nuclei_internal' })],
      CHECKS,
    );
    expect(result.completed).toBe(0);
  });

  it('has no remaining time once the scan finished', () => {
    const result = estimateScanProgress(
      [
        event('check.started', 0, { check: 'tls' }),
        event('check.completed', 2, { check: 'tls' }),
        event('scan.completed', 3),
      ],
      CHECKS,
    );
    expect(result.state).toBe('finished');
    expect(result.remainingMs).toBeNull();
  });

  it('falls back to the previous boundary when a start event is missing', () => {
    const result = estimateScanProgress(
      [
        event('scan.started', 0),
        event('check.completed', 4, { check: 'tls' }),
        event('check.completed', 8, { check: 'cookies' }),
      ],
      CHECKS,
    );
    // 4 s from scan start, then 4 s from the previous completion.
    expect(result.averageCheckMs).toBe(4000);
    expect(result.completed).toBe(2);
  });

  it('reports 0 percent when the expected check list is unknown', () => {
    const result = estimateScanProgress(
      [event('check.started', 0, { check: 'tls' }), event('check.completed', 1, { check: 'tls' })],
      [],
    );
    expect(result.total).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.completed).toBe(1);
    expect(result.remainingMs).toBeNull();
  });
});

describe('formatDuration', () => {
  it('renders seconds below a minute and minutes above it', () => {
    expect(formatDuration(500)).toBe('1 s');
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(60_000)).toBe('1 min');
    expect(formatDuration(130_000)).toBe('2 min 10 s');
  });
});
