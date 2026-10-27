import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * AES-256-GCM for scan credentials.
 *
 * ## Why GCM and not CBC
 *
 * A credential is a secret that must not be modifiable by whoever can write to
 * the database. CBC gives confidentiality and nothing else: an attacker with a
 * `UPDATE` right can flip bytes and change the decrypted password in ways nobody
 * notices, and a backup restored from an untrusted source carries the same
 * problem. GCM authenticates the payload, so tampering fails the decrypt instead
 * of silently producing a wrong secret.
 *
 * ## The format, and why the bytes are ordered this way
 *
 * `base64( iv (12 bytes) | authTag (16 bytes) | ciphertext )`
 *
 * Concatenating into one column means a row is one opaque value that cannot be
 * reassembled the wrong way: no second column to keep in sync, no "the IV got
 * truncated" state. The IV is fresh for every seal — reusing an IV under the same
 * key in GCM is catastrophic, not merely weak — and 12 bytes is the size GCM is
 * specified for, so the tag is computed over the payload the same way in every
 * implementation.
 *
 * ## AAD
 *
 * Every seal is bound to its domain id as associated data. Moving a ciphertext
 * from one row to another therefore fails authentication instead of decrypting
 * into the wrong tenant: the attacker who can run an `UPDATE` cannot transplant
 * a credential from a domain they control into a victim's scan.
 *
 * ## What this module does NOT do
 *
 * It never reads the environment. Keys arrive as an argument, so the keyring
 * policy (versioning, rotation, parsing) lives in `keyring.ts` and every
 * primitive here is testable without a process env.
 */

const ALGORITHM = 'aes-256-gcm';

/** GCM's specified IV size; anything else changes the security argument. */
export const IV_BYTES = 12;

/** Full-length tag. Truncating it would weaken authentication for no benefit. */
export const TAG_BYTES = 16;

/** A sealed value is always at least an IV, a tag and one byte of plaintext. */
const MIN_SEALED_BYTES = IV_BYTES + TAG_BYTES + 1;

export type SealedReason = 'malformed' | 'tampered' | 'empty_plaintext';

export class CredentialCryptoError extends Error {
  constructor(
    message: string,
    readonly reason: SealedReason,
  ) {
    super(message);
    this.name = 'CredentialCryptoError';
  }
}

/**
 * Binds a sealed payload to the domain row it belongs to.
 *
 * The prefix carries a version so the binding can change later without making
 * the change ambiguous: a blob sealed under the old prefix fails cleanly instead
 * of being reinterpreted.
 */
export function credentialAad(domainId: string): string {
  return `vuldetected.scan_credential.v1:${domainId}`;
}

/**
 * Seals `plaintext` under `key`.
 *
 * Refuses an empty payload: the only legitimate plaintext here is a JSON object
 * of credential fields, and sealing `""` would store a row that looks valid and
 * authenticates nothing.
 */
export function sealWithKey(key: Buffer, plaintext: string, aad: string): string {
  if (plaintext.length === 0) {
    throw new CredentialCryptoError('Refusing to seal an empty credential.', 'empty_plaintext');
  }

  assertKeyLength(key);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * Opens a sealed payload.
 *
 * Every failure — a truncated value, a wrong key, a flipped bit, an AAD that
 * names a different domain — surfaces as `CredentialCryptoError`. Nothing is
 * distinguished to the caller beyond "this did not open", because the caller's
 * only correct response is the same in all four cases: treat the credential as
 * unusable and say so.
 */
export function openWithKey(key: Buffer, sealed: string, aad: string): string {
  assertKeyLength(key);

  const raw = Buffer.from(sealed, 'base64');

  if (raw.length < MIN_SEALED_BYTES) {
    throw new CredentialCryptoError('Sealed credential is too short to be valid.', 'malformed');
  }

  const iv = raw.subarray(0, IV_BYTES);
  const authTag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // GCM reports a single `unable to authenticate data` for a wrong key, a
    // modified byte and a mismatched AAD. Re-throwing that message verbatim would
    // suggest a distinction that does not exist, so it is replaced.
    throw new CredentialCryptoError(
      'Sealed credential did not authenticate; the key or the payload changed.',
      'tampered',
    );
  }
}

/**
 * Constant-time comparison for two keys.
 *
 * Exported because a keyring with two entries needs to answer "is this the same
 * key as that one" during rotation checks, and `Buffer.equals` on secrets is the
 * kind of shortcut that later gets compared against attacker-influenced input.
 */
export function keysEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function assertKeyLength(key: Buffer): void {
  if (key.length !== 32) {
    throw new CredentialCryptoError(
      `AES-256-GCM needs a 32-byte key; received ${key.length} bytes.`,
      'malformed',
    );
  }
}
