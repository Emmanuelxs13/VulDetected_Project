/**
 * The failure reasons a form login can report (HU-04, ADR 0020).
 *
 * The worker writes `error = 'login_failed: <reason>'` and this list is what
 * turns the reason into a translated sentence. It mirrors
 * `services/scanner/scanner/auth.py` on purpose: the two services deploy
 * separately, so neither can import the other's vocabulary, and an unknown
 * reason must degrade to the generic message instead of leaking a raw code into
 * the page.
 */
export const LOGIN_FAILURE_REASONS = [
  'invalid_credentials',
  'marker_missing',
  'cross_origin_login',
  'cross_origin_redirect',
  'transport_error',
] as const;

export type LoginFailureReason = (typeof LOGIN_FAILURE_REASONS)[number];

/** Prefix the worker uses in `scans.error`. */
export const LOGIN_FAILED_PREFIX = 'login_failed:';

/** Extracts the reason from a stored `scans.error`, or `null` when it is not a login failure. */
export function loginFailureReason(error: string | null): LoginFailureReason | null {
  if (!error || !error.startsWith(LOGIN_FAILED_PREFIX)) {
    return null;
  }

  const reason = error.slice(LOGIN_FAILED_PREFIX.length).trim();

  return (LOGIN_FAILURE_REASONS as readonly string[]).includes(reason)
    ? (reason as LoginFailureReason)
    : null;
}
