import { describe, expect, it } from 'vitest';

import {
  CREDENTIAL_KINDS,
  CredentialSecretError,
  credentialSecretSchema,
  parseCredentialSecret,
  saveCredentialSchema,
  serializeCredentialSecret,
} from './secret';

/**
 * This schema is the only place a stored credential is inspected: the ciphertext
 * is opaque to the database, so whatever it accepts becomes request headers on a
 * live target. The tests below are therefore mostly about what it refuses.
 */

const DOMAIN_ID = '11111111-1111-4111-8111-111111111111';

describe('credentialSecretSchema', () => {
  it('accepts the three supported kinds', () => {
    expect(
      credentialSecretSchema.safeParse({ kind: 'basic', username: 'u', password: 'p' }).success,
    ).toBe(true);
    expect(credentialSecretSchema.safeParse({ kind: 'bearer', token: 't' }).success).toBe(true);
    expect(
      credentialSecretSchema.safeParse({
        kind: 'header',
        headerName: 'X-Api-Key',
        headerValue: 'secret',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown kind and unknown fields', () => {
    expect(credentialSecretSchema.safeParse({ kind: 'certificate', pem: 'x' }).success).toBe(false);
    expect(
      credentialSecretSchema.safeParse({ kind: 'bearer', token: 't', extra: 'nope' }).success,
    ).toBe(false);
  });

  it('requires the fields of the declared kind', () => {
    expect(credentialSecretSchema.safeParse({ kind: 'basic', username: 'u' }).success).toBe(false);
    expect(credentialSecretSchema.safeParse({ kind: 'header', headerName: 'X' }).success).toBe(
      false,
    );
  });

  it('rejects line breaks in a header value instead of stripping them', () => {
    // Stripping would send something different from what the user typed and hide
    // the attempt; the value has to be refused.
    for (const value of ['a\r\nX-Admin: true', 'a\nb', 'a\rb']) {
      const result = credentialSecretSchema.safeParse({
        kind: 'header',
        headerName: 'X-Api-Key',
        headerValue: value,
      });

      expect(result.success).toBe(false);
    }
  });

  it('rejects header names that are not HTTP tokens', () => {
    for (const headerName of ['X Api Key', 'X-Api-Key:', '']) {
      expect(
        credentialSecretSchema.safeParse({ kind: 'header', headerName, headerValue: 'v' }).success,
      ).toBe(false);
    }
  });

  it('rejects headers the scanner HTTP client owns', () => {
    for (const headerName of [
      'Host',
      'content-length',
      'Connection',
      'Transfer-Encoding',
      'Upgrade',
      'TE',
    ]) {
      expect(
        credentialSecretSchema.safeParse({ kind: 'header', headerName, headerValue: 'v' }).success,
      ).toBe(false);
    }
  });
});

describe('saveCredentialSchema', () => {
  it('requires a uuid domain, a non-empty label and a valid secret', () => {
    expect(
      saveCredentialSchema.safeParse({
        domainId: DOMAIN_ID,
        label: 'Production',
        secret: { kind: 'bearer', token: 't' },
      }).success,
    ).toBe(true);

    expect(
      saveCredentialSchema.safeParse({
        domainId: 'not-a-uuid',
        label: 'Production',
        secret: { kind: 'bearer', token: 't' },
      }).success,
    ).toBe(false);

    expect(
      saveCredentialSchema.safeParse({
        domainId: DOMAIN_ID,
        label: '   ',
        secret: { kind: 'bearer', token: 't' },
      }).success,
    ).toBe(false);
  });
});

describe('serializeCredentialSecret / parseCredentialSecret', () => {
  it('round-trips each kind', () => {
    for (const kind of CREDENTIAL_KINDS) {
      const secret =
        kind === 'basic'
          ? ({ kind, username: 'u', password: 'p' } as const)
          : kind === 'bearer'
            ? ({ kind, token: 't' } as const)
            : ({ kind, headerName: 'X-Api-Key', headerValue: 'v' } as const);

      expect(parseCredentialSecret(serializeCredentialSecret(secret), kind)).toEqual(secret);
    }
  });

  it('rejects a payload that is not JSON', () => {
    expect(() => parseCredentialSecret('not json', 'bearer')).toThrow(CredentialSecretError);
    expect(() => parseCredentialSecret('not json', 'bearer')).toThrow(/not valid JSON/);
  });

  it('rejects an authentic payload of the wrong shape', () => {
    expect(() => parseCredentialSecret('{"kind":"basic"}', 'basic')).toThrow(/invalid/);
    expect(() => parseCredentialSecret('[]', 'bearer')).toThrow(/invalid/);
  });

  it('rejects a payload whose kind disagrees with the row', () => {
    const serialized = serializeCredentialSecret({ kind: 'bearer', token: 't' });

    expect(() => parseCredentialSecret(serialized, 'basic')).toThrow(/row says basic/);
  });
});
