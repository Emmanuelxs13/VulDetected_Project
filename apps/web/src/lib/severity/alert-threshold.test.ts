import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ALERT_SEVERITY,
  SEVERITY_RANK,
  severitiesAtOrAbove,
} from './alert-threshold';

describe('Sprint 2 · HU-07 · CA-25 — the alert threshold', () => {
  it('CA-25: the Sprint 2 default is Critical', () => {
    expect(DEFAULT_ALERT_SEVERITY).toBe('critical');
  });

  it('CA-25: at the default threshold only critical findings alert', () => {
    expect(severitiesAtOrAbove(DEFAULT_ALERT_SEVERITY)).toEqual(['critical']);
  });

  it('CA-25: lowering the threshold includes the more severe levels too', () => {
    expect(severitiesAtOrAbove('high')).toEqual(['critical', 'high']);
    expect(severitiesAtOrAbove('medium')).toEqual(['critical', 'high', 'medium']);
  });

  it('CA-25: every severity maps to a rank, so no level is silently excluded', () => {
    for (const severity of SEVERITY_RANK) {
      expect(severitiesAtOrAbove(severity).length).toBeGreaterThan(0);
    }
  });

  it('CA-25: an unknown threshold falls back to the default instead of alerting on everything', () => {
    // Failing closed here means a bad config produces too few alerts, never a
    // flood the reader learns to ignore.
    expect(severitiesAtOrAbove('nonsense' as never)).toEqual(['critical']);
  });
});
