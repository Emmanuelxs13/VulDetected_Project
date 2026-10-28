import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { computeFindingKey, computeNewFindingKeys, normalizeFindingUrl } from './newness';

interface FingerprintVector {
  domainId: string;
  check: string;
  rawUrl: string;
  normalized: string;
  discriminator: string | null;
  expected: string;
}

const fingerprintVectors: FingerprintVector[] = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../../services/scanner/tests/fixtures/fingerprints.json',
    ),
    'utf8',
  ),
) as FingerprintVector[];

describe('normalizeFindingUrl', () => {
  it('lowercases the host and drops the fragment', () => {
    expect(normalizeFindingUrl('https://Example.COM/Path#section')).toBe(
      'https://example.com/Path',
    );
  });

  it('removes a default port but keeps a non-default one', () => {
    expect(normalizeFindingUrl('https://example.com:443/login')).toBe('https://example.com/login');
    expect(normalizeFindingUrl('http://example.com:80/')).toBe('http://example.com/');
    expect(normalizeFindingUrl('https://example.com:8443/login')).toBe(
      'https://example.com:8443/login',
    );
  });

  it('sorts query parameters so their order cannot fork identity', () => {
    expect(normalizeFindingUrl('https://example.com/s?b=2&a=1')).toBe(
      normalizeFindingUrl('https://example.com/s?a=1&b=2'),
    );
  });

  it('keeps path and query: they change what was scanned', () => {
    expect(normalizeFindingUrl('https://example.com/a?q=1')).not.toBe(
      normalizeFindingUrl('https://example.com/b?q=1'),
    );
  });

  it('returns an unparseable value trimmed instead of inventing a host', () => {
    expect(normalizeFindingUrl('  not a url  ')).toBe('not a url');
    expect(normalizeFindingUrl('')).toBe('');
  });
});

describe('computeFindingKey', () => {
  it('matches the Python worker on the shared fingerprint fixture', () => {
    for (const vector of fingerprintVectors) {
      expect(normalizeFindingUrl(vector.rawUrl), `normalize ${vector.rawUrl}`).toBe(
        vector.normalized,
      );
      expect(
        computeFindingKey({
          domainId: vector.domainId,
          checkName: vector.check,
          affectedUrl: vector.rawUrl,
          discriminator: vector.discriminator ?? undefined,
        }),
      ).toBe(vector.expected);
    }
  });

  it('is stable across URL spellings of the same page', () => {
    const a = computeFindingKey({
      domainId: 'd1',
      checkName: 'security_headers',
      affectedUrl: 'https://Example.com:443/?b=2&a=1',
    });
    const b = computeFindingKey({
      domainId: 'd1',
      checkName: 'security_headers',
      affectedUrl: 'https://example.com?a=1&b=2',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('separates findings that share check and URL by discriminator', () => {
    const hsts = computeFindingKey({
      domainId: 'd1',
      checkName: 'security_headers',
      affectedUrl: 'https://example.com/',
      discriminator: 'strict-transport-security',
    });
    const csp = computeFindingKey({
      domainId: 'd1',
      checkName: 'security_headers',
      affectedUrl: 'https://example.com/',
      discriminator: 'content-security-policy',
    });
    expect(hsts).not.toBe(csp);
  });

  it('separates the same finding across domains and checks', () => {
    const base = { affectedUrl: 'https://example.com/' };
    expect(computeFindingKey({ ...base, domainId: 'd1', checkName: 'tls' })).not.toBe(
      computeFindingKey({ ...base, domainId: 'd2', checkName: 'tls' }),
    );
    expect(computeFindingKey({ ...base, domainId: 'd1', checkName: 'tls' })).not.toBe(
      computeFindingKey({ ...base, domainId: 'd1', checkName: 'redirects' }),
    );
  });
});

describe('computeNewFindingKeys', () => {
  it('marks every finding as new when there is no previous scan', () => {
    expect([...computeNewFindingKeys(['a', 'b'], new Set())]).toEqual(['a', 'b']);
  });

  it('marks only the keys absent from the previous scan', () => {
    const fresh = computeNewFindingKeys(['a', 'b', 'c'], new Set(['a', 'c', 'z']));
    expect([...fresh]).toEqual(['b']);
  });

  it('marks nothing as new when the sets match', () => {
    expect(computeNewFindingKeys(['a'], new Set(['a'])).size).toBe(0);
  });

  it('does not double-count a repeated key in the current scan', () => {
    expect(computeNewFindingKeys(['a', 'a'], new Set()).size).toBe(1);
  });
});
