/**
 * Which findings are worth an alert (Sprint 2, CA-25).
 *
 * ## Why a threshold and not "any critical"
 *
 * The alert exists to say "something appeared that you did not have before".
 * Sending it for a finding that was already there turns every scheduled scan
 * into a reminder, and a reminder is exactly what a reader learns to filter out.
 * So an alert needs two conditions, and this module owns the second one: the
 * finding is new (computed at ingest) and its severity is at or above the
 * threshold.
 *
 * ## Why the threshold is a constant
 *
 * Sprint 2 fixes the default at Critical and states it in the verification
 * manual. A per-user setting is a product surface (UI, storage, defaults per
 * plan) that the sprint does not include; the ranking below is what makes adding
 * it a data change rather than a rewrite.
 */

export type AlertSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/** Ordered from least to most severe. Index is the rank. */
export const SEVERITY_RANK: readonly AlertSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];

/** Sprint 2 default: only new critical findings alert. */
export const DEFAULT_ALERT_SEVERITY: AlertSeverity = 'critical';

/**
 * Every severity at or above `threshold`, most severe first.
 *
 * Returns the exact values to compare against, so callers use `inArray` with a
 * list instead of a hand-written rank expression that can drift from the enum.
 */
export function severitiesAtOrAbove(threshold: AlertSeverity): AlertSeverity[] {
  const index = SEVERITY_RANK.indexOf(threshold);
  if (index === -1) {
    return [DEFAULT_ALERT_SEVERITY];
  }
  return SEVERITY_RANK.slice(index).reverse();
}
