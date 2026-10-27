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
  | 'reflectedXss'
  | 'sqlInjection'
  | 'openRedirect'
  | 'corsReflectedWithCredentials'
  | 'corsReflectedOrigin'
  | 'corsWildcard'
  | 'directoryListing'
  | 'exposedSecretFile'
  | 'exposedConfigFile'
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
 * ## WHY CRITICAL IS RARE
 *
 * A severity has to be defensible from what the check actually observed. Four
 * checks cannot prove remote code execution, so nothing they emit earns
 * `critical`. Two active checks can: an error-based SQL injection proves the
 * value reaches a query, and an exposed `.env`/`.git`/database dump exposes
 * credentials directly. Reserving `critical` for evidence of that strength keeps
 * the colour meaningful (ADR 0003 §5); a check that cannot justify it stays
 * below.
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

    case 'xss':
      // Reflected XSS runs attacker script in the victim's session. It cannot
      // prove server compromise, so it stops at high.
      return { severity: 'high', rationale: 'reflectedXss' };

    case 'sqli':
      // A database error caused by a quote proves the value is concatenated
      // into SQL. That is direct access to the data store, not a browser-level
      // issue, so it is the one active check that earns critical.
      return { severity: 'critical', rationale: 'sqlInjection' };

    case 'open_redirect':
      // Phishing enabler on a trusted domain. Real, but it neither reads nor
      // writes data on its own.
      return { severity: 'medium', rationale: 'openRedirect' };

    case 'cors': {
      const reflected = evidence.reflected === true;
      const wildcard = evidence.wildcard === true;
      const credentials = evidence.allowCredentials === true || evidence.allow_credentials === true;

      if (reflected && credentials) {
        return { severity: 'high', rationale: 'corsReflectedWithCredentials' };
      }
      if (reflected) {
        return { severity: 'medium', rationale: 'corsReflectedOrigin' };
      }
      if (wildcard) {
        // Browsers refuse `*` together with credentials, so the combination is
        // a misconfiguration rather than a live cross-origin read.
        return { severity: 'low', rationale: 'corsWildcard' };
      }
      return { severity: 'medium', rationale: 'corsReflectedOrigin' };
    }

    case 'directory_listing':
      return { severity: 'medium', rationale: 'directoryListing' };

    case 'sensitive_files': {
      const kind = String(evidence.kind ?? '').toLowerCase();
      // Secrets and source reach critical; configuration and environment
      // disclosure stays high because it reveals the stack without handing over
      // a usable credential on its own.
      if (kind === 'env' || kind === 'git' || kind === 'backup') {
        return { severity: 'critical', rationale: 'exposedSecretFile' };
      }
      return { severity: 'high', rationale: 'exposedConfigFile' };
    }

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
  xss: ['high'],
  sqli: ['critical'],
  open_redirect: ['medium'],
  cors: ['high', 'medium', 'low'],
  directory_listing: ['medium'],
  sensitive_files: ['critical', 'high'],
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
