export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unclassified';

export type SeverityRationale =
  | 'noHttps'
  | 'httpsDowngrade'
  | 'missingHsts'
  | 'missingCsp'
  | 'missingFrameOptions'
  | 'missingContentTypeOptions'
  | 'missingReferrerPolicy'
  | 'missingPermissionsPolicy'
  | 'cookieMissingSecure'
  | 'cookieMissingHttpOnly'
  | 'cookieMissingSameSite'
  | 'cookieOther'
  | 'unknownCheck';

export interface Classification {
  severity: Severity;
  /** i18n key (under `scan.findings.rationale.*`) that explains the mapping. */
  rationale: SeverityRationale;
}

/**
 * Deterministic severity mapping (Sprint 3, SEV-1).
 *
 * ## WHY THIS IS A TABLE AND NOT A SCORE
 *
 * The roadmap explicitly rejects a CVSS-style numeric score: every finding must
 * resolve to exactly one severity through a rule a reader can audit. The table
 * below is that rule. It is pure — the same finding always gets the same
 * severity — and it is ordered so the more specific match wins.
 *
 * ## WHY CRITICAL IS EMPTY TODAY
 *
 * These four checks cannot prove remote code execution, so nothing they emit
 * earns `critical`. Reserving `critical` for a class of finding that genuinely
 * deserves it keeps the colour meaningful (ADR 0003 §5); a check that cannot
 * justify it stays below.
 */
export function classifyFinding(
  checkName: string,
  evidence: Record<string, unknown>,
  title = '',
): Classification {
  switch (checkName) {
    case 'tls':
      return { severity: 'high', rationale: 'noHttps' };

    case 'redirects':
      return { severity: 'high', rationale: 'httpsDowngrade' };

    case 'cookies': {
      const lower = title.toLowerCase();
      if (lower.includes('secure')) return { severity: 'medium', rationale: 'cookieMissingSecure' };
      if (lower.includes('httponly'))
        return { severity: 'medium', rationale: 'cookieMissingHttpOnly' };
      if (lower.includes('samesite'))
        return { severity: 'low', rationale: 'cookieMissingSameSite' };
      // A cookie finding whose title names no known flag is still a cookie
      // finding. Medium is the honest default; claiming SameSite would be a lie
      // the reader could not verify.
      return { severity: 'medium', rationale: 'cookieOther' };
    }

    case 'security_headers': {
      const header = String(evidence.header ?? '').toLowerCase();
      switch (header) {
        case 'strict-transport-security':
          return { severity: 'high', rationale: 'missingHsts' };
        case 'content-security-policy':
          return { severity: 'high', rationale: 'missingCsp' };
        case 'x-frame-options':
          return { severity: 'medium', rationale: 'missingFrameOptions' };
        case 'x-content-type-options':
          return { severity: 'low', rationale: 'missingContentTypeOptions' };
        case 'referrer-policy':
          return { severity: 'low', rationale: 'missingReferrerPolicy' };
        case 'permissions-policy':
          return { severity: 'info', rationale: 'missingPermissionsPolicy' };
        default:
          return { severity: 'medium', rationale: 'missingContentTypeOptions' };
      }
    }

    default:
      return { severity: 'unclassified', rationale: 'unknownCheck' };
  }
}

/** Display order, most severe first. */
export const SEVERITY_ORDER = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
  'unclassified',
] as const satisfies readonly Severity[];

/**
 * Every severity each rule can produce.
 *
 * This is the single source of truth that ties classification to remediation:
 * `completeness.test.ts` asserts the registry declares the same set for each
 * rule, so a rule that starts emitting `high` without High-level guidance fails
 * the build (roadmap exit criterion 2).
 */
export const RULE_SEVERITIES = {
  tls: ['high'],
  redirects: ['high'],
  security_headers: ['high', 'medium', 'low', 'info'],
  cookies: ['medium', 'low'],
} as const satisfies Record<string, readonly Severity[]>;

export type RemediatedRule = keyof typeof RULE_SEVERITIES;

/** Rules that can produce a severity the roadmap requires remediation for. */
export const CRITICAL_HIGH_RULES = (Object.keys(RULE_SEVERITIES) as RemediatedRule[]).filter(
  (rule) =>
    RULE_SEVERITIES[rule].some(
      (severity) => severity === ('high' as Severity) || severity === ('critical' as Severity),
    ),
);

/** Maps a stored severity onto the design system's badge variant. */
export function getSeverityVariant(
  severity: string,
): 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown' {
  if (
    severity === 'critical' ||
    severity === 'high' ||
    severity === 'medium' ||
    severity === 'low' ||
    severity === 'info'
  ) {
    return severity;
  }
  return 'unknown';
}
