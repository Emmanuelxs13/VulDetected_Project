/**
 * Machine-readable refusals from the credential actions.
 *
 * Same reasoning as `features/scans/error-codes.ts`: a server action does not
 * know the reader's language, so it returns a code and the component picks the
 * sentence from the active locale. Keys are written out statically so
 * `messages.test.ts` can prove both locales contain every one.
 */

export const CREDENTIAL_ERROR_CODES = [
  'invalid_credential',
  'domain_not_verified',
  'storage_unavailable',
  'credential_not_found',
] as const;

export type CredentialErrorCode = (typeof CREDENTIAL_ERROR_CODES)[number];

const KNOWN_CODES = new Set<string>(CREDENTIAL_ERROR_CODES);

export function isCredentialErrorCode(value: string): value is CredentialErrorCode {
  return KNOWN_CODES.has(value);
}

export const CREDENTIAL_ERROR_KEYS: Record<CredentialErrorCode, string> = {
  invalid_credential: 'errors.codes.invalid_credential',
  domain_not_verified: 'errors.codes.domain_not_verified',
  storage_unavailable: 'errors.codes.storage_unavailable',
  credential_not_found: 'errors.codes.credential_not_found',
};
