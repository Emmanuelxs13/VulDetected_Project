import { describe, expect, it } from 'vitest';

import {
  TRAFFIC_LIGHT_LABELS,
  computeTrafficLight,
  levelFromCounts,
  type TrafficLightCounts,
  type TrafficLightFinding,
} from './traffic-light';

function finding(severity: string, status = 'open'): TrafficLightFinding {
  return { severity, status };
}

function counts(overrides: Partial<TrafficLightCounts> = {}): TrafficLightCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0, unclassified: 0, ...overrides };
}

describe('computeTrafficLight', () => {
  it('labels an empty scan as safe', () => {
    const result = computeTrafficLight([]);
    expect(result.level).toBe('safe');
    expect(result.label).toBe('Seguro / Riesgo Bajo');
    expect(result.openFindings).toBe(0);
  });

  it('uses the exact product labels for all three states', () => {
    expect(TRAFFIC_LIGHT_LABELS.high).toBe('Riesgo Alto');
    expect(TRAFFIC_LIGHT_LABELS.medium).toBe('Riesgo Medio');
    expect(TRAFFIC_LIGHT_LABELS.safe).toBe('Seguro / Riesgo Bajo');
  });

  it('turns red with a single open high finding even when low findings dominate', () => {
    const result = computeTrafficLight([
      finding('high'),
      finding('low'),
      finding('low'),
      finding('info'),
    ]);
    expect(result.level).toBe('high');
    expect(result.label).toBe('Riesgo Alto');
    expect(result.counts).toMatchObject({ high: 1, low: 2, info: 1 });
  });

  it('turns red on a critical finding', () => {
    expect(computeTrafficLight([finding('critical')]).level).toBe('high');
  });

  it('turns yellow with a medium finding', () => {
    expect(computeTrafficLight([finding('medium')]).label).toBe('Riesgo Medio');
  });

  it('treats low and info findings as safe risk', () => {
    const result = computeTrafficLight([finding('low'), finding('info')]);
    expect(result.level).toBe('safe');
    expect(result.counts).toMatchObject({ low: 1, info: 1 });
  });

  it('never reports safe for an unclassified finding', () => {
    const result = computeTrafficLight([finding('unclassified')]);
    expect(result.level).toBe('medium');
    expect(result.counts.unclassified).toBe(1);
  });

  it('ignores resolved and false-positive findings', () => {
    const result = computeTrafficLight([
      finding('critical', 'resolved'),
      finding('high', 'false_positive'),
      finding('low', 'open'),
    ]);
    expect(result.level).toBe('safe');
    expect(result.openFindings).toBe(1);
    expect(result.counts).toMatchObject({ critical: 0, high: 0, low: 1 });
  });

  it('is deterministic for the same input', () => {
    const input = [finding('medium'), finding('low')];
    expect(computeTrafficLight(input)).toEqual(computeTrafficLight([...input]));
  });
});

/**
 * The dashboard reads counts straight out of SQL, so the counts entry point is
 * the one it uses. These cases pin the same table `computeTrafficLight` relies
 * on — if the two ever disagree, one of them is lying on screen.
 */
describe('levelFromCounts', () => {
  it('is safe when nothing is open', () => {
    expect(levelFromCounts(counts())).toBe('safe');
  });

  it('is red on any critical or high finding', () => {
    expect(levelFromCounts(counts({ critical: 1 }))).toBe('high');
    expect(levelFromCounts(counts({ high: 3 }))).toBe('high');
    // A high finding outranks a pile of medium ones.
    expect(levelFromCounts(counts({ high: 1, medium: 40 }))).toBe('high');
  });

  it('is yellow on medium findings', () => {
    expect(levelFromCounts(counts({ medium: 1 }))).toBe('medium');
  });

  it('treats unclassified as yellow, never safe', () => {
    // An unmapped check is our gap, not a clean bill of health.
    expect(levelFromCounts(counts({ unclassified: 2 }))).toBe('medium');
  });

  it('stays safe on low and info findings', () => {
    expect(levelFromCounts(counts({ low: 9, info: 4 }))).toBe('safe');
  });

  it('agrees with computeTrafficLight for the same findings', () => {
    const samples: TrafficLightFinding[][] = [
      [],
      [finding('critical')],
      [finding('high'), finding('low')],
      [finding('medium'), finding('unclassified')],
      [finding('low'), finding('info')],
      [finding('critical', 'resolved'), finding('info')],
    ];

    for (const sample of samples) {
      const result = computeTrafficLight(sample);
      expect(levelFromCounts(result.counts)).toBe(result.level);
    }
  });
});
