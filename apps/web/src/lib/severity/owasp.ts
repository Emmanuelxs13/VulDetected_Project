/**
 * OWASP Top 10 (2021) mapping for the checks the scanner can run.
 *
 * ## WHY A MAP AND NOT A FIELD IN EACH CHECK
 *
 * The category has to be identical in the database row, the finding detail page
 * and the PDF. If each check carried its own string, a typo in one check would
 * surface as a category nobody else recognises. One table means one vocabulary.
 *
 * ## WHY A CHECK CAN BE UNMAPPED
 *
 * A check whose category is not obvious must return `null` instead of a guess.
 * Mis-filing a finding under the wrong OWASP item sends the reader to the wrong
 * remediation work, which is worse than "not mapped yet". The column is
 * nullable for exactly this reason.
 */

export interface OwaspCategory {
  /** Short code stored in `findings.owasp_category` (`A03`). */
  code: string;
  /** Full 2021 title, for display. */
  title: string;
}

export const OWASP_TOP10_2021: Record<string, OwaspCategory> = {
  A01: { code: 'A01', title: 'Broken Access Control' },
  A02: { code: 'A02', title: 'Cryptographic Failures' },
  A03: { code: 'A03', title: 'Injection' },
  A04: { code: 'A04', title: 'Insecure Design' },
  A05: { code: 'A05', title: 'Security Misconfiguration' },
  A06: { code: 'A06', title: 'Vulnerable and Outdated Components' },
  A07: { code: 'A07', title: 'Identification and Authentication Failures' },
  A08: { code: 'A08', title: 'Software and Data Integrity Failures' },
  A09: { code: 'A09', title: 'Security Logging and Monitoring Failures' },
  A10: { code: 'A10', title: 'Server-Side Request Forgery (SSRF)' },
};

const CHECK_CATEGORY: Record<string, keyof typeof OWASP_TOP10_2021> = {
  // Transport encryption.
  tls: 'A02',
  redirects: 'A02',
  // Session cookie flags.
  cookies: 'A07',
  // Missing security headers are configuration, not a vulnerability class of
  // their own.
  security_headers: 'A05',
  // Sprint 4 active checks.
  xss: 'A03',
  sqli: 'A03',
  open_redirect: 'A01',
  sensitive_files: 'A01',
  directory_listing: 'A05',
  cors: 'A05',
};

/** Returns the category for a check, or `null` when the mapping would be a guess. */
export function owaspCategoryFor(checkName: string): OwaspCategory | null {
  const code = CHECK_CATEGORY[checkName];
  return code ? (OWASP_TOP10_2021[code] ?? null) : null;
}

/** Convenience for storage: the code alone, or `null`. */
export function owaspCategoryCodeFor(checkName: string): string | null {
  return owaspCategoryFor(checkName)?.code ?? null;
}
