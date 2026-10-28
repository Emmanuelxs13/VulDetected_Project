import { describe, expect, it } from 'vitest';

import { OWASP_TOP10_2021, owaspCategoryCodeFor, owaspCategoryFor } from './owasp';

describe('owaspCategoryFor', () => {
  it('maps transport and injection checks to their OWASP 2021 items', () => {
    expect(owaspCategoryFor('tls')?.code).toBe('A02');
    expect(owaspCategoryFor('redirects')?.code).toBe('A02');
    expect(owaspCategoryFor('xss')?.code).toBe('A03');
    expect(owaspCategoryFor('sqli')?.code).toBe('A03');
    expect(owaspCategoryFor('open_redirect')?.code).toBe('A01');
    expect(owaspCategoryFor('cors')?.code).toBe('A05');
  });

  it('returns the full title, not just the code', () => {
    expect(owaspCategoryFor('security_headers')).toEqual({
      code: 'A05',
      title: 'Security Misconfiguration',
    });
  });

  it('refuses to guess for an unknown check', () => {
    expect(owaspCategoryFor('future_nuclei_check')).toBeNull();
    expect(owaspCategoryCodeFor('future_nuclei_check')).toBeNull();
  });

  it('keeps every mapped code inside the 2021 catalogue', () => {
    for (const check of ['tls', 'redirects', 'cookies', 'security_headers', 'xss', 'sqli']) {
      const category = owaspCategoryFor(check);
      expect(category).not.toBeNull();
      expect(OWASP_TOP10_2021[category!.code]).toEqual(category);
    }
  });
});
