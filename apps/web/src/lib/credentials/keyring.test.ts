import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvForTesting } from '../env';
import {
  buildKeyring,
  credentialKeyring,
  CredentialKeyringError,
  keyForVersion,
  resetCredentialKeyringForTesting,
} from './keyring';

/**
 * The keyring decides which key sealed a row, so these tests are about the
 * rotation contract: exactly two versions, the previous one read-only, and a
 * configuration mistake that fails loudly instead of silently making old
 * credentials unreadable.
 */

function base64Key(): string {
  return randomBytes(32).toString('base64');
}

describe('buildKeyring', () => {
  it('defaults to version 1 with no previous key', () => {
    const ring = buildKeyring({ current: base64Key() });

    expect(ring.current.version).toBe(1);
    expect(ring.previous).toBeNull();
  });

  it('accepts a current key and the immediately previous one', () => {
    const ring = buildKeyring({ current: base64Key(), previous: base64Key(), version: 2 });

    expect(ring.current.version).toBe(2);
    expect(ring.previous?.version).toBe(1);
    expect(ring.previous?.key.length).toBe(32);
  });

  it('refuses a missing current key and names the variable', () => {
    expect(() => buildKeyring({ current: undefined })).toThrow(
      /CREDENTIALS_ENCRYPTION_KEY is not set/,
    );
    expect(() => buildKeyring({ current: '   ' })).toThrow(/CREDENTIALS_ENCRYPTION_KEY is not set/);
  });

  it('refuses a passphrase instead of a base64 32-byte key', () => {
    expect(() =>
      buildKeyring({ current: 'a-very-long-human-readable-passphrase-of-more-than-32' }),
    ).toThrow(CredentialKeyringError);

    expect(() => buildKeyring({ current: randomBytes(16).toString('base64') })).toThrow(
      /exactly 32 bytes/,
    );
  });

  it('refuses a previous key while the current one is version 1', () => {
    expect(() => buildKeyring({ current: base64Key(), previous: base64Key(), version: 1 })).toThrow(
      /there is no version 0/,
    );
  });

  it('refuses an invalid version', () => {
    expect(() => buildKeyring({ current: base64Key(), version: 0 })).toThrow(
      /integer of at least 1/,
    );
    expect(() => buildKeyring({ current: base64Key(), version: 1.5 })).toThrow(
      /integer of at least 1/,
    );
  });

  it('refuses a "rotation" that kept the same key', () => {
    const key = base64Key();

    expect(() => buildKeyring({ current: key, previous: key, version: 2 })).toThrow(
      /identical to the current key/,
    );
  });

  it('treats an empty previous value as absent', () => {
    const ring = buildKeyring({ current: base64Key(), previous: '   ', version: 2 });

    expect(ring.previous).toBeNull();
  });
});

describe('keyForVersion', () => {
  const current = base64Key();
  const previous = base64Key();

  it('resolves the current and the previous version, and nothing else', () => {
    const ring = buildKeyring({ current, previous, version: 2 });

    expect(keyForVersion(ring, 2)?.version).toBe(2);
    expect(keyForVersion(ring, 1)?.version).toBe(1);
    expect(keyForVersion(ring, 3)).toBeNull();
    expect(keyForVersion(ring, 0)).toBeNull();
  });
});

describe('credentialKeyring', () => {
  beforeEach(() => {
    resetCredentialKeyringForTesting();
    resetEnvForTesting();

    // `getEnv()` validates the whole schema, so the ring cannot be read without a
    // valid base environment. Only the three mandatory variables are needed; the
    // credential key is supplied per test.
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/vuldetected');
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));
    vi.stubEnv('AUTH_URL', 'http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetCredentialKeyringForTesting();
    resetEnvForTesting();
  });

  it('reads and memoises the ring from the environment', () => {
    const key = base64Key();
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', key);

    const first = credentialKeyring();
    const second = credentialKeyring();

    expect(first.current.key.toString('base64')).toBe(key);
    // Same object: the ring is parsed once per process.
    expect(second).toBe(first);
  });

  it('re-reads the environment after the test seam resets it', () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', base64Key());
    const first = credentialKeyring();

    resetCredentialKeyringForTesting();
    resetEnvForTesting();
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', base64Key());

    expect(credentialKeyring()).not.toBe(first);
  });
});
