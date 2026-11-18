import { describe, expect, it } from 'vitest';

import { PRODUCT_TIME_ZONE, formatProductDateTime } from './datetime';

describe('Sprint 2 · HU-07 · CA-23 — schedules are presented in America/Bogotá', () => {
  it('CA-23: the product time zone is Bogotá', () => {
    expect(PRODUCT_TIME_ZONE).toBe('America/Bogota');
  });

  it('CA-23: a UTC instant renders as Bogotá local time (UTC-5)', () => {
    // 2026-01-03T00:00Z is 19:00 on 2026-01-02 in Bogotá.
    expect(formatProductDateTime('2026-01-03T00:00:00.000Z')).toBe('02/01/2026 19:00');
  });

  it('CA-23: the rendering does not depend on the process time zone', () => {
    // Same instant, always the same string: the zone is pinned, not inherited.
    expect(formatProductDateTime('2026-06-15T12:34:00.000Z')).toBe('15/06/2026 07:34');
  });

  it('CA-23: a missing value renders an em dash instead of Invalid Date', () => {
    expect(formatProductDateTime(null)).toBe('—');
    expect(formatProductDateTime(undefined)).toBe('—');
    expect(formatProductDateTime('not-a-date')).toBe('—');
  });
});
