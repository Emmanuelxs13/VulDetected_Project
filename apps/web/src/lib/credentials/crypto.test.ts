import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  credentialAad,
  CredentialCryptoError,
  IV_BYTES,
  keysEqual,
  openWithKey,
  sealWithKey,
  TAG_BYTES,
} from './crypto';

/**
 * The sealing primitive is the only thing standing between a database dump and a
 * set of working credentials, so these tests are about the properties an attacker
 * would try to break — not about the happy path alone.
 */

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);
const AAD = credentialAad('11111111-1111-1111-1111-111111111111');
const OTHER_AAD = credentialAad('22222222-2222-2222-2222-222222222222');

const SECRET = JSON.stringify({ kind: 'basic', username: 'admin', password: 'hunter2' });

describe('sealWithKey / openWithKey', () => {
  it('round-trips a payload', () => {
    const sealed = sealWithKey(KEY, SECRET, AAD);

    expect(openWithKey(KEY, sealed, AAD)).toBe(SECRET);
  });

  it('stores iv, tag and ciphertext in that order', () => {
    const raw = Buffer.from(sealWithKey(KEY, SECRET, AAD), 'base64');

    // 12 + 16 + the JSON payload; anything else means the layout changed.
    expect(raw.length).toBe(IV_BYTES + TAG_BYTES + Buffer.byteLength(SECRET));
    // The plaintext must not be present in the sealed bytes.
    expect(raw.includes(Buffer.from('hunter2'))).toBe(false);
  });

  it('uses a fresh IV for every seal', () => {
    const first = Buffer.from(sealWithKey(KEY, SECRET, AAD), 'base64');
    const second = Buffer.from(sealWithKey(KEY, SECRET, AAD), 'base64');

    expect(first.subarray(0, IV_BYTES).equals(second.subarray(0, IV_BYTES))).toBe(false);
    expect(first.equals(second)).toBe(false);
  });

  it('refuses to open with a different key', () => {
    const sealed = sealWithKey(KEY, SECRET, AAD);

    expect(() => openWithKey(OTHER_KEY, sealed, AAD)).toThrow(CredentialCryptoError);
  });

  it('refuses to open a payload sealed for another domain', () => {
    const sealed = sealWithKey(KEY, SECRET, AAD);

    expect(() => openWithKey(KEY, sealed, OTHER_AAD)).toThrow(/did not authenticate/);
  });

  it('detects a single flipped byte anywhere in the sealed value', () => {
    const sealed = sealWithKey(KEY, SECRET, AAD);
    const raw = Buffer.from(sealed, 'base64');

    for (const index of [0, IV_BYTES, IV_BYTES + TAG_BYTES, raw.length - 1]) {
      const tampered = Buffer.from(raw);
      tampered[index] = (tampered[index] ?? 0) ^ 0x01;

      expect(() => openWithKey(KEY, tampered.toString('base64'), AAD)).toThrow(
        CredentialCryptoError,
      );
    }
  });

  it('reports a truncated value instead of throwing a raw crypto error', () => {
    expect(() => openWithKey(KEY, Buffer.alloc(20).toString('base64'), AAD)).toThrow(/too short/);
  });

  it('refuses an empty plaintext', () => {
    expect(() => sealWithKey(KEY, '', AAD)).toThrow(/empty credential/);
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => sealWithKey(randomBytes(16), SECRET, AAD)).toThrow(/32-byte key/);
    expect(() => openWithKey(randomBytes(16), sealWithKey(KEY, SECRET, AAD), AAD)).toThrow(
      /32-byte key/,
    );
  });
});

describe('credentialAad', () => {
  it('names the domain, so a blob cannot be moved between rows', () => {
    expect(credentialAad('domain-1')).toBe('vuldetected.scan_credential.v1:domain-1');
    expect(credentialAad('domain-1')).not.toBe(credentialAad('domain-2'));
  });
});

describe('keysEqual', () => {
  it('compares by content, not by identity', () => {
    expect(keysEqual(Buffer.from('abc'), Buffer.from('abc'))).toBe(true);
    expect(keysEqual(Buffer.from('abc'), Buffer.from('abd'))).toBe(false);
    expect(keysEqual(Buffer.from('abc'), Buffer.from('abcd'))).toBe(false);
  });
});
