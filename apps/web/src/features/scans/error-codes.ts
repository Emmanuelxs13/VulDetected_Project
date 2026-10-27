/**
 * Machine-readable error codes the scan actions return.
 *
 * ## WHY CODES AND NOT SENTENCES
 *
 * A server action returns data, not markup: it does not know the reader's
 * language, and the string it would produce is the one piece of copy that can
 * never be translated later. So refusals travel as codes and the component that
 * renders them picks the sentence from the active locale.
 *
 * Older actions still return plain English strings. `isScanErrorCode` is the
 * bridge: a known code is translated, anything else is shown as-is, so the two
 * conventions coexist until the remaining actions are migrated.
 */
export const SCAN_ERROR_CODES = [
  'rate_limited',
  'domain_limit',
  'monthly_scan_limit',
  'concurrent_scan_limit',
  'schedule_limit',
  'scan_not_cancellable',
  'scan_not_retryable',
  'credential_unavailable',
] as const;

export type ScanErrorCode = (typeof SCAN_ERROR_CODES)[number];

const KNOWN_CODES = new Set<string>(SCAN_ERROR_CODES);

export function isScanErrorCode(value: string): value is ScanErrorCode {
  return KNOWN_CODES.has(value);
}

/**
 * Static key per code. Written out instead of built with a template literal so
 * `messages.test.ts` can verify that both locales actually contain every key.
 */
export const SCAN_ERROR_KEYS: Record<ScanErrorCode, string> = {
  rate_limited: 'errors.codes.rate_limited',
  domain_limit: 'errors.codes.domain_limit',
  monthly_scan_limit: 'errors.codes.monthly_scan_limit',
  concurrent_scan_limit: 'errors.codes.concurrent_scan_limit',
  schedule_limit: 'errors.codes.schedule_limit',
  scan_not_cancellable: 'errors.codes.scan_not_cancellable',
  scan_not_retryable: 'errors.codes.scan_not_retryable',
  credential_unavailable: 'errors.codes.credential_unavailable',
};
