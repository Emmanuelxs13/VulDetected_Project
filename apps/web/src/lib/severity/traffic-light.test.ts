import { describe, expect, it } from 'vitest';

import {
  TRAFFIC_LIGHT_LABELS,
  computeTrafficLight,
  type TrafficLightFinding,
} from './traffic-light';

function finding(severity: string, status = 'open'): TrafficLightFinding {
  return { severity, status };
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
