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
      return { severity: 'low', rationale: 'cookieMissingSameSite' };
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
