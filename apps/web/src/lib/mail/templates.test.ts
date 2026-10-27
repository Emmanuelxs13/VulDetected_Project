import { describe, expect, it } from 'vitest';

import {
  mailLocaleOf,
  renderMail,
  RESET_TTL_MINUTES,
  VERIFICATION_TTL_HOURS,
  type MailLocale,
  type SeverityCounts,
} from './templates';

/**
 * The templates are the only part of this product that writes copy a user reads
 * outside the app, so the checks here are about what the message *promises* and
 * what it *cannot* contain — not about exact wording, which would make every
 * copy edit a test failure.
 */

const counts: SeverityCounts = {
  critical: 2,
  high: 0,
  medium: 3,
  low: 0,
  other: 1,
  total: 6,
};

function renderFor(locale: MailLocale) {
  return {
    verify: renderMail('verify_email', locale, {
      url: 'https://app.example.com/api/auth/verify-email?token=abc',
      expiresInHours: VERIFICATION_TTL_HOURS,
    }),
    reset: renderMail('reset_password', locale, {
      url: 'https://app.example.com/api/auth/reset-password/abc?callbackURL=%2Freset-password',
      expiresInMinutes: RESET_TTL_MINUTES,
    }),
    scan: renderMail('scan_completed', locale, {
      hostname: 'example.com',
      targetUrl: 'https://example.com/',
      scanUrl: 'https://app.example.com/scans/11111111-1111-1111-1111-111111111111',
      counts,
    }),
    critical: renderMail('new_critical_finding', locale, {
      hostname: 'example.com',
      scanUrl: 'https://app.example.com/scans/11111111-1111-1111-1111-111111111111',
      findings: [
        { title: 'Missing HSTS header', affectedUrl: 'https://example.com/' },
        { title: 'SQL injection', affectedUrl: 'https://example.com/search?q=1' },
      ],
    }),
  };
}

const LOCALES: MailLocale[] = ['es', 'en'];

describe('renderMail', () => {
  it.each(LOCALES)('renders every template in %s with a subject, html and text', (locale) => {
    for (const mail of Object.values(renderFor(locale))) {
      expect(mail.subject.trim()).not.toBe('');
      expect(mail.html).toContain('<div');
      expect(mail.text.trim()).not.toBe('');
    }
  });

  it.each(LOCALES)('writes the same templates in %s as in the other locale', (locale) => {
    const other: MailLocale = locale === 'es' ? 'en' : 'es';
    const mine = Object.keys(renderFor(locale)).sort();
    const theirs = Object.keys(renderFor(other)).sort();

    expect(mine).toEqual(theirs);
  });

  it('produces different copy per locale', () => {
    const es = renderFor('es');
    const en = renderFor('en');

    for (const key of Object.keys(es) as Array<keyof typeof es>) {
      expect(es[key].subject).not.toBe(en[key].subject);
    }
  });

  it('quotes the lifetimes the caller passed, not a hardcoded one', () => {
    const shortWindow = renderMail('verify_email', 'en', {
      url: 'https://app.example.com/verify?token=abc',
      expiresInHours: 2,
    });
    const longWindow = renderMail('verify_email', 'en', {
      url: 'https://app.example.com/verify?token=abc',
      expiresInHours: 48,
    });

    expect(shortWindow.text).toContain('2 hours');
    expect(longWindow.text).toContain('48 hours');
  });

  it('lists only the severity buckets that have findings', () => {
    const mail = renderMail('scan_completed', 'en', {
      hostname: 'example.com',
      targetUrl: 'https://example.com/',
      scanUrl: 'https://app.example.com/scans/1',
      counts,
    });

    expect(mail.text).toContain('Critical: 2');
    expect(mail.text).toContain('Medium: 3');
    expect(mail.text).toContain('Unclassified: 1');
    expect(mail.text).not.toContain('High:');
    expect(mail.text).not.toContain('Low:');
  });

  it('says there were no findings instead of printing an empty histogram', () => {
    const mail = renderMail('scan_completed', 'es', {
      hostname: 'example.com',
      targetUrl: 'https://example.com/',
      scanUrl: 'https://app.example.com/scans/1',
      counts: { critical: 0, high: 0, medium: 0, low: 0, other: 0, total: 0 },
    });

    expect(mail.text).toContain('No se encontraron hallazgos abiertos');
    expect(mail.text).not.toContain('Críticos');
  });

  it('escapes every interpolated value in the HTML body', () => {
    const mail = renderMail('new_critical_finding', 'es', {
      hostname: '<script>alert(1)</script>',
      scanUrl: 'https://app.example.com/scans/1',
      findings: [
        {
          title: '<img src=x onerror="alert(\'x\')">',
          affectedUrl: 'https://example.com/?a=1&b="2"',
        },
      ],
    });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&lt;img');
    expect(mail.html).toContain('&amp;b=&quot;2&quot;');
  });

  it('refuses to turn a non-http URL into a link', () => {
    const mail = renderMail('reset_password', 'en', {
      url: 'javascript:alert(document.cookie)',
      expiresInMinutes: RESET_TTL_MINUTES,
    });

    expect(mail.html).not.toContain('javascript:');
    expect(mail.html).not.toContain('<a ');
    expect(mail.text).not.toContain('javascript:');
  });

  it('renders a relative URL as no link at all rather than a broken one', () => {
    const mail = renderMail('verify_email', 'en', {
      url: '/api/auth/verify-email?token=abc',
      expiresInHours: VERIFICATION_TTL_HOURS,
    });

    expect(mail.html).not.toContain('href="/api');
    expect(mail.text).not.toContain('/api/auth');
  });

  it('caps the critical list so one bad scan cannot produce an unreadable email', () => {
    const findings = Array.from({ length: 25 }, (_, index) => ({
      title: `Finding ${index}`,
      affectedUrl: 'https://example.com/',
    }));

    const mail = renderMail('new_critical_finding', 'en', {
      hostname: 'example.com',
      scanUrl: 'https://app.example.com/scans/1',
      findings,
    });

    expect(mail.text).toContain('Finding 9');
    expect(mail.text).not.toContain('Finding 10 —');
    // The sentence still reports the true count, even though the list is short.
    expect(mail.text).toContain('25 critical findings');
  });

  it('keeps the promised reset window at one hour', () => {
    expect(RESET_TTL_MINUTES).toBe(60);
    expect(renderMail('reset_password', 'en', { url: 'https://a.example/x', expiresInMinutes: 60 }).text).toContain(
      '60 minutes',
    );
  });

  it('keeps the promised verification window at one day', () => {
    expect(VERIFICATION_TTL_HOURS).toBe(24);
  });
});

describe('mailLocaleOf', () => {
  it('honours English', () => {
    expect(mailLocaleOf('en')).toBe('en');
  });

  it('defaults to Spanish for anything else', () => {
    expect(mailLocaleOf('es')).toBe('es');
    expect(mailLocaleOf(null)).toBe('es');
    expect(mailLocaleOf(undefined)).toBe('es');
    expect(mailLocaleOf('fr')).toBe('es');
  });
});
