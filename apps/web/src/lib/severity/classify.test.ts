import { describe, expect, it } from 'vitest';

import { classifyFinding, getSeverityVariant } from './classify';

describe('classifyFinding', () => {
  it('treats a missing HTTPS endpoint as high', () => {
    expect(classifyFinding('tls', { scheme: 'http' }, 'HTTPS not available')).toEqual({
      severity: 'high',
      rationale: 'noHttps',
    });
  });

  it('treats an HTTPS downgrade as high', () => {
    expect(
      classifyFinding('redirects', { final_url: 'http://x' }, 'HTTPS downgraded to HTTP'),
    ).toEqual({
      severity: 'high',
      rationale: 'httpsDowngrade',
    });
  });

  it('maps HSTS and CSP to high and the softer headers below it', () => {
    expect(classifyFinding('security_headers', { header: 'strict-transport-security' })).toEqual({
      severity: 'high',
      rationale: 'missingHsts',
    });
    expect(classifyFinding('security_headers', { header: 'content-security-policy' })).toEqual({
      severity: 'high',
      rationale: 'missingCsp',
    });
    expect(classifyFinding('security_headers', { header: 'x-frame-options' })).toEqual({
      severity: 'medium',
      rationale: 'missingFrameOptions',
    });
    expect(classifyFinding('security_headers', { header: 'x-content-type-options' })).toEqual({
      severity: 'low',
      rationale: 'missingContentTypeOptions',
    });
    expect(classifyFinding('security_headers', { header: 'referrer-policy' })).toEqual({
      severity: 'low',
      rationale: 'missingReferrerPolicy',
    });
    expect(classifyFinding('security_headers', { header: 'permissions-policy' })).toEqual({
      severity: 'info',
      rationale: 'missingPermissionsPolicy',
    });
  });

  it('grades cookie flags by what is actually missing', () => {
    expect(classifyFinding('cookies', {}, 'Cookie missing Secure flag')).toEqual({
      severity: 'medium',
      rationale: 'cookieMissingSecure',
    });
    expect(classifyFinding('cookies', {}, 'Cookie missing HttpOnly flag')).toEqual({
      severity: 'medium',
      rationale: 'cookieMissingHttpOnly',
    });
    expect(classifyFinding('cookies', {}, 'Cookie missing SameSite attribute')).toEqual({
      severity: 'low',
      rationale: 'cookieMissingSameSite',
    });
  });

  it('leaves an unknown check unclassified instead of guessing', () => {
    expect(classifyFinding('future_nuclei_check', {})).toEqual({
      severity: 'unclassified',
      rationale: 'unknownCheck',
    });
  });

  it('is deterministic: the same finding always yields the same severity', () => {
    const first = classifyFinding('security_headers', { header: 'content-security-policy' });
    const second = classifyFinding('security_headers', { header: 'content-security-policy' });
    expect(first).toEqual(second);
  });
});

describe('getSeverityVariant', () => {
  it('keeps known severities and falls back to unknown', () => {
    expect(getSeverityVariant('high')).toBe('high');
    expect(getSeverityVariant('unclassified')).toBe('unknown');
    expect(getSeverityVariant('nonsense')).toBe('unknown');
  });
});
