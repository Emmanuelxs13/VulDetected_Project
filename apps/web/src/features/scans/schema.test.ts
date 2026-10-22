import { describe, expect, it } from 'vitest';

import { hostnameSchema, normalizeHostname, ownershipVerifySchema } from './schema';

describe('normalizeHostname', () => {
  it('lowercases and trims', () => {
    expect(normalizeHostname('  ExAmPle.COM ')).toBe('example.com');
  });

  it('strips a single trailing DNS root dot', () => {
    expect(normalizeHostname('example.com.')).toBe('example.com');
  });

  it('converts IDN labels to punycode', () => {
    expect(normalizeHostname('bücher.example')).toBe('xn--bcher-kva.example');
  });

  it('rejects URL smuggling shapes that the URL parser would silently repair', () => {
    for (const value of [
      'evil.com@good.example',
      'good.example/path',
      'good.example:8080',
      'good.example?x=1',
      'good.example#frag',
      'exa mple.com',
    ]) {
      expect(normalizeHostname(value)).toBeNull();
    }
  });

  it('rejects every IPv4 spelling the URL parser would canonicalise', () => {
    for (const value of ['127.0.0.1', '2130706433', '127.1', '0x7f.1', '0300.0250.0.01']) {
      expect(normalizeHostname(value)).toBeNull();
    }
  });

  it('rejects IPv6 literals', () => {
    expect(normalizeHostname('[::1]')).toBeNull();
    expect(normalizeHostname('::1')).toBeNull();
  });

  it('rejects empty and malformed labels', () => {
    for (const value of [
      '',
      '.',
      'example..com',
      '.example.com',
      '-foo.com',
      'foo-.com',
      'foo_bar.com',
      'xn--.com',
    ]) {
      expect(normalizeHostname(value)).toBeNull();
    }
  });

  it('rejects labels longer than 63 characters', () => {
    expect(normalizeHostname(`${'a'.repeat(64)}.example.com`)).toBeNull();
  });

  it('rejects hostnames longer than 253 characters', () => {
    const label = 'a'.repeat(63);
    expect(normalizeHostname([label, label, label, label, 'aaa'].join('.'))).toBeNull();
  });

  it('accepts a single-label hostname', () => {
    expect(normalizeHostname('localhost')).toBe('localhost');
  });
});

describe('hostnameSchema', () => {
  it('accepts a valid hostname and keeps the user’s trimmed input', () => {
    expect(hostnameSchema.parse(' Example.com ')).toBe('Example.com');
  });

  it('rejects shapes that can never be a verifiable domain', () => {
    expect(hostnameSchema.safeParse('https://example.com').success).toBe(false);
    expect(hostnameSchema.safeParse('127.0.0.1').success).toBe(false);
    expect(hostnameSchema.safeParse('').success).toBe(false);
  });
});

describe('ownershipVerifySchema', () => {
  it('accepts both documented methods', () => {
    for (const method of ['dns_txt', 'well_known'] as const) {
      expect(ownershipVerifySchema.safeParse({ hostname: 'example.com', method }).success).toBe(
        true,
      );
    }
  });

  it('rejects unknown methods and invalid hostnames', () => {
    expect(
      ownershipVerifySchema.safeParse({ hostname: 'example.com', method: 'http_fetch' }).success,
    ).toBe(false);
    expect(
      ownershipVerifySchema.safeParse({ hostname: '2130706433', method: 'dns_txt' }).success,
    ).toBe(false);
  });
});
