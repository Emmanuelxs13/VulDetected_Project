/** The three states of the dashboard traffic light. */
export type TrafficLightLevel = 'high' | 'medium' | 'safe';

/**
 * Product copy, not a developer label: the roadmap fixes these three strings and
 * the dashboard banner, the PDF cover and the landing page all show them. They
 * live here, next to the rule that selects them, so no screen can invent a
 * fourth wording for the same state.
 */
export const TRAFFIC_LIGHT_LABELS = {
  high: 'Riesgo Alto',
  medium: 'Riesgo Medio',
  safe: 'Seguro / Riesgo Bajo',
} as const satisfies Record<TrafficLightLevel, string>;

export interface TrafficLightFinding {
  severity: string;
  status: string;
}

export interface TrafficLightCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  unclassified: number;
}

export interface TrafficLightResult {
  level: TrafficLightLevel;
  label: (typeof TRAFFIC_LIGHT_LABELS)[TrafficLightLevel];
  counts: TrafficLightCounts;
  /** How many findings were actually considered (status `open` only). */
  openFindings: number;
}

/**
 * Computes the risk light from a scan's findings (SEV-2).
 *
 * ## WHAT COUNTS
 *
 * Only `status = 'open'`. A resolved or false-positive finding is a finding the
 * user already handled; letting it colour the banner would train people to
 * ignore the banner. The rule is applied here and not in the caller so every
 * consumer (dashboard, PDF, e-mail) agrees by construction.
 *
 * ## WHY UNCLASSIFIED IS NOT "SAFE"
 *
 * `unclassified` means "we have no rule for this check", which is unknown risk,
 * not absence of risk. Treating it as safe would let a newly added check with no
 * classifier turn a red site green — the most dangerous failure mode this
 * module can have. It is counted as medium (yellow) until a rule exists.
 *
 * ## WHY IT IS PURE
 *
 * No database, no clock, no locale. The only inputs are the findings, so the
 * same data produces the same colour in a test, in the dashboard and in a PDF
 * generated six months later.
 */
export function computeTrafficLight(
  findings: readonly TrafficLightFinding[],
): TrafficLightResult {
  const counts: TrafficLightCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    unclassified: 0,
  };

  let openFindings = 0;
  for (const finding of findings) {
    if (finding.status !== 'open') continue;
    openFindings += 1;
    switch (finding.severity) {
      case 'critical':
        counts.critical += 1;
        break;
      case 'high':
        counts.high += 1;
        break;
      case 'medium':
        counts.medium += 1;
        break;
      case 'low':
        counts.low += 1;
        break;
      case 'info':
        counts.info += 1;
        break;
      default:
        // `unclassified` and any future value the database might hold.
        counts.unclassified += 1;
        break;
    }
  }

  const level: TrafficLightLevel =
    counts.critical > 0 || counts.high > 0
      ? 'high'
      : counts.medium > 0 || counts.unclassified > 0
        ? 'medium'
        : 'safe';

  return { level, label: TRAFFIC_LIGHT_LABELS[level], counts, openFindings };
}
