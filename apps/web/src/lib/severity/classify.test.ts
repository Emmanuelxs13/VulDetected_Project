import { describe, expect, it } from 'vitest';

import { RULE_SEVERITIES, classifyFinding, getSeverityVariant } from './classify';

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

  it('classifies the active checks by the evidence they actually observed', () => {
    expect(classifyFinding('xss', { parameter: 'q' })).toEqual({
      severity: 'high',
      rationale: 'reflectedXss',
    });
    expect(classifyFinding('sqli', { parameter: 'id' })).toEqual({
      severity: 'critical',
      rationale: 'sqlInjection',
    });
    expect(classifyFinding('open_redirect', { parameter: 'next' })).toEqual({
      severity: 'medium',
      rationale: 'openRedirect',
    });
    expect(classifyFinding('directory_listing', { path: '/uploads/' })).toEqual({
      severity: 'medium',
      rationale: 'directoryListing',
    });
  });

  it('scales CORS by reflection and credentials', () => {
    expect(
      classifyFinding('cors', { reflected: true, allow_credentials: true }).severity,
    ).toBe('high');
    expect(classifyFinding('cors', { reflected: true, allow_credentials: false }).severity).toBe(
      'medium',
    );
    expect(classifyFinding('cors', { reflected: false, wildcard: true }).severity).toBe('low');
  });

  it('treats an exposed secret as critical and a config file as high', () => {
    expect(classifyFinding('sensitive_files', { kind: 'env' })).toEqual({
      severity: 'critical',
      rationale: 'exposedSecretFile',
    });
    expect(classifyFinding('sensitive_files', { kind: 'git' }).severity).toBe('critical');
    expect(classifyFinding('sensitive_files', { kind: 'backup' }).severity).toBe('critical');
    expect(classifyFinding('sensitive_files', { kind: 'config' })).toEqual({
      severity: 'high',
      rationale: 'exposedConfigFile',
    });
    expect(classifyFinding('sensitive_files', { kind: 'phpinfo' }).severity).toBe('high');
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

  it('never produces a severity outside the declared set for its rule', () => {
    const samples: Array<{ check: string; evidence: Record<string, unknown>; title?: string }> = [
      { check: 'tls', evidence: {} },
      { check: 'redirects', evidence: {} },
      { check: 'security_headers', evidence: { header: 'strict-transport-security' } },
      { check: 'security_headers', evidence: { header: 'content-security-policy' } },
      { check: 'security_headers', evidence: { header: 'x-frame-options' } },
      { check: 'security_headers', evidence: { header: 'x-content-type-options' } },
      { check: 'security_headers', evidence: { header: 'referrer-policy' } },
      { check: 'security_headers', evidence: { header: 'permissions-policy' } },
      { check: 'security_headers', evidence: { header: 'something-new' } },
      { check: 'cookies', evidence: {}, title: 'Cookie missing Secure flag' },
      { check: 'cookies', evidence: {}, title: 'Cookie missing HttpOnly flag' },
      { check: 'cookies', evidence: {}, title: 'Cookie missing SameSite attribute' },
      { check: 'cookies', evidence: {}, title: 'Cookie without SameSite' },
      { check: 'xss', evidence: { parameter: 'q' } },
      { check: 'sqli', evidence: { parameter: 'id' } },
      { check: 'open_redirect', evidence: { parameter: 'next' } },
      { check: 'cors', evidence: { reflected: true, allow_credentials: true } },
      { check: 'cors', evidence: { reflected: true, allow_credentials: false } },
      { check: 'cors', evidence: { reflected: false, wildcard: true } },
      { check: 'directory_listing', evidence: { path: '/uploads/' } },
      { check: 'sensitive_files', evidence: { kind: 'env' } },
      { check: 'sensitive_files', evidence: { kind: 'config' } },
    ];

    for (const sample of samples) {
      const rule = sample.check as keyof typeof RULE_SEVERITIES;
      const { severity } = classifyFinding(sample.check, sample.evidence, sample.title);
      expect(RULE_SEVERITIES[rule], `undeclared rule ${sample.check}`).toBeDefined();
      expect(RULE_SEVERITIES[rule]).toContain(severity);
    }
  });
});

describe('getSeverityVariant', () => {
  it('keeps known severities and falls back to unknown', () => {
    expect(getSeverityVariant('high')).toBe('high');
    expect(getSeverityVariant('unclassified')).toBe('unknown');
    expect(getSeverityVariant('nonsense')).toBe('unknown');
  });
});
