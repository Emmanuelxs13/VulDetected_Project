import 'server-only';

import { getEnv } from '../env';
import { keysEqual } from './crypto';

/**
 * The credential keyring: one key to write with, one older key to read with.
 *
 * ## Why a ring and not a single key
 *
 * Rotating an encryption key without downtime needs two keys alive at once. If
 * the key were replaced in one step, every credential sealed before the change
 * would stop decrypting the moment the new value reached the process — the row
 * is not wrong, the key that made it is simply gone. So the current key writes,
 * and the immediately previous one keeps reading the rows that have not been
 * re-sealed yet.
 *
 * Two entries is the deliberate ceiling. A ring of unknown depth invites "we
 * never re-seal anything" as a permanent state; with one step, the rotation has
 * an end, and a row left two versions behind fails loudly with the version it
 * needs instead of quietly working forever.
 *
 * ## Format
 *
 * Both variables are base64 of exactly 32 raw bytes, which is what
 * `openssl rand -base64 32` produces. A passphrase is not accepted: it would be
 * coerced into a key of the wrong length, and every byte of password entropy
 * beyond 32 would be silently discarded.
 */

export interface CredentialKey {
  version: number;
  key: Buffer;
}

export interface CredentialKeyring {
  current: CredentialKey;
  previous: CredentialKey | null;
}

export class CredentialKeyringError extends Error {
  constructor(
    message: string,
    readonly variable: string,
  ) {
    super(message);
    this.name = 'CredentialKeyringError';
  }
}

const KEY_BYTES = 32;

/**
 * Parses the raw environment values into a ring.
 *
 * Split out from `credentialKeyring()` so the parsing rules can be tested
 * against literals. Every message names the variable that is wrong, because the
 * reader is an operator looking at a boot failure, not a developer reading code.
 */
export function buildKeyring(input: {
  current: string | undefined;
  previous?: string | undefined;
  version?: number | undefined;
}): CredentialKeyring {
  const version = input.version ?? 1;

  if (!Number.isInteger(version) || version < 1) {
    throw new CredentialKeyringError(
      `CREDENTIALS_ENCRYPTION_KEY_VERSION must be an integer of at least 1; received ${String(
        input.version,
      )}.`,
      'CREDENTIALS_ENCRYPTION_KEY_VERSION',
    );
  }

  const current = {
    version,
    key: decodeKey(input.current, 'CREDENTIALS_ENCRYPTION_KEY'),
  };

  if (input.previous === undefined || input.previous.trim() === '') {
    return { current, previous: null };
  }

  if (version === 1) {
    throw new CredentialKeyringError(
      'CREDENTIALS_ENCRYPTION_KEY_PREVIOUS is set but the current key is version 1: ' +
        'there is no version 0. Raise CREDENTIALS_ENCRYPTION_KEY_VERSION first.',
      'CREDENTIALS_ENCRYPTION_KEY_VERSION',
    );
  }

  const previous = {
    version: version - 1,
    key: decodeKey(input.previous, 'CREDENTIALS_ENCRYPTION_KEY_PREVIOUS'),
  };

  if (keysEqual(current.key, previous.key)) {
    throw new CredentialKeyringError(
      'CREDENTIALS_ENCRYPTION_KEY_PREVIOUS is identical to the current key. ' +
        'A rotation with the same key is not a rotation; unset it or supply the old key.',
      'CREDENTIALS_ENCRYPTION_KEY_PREVIOUS',
    );
  }

  return { current, previous };
}

/**
 * Resolves the key that sealed a row.
 *
 * Returns `null` for a version this process cannot read, which the caller turns
 * into an explicit "credential unusable" failure. Guessing — trying the current
 * key on an older blob — would turn a configuration mistake into a decrypt error
 * that looks like data corruption.
 */
export function keyForVersion(ring: CredentialKeyring, version: number): CredentialKey | null {
  if (ring.current.version === version) {
    return ring.current;
  }
  if (ring.previous !== null && ring.previous.version === version) {
    return ring.previous;
  }
  return null;
}

let cached: CredentialKeyring | null = null;

/** The ring for this process, parsed on first use so a build does not need it. */
export function credentialKeyring(): CredentialKeyring {
  if (cached !== null) {
    return cached;
  }

  const env = getEnv();
  cached = buildKeyring({
    current: env.CREDENTIALS_ENCRYPTION_KEY,
    previous: env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS,
    version: env.CREDENTIALS_ENCRYPTION_KEY_VERSION,
  });

  return cached;
}

/** Test seam: forget the memoised ring so the next call re-reads the env. */
export function resetCredentialKeyringForTesting(): void {
  cached = null;
}

function decodeKey(raw: string | undefined, variable: string): Buffer {
  if (raw === undefined || raw.trim() === '') {
    throw new CredentialKeyringError(
      `${variable} is not set. Scan credentials cannot be sealed without it. ` +
        'Generate one with: openssl rand -base64 32',
      variable,
    );
  }

  const key = Buffer.from(raw.trim(), 'base64');

  if (key.length !== KEY_BYTES) {
    throw new CredentialKeyringError(
      `${variable} must be base64 of exactly ${KEY_BYTES} bytes (got ${key.length}). ` +
        'Generate one with: openssl rand -base64 32',
      variable,
    );
  }

  return key;
}
