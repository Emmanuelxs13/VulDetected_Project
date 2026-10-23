import type { Severity } from '@/lib/severity/classify';

export type AudienceGuide = { title: string; steps: string[]; notes?: string[] };

export interface RemediationEntry {
  ruleKey: string;
  /**
   * Every severity this rule can produce. Mirrors `RULE_SEVERITIES` in the
   * classifier; `completeness.test.ts` fails when the two drift apart, which is
   * what makes "a High finding never lacks guidance" a build-time guarantee.
   */
  severities: readonly Severity[];
  version: string;
  developerGuide: AudienceGuide;
  sysadminGuide: AudienceGuide;
  businessGuide: AudienceGuide;
  codeFixes: Array<{ language: string; label: string; code: string }>;
}

/**
 * Static, version-controlled remediation guidance (Sprint 3, RM-1).
 *
 * ## WHY THIS IS CODE AND NOT A TABLE
 *
 * The roadmap asks for two things that a database row cannot give us: the build
 * has to fail when a Critical/High rule has no guidance, and every code sample
 * has to pass a syntax check. Both are compile-time/test-time guarantees, so the
 * content lives in a typed module: a missing entry breaks `pnpm test`, and a
 * broken snippet breaks the syntax test in `completeness.test.ts`.
 *
 * ## WHY `version` EXISTS
 *
 * Findings keep the severity that was computed when they were written. This
 * registry can be corrected later without rewriting history: the detail view
 * renders whatever `version` is current, and the finding's own severity stays
 * untouched. That is the "correct the guidance without invalidating historical
 * findings" requirement.
 */
export const remediationRegistry: RemediationEntry[] = [
  {
    ruleKey: 'security_headers',
    severities: ['high', 'medium', 'low', 'info'],
    version: '1.0',
    developerGuide: {
      title: 'Add the missing security headers',
      steps: [
        'Send HSTS, Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy.',
        'Prefer a strict Content-Security-Policy with nonces over a permissive one.',
        'Verify the headers on every response, including redirects and error pages.',
      ],
    },
    sysadminGuide: {
      title: 'Configure headers at the edge',
      steps: [
        'Set the headers in the reverse proxy or load balancer so every upstream inherits them.',
        'Enable HSTS with a long max-age and includeSubDomains.',
        'Check for duplicate headers: the strictest value wins, not the last one.',
      ],
    },
    businessGuide: {
      title: 'What this means for the business',
      steps: [
        'Missing headers widen the attack surface with cheap, browser-level attacks.',
        'They are commonly required by baseline hardening and security questionnaires.',
      ],
    },
    codeFixes: [
      {
        language: 'nginx',
        label: 'Nginx',
        code: 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\nadd_header X-Content-Type-Options "nosniff" always;\nadd_header X-Frame-Options "DENY" always;\nadd_header Referrer-Policy "strict-origin-when-cross-origin" always;\nadd_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\nadd_header Content-Security-Policy "default-src \'self\'" always;',
      },
      {
        language: 'typescript',
        label: 'Express with helmet',
        code: "import helmet from 'helmet';\n\napp.use(\n  helmet({\n    contentSecurityPolicy: { directives: { defaultSrc: [\"'self'\"] } },\n    hsts: { maxAge: 31536000, includeSubDomains: true },\n  }),\n);",
      },
    ],
  },
  {
    ruleKey: 'cookies',
    severities: ['medium', 'low'],
    version: '1.0',
    developerGuide: {
      title: 'Harden the cookie flags',
      steps: [
        'Set Secure, HttpOnly and SameSite on every session or authentication cookie.',
        'Use the __Host- prefix when the cookie is host-only.',
        'Never set authentication cookies over plain HTTP.',
      ],
    },
    sysadminGuide: {
      title: 'Fix the session configuration',
      steps: [
        'Configure the framework or session store to emit the flags, not the client.',
        'Confirm TLS terminates correctly, otherwise Secure cookies are rejected.',
      ],
    },
    businessGuide: {
      title: 'What this means for the business',
      steps: [
        'Missing flags make session theft easier through XSS or man-in-the-middle.',
        'The fix is configuration only: no product behaviour changes.',
      ],
    },
    codeFixes: [
      {
        language: 'typescript',
        label: 'Express',
        code: "res.cookie('session', token, {\n  httpOnly: true,\n  secure: true,\n  sameSite: 'strict',\n  path: '/',\n});",
      },
      {
        language: 'typescript',
        label: 'Next.js server action',
        code: "const jar = await cookies();\njar.set('session', token, {\n  httpOnly: true,\n  secure: true,\n  sameSite: 'strict',\n  path: '/',\n});",
      },
    ],
  },
  {
    ruleKey: 'tls',
    severities: ['high'],
    version: '1.0',
    developerGuide: {
      title: 'Serve the site over HTTPS',
      steps: [
        'Obtain a valid certificate and terminate TLS at the edge.',
        'Redirect every HTTP request to HTTPS with a 301.',
        'Remove mixed content so the page does not request HTTP subresources.',
      ],
    },
    sysadminGuide: {
      title: 'Provision TLS',
      steps: [
        'Issue a certificate through ACME (for example Let’s Encrypt) and renew it automatically.',
        'Require TLS 1.2 or newer and a modern cipher suite.',
        'Redirect port 80 to port 443 at the load balancer.',
      ],
    },
    businessGuide: {
      title: 'What this means for the business',
      steps: [
        'Without HTTPS every credential and session token travels in clear text.',
        'Browsers mark the site as not secure, which costs trust and conversions.',
      ],
    },
    codeFixes: [
      {
        language: 'nginx',
        label: 'Nginx redirect',
        code: 'server {\n  listen 80;\n  server_name example.com;\n  return 301 https://$host$request_uri;\n}',
      },
    ],
  },
  {
    ruleKey: 'redirects',
    severities: ['high'],
    version: '1.0',
    developerGuide: {
      title: 'Remove the HTTPS downgrade',
      steps: [
        'Never redirect from an HTTPS URL to an HTTP URL.',
        'Resolve redirect targets to HTTPS before sending the 3xx response.',
        'Serve HSTS so browsers refuse the downgrade even if a link is wrong.',
      ],
    },
    sysadminGuide: {
      title: 'Audit the redirect rules',
      steps: [
        'Review every redirect rule for a scheme change.',
        'Make sure the load balancer forwards the original scheme so the app does not downgrade.',
      ],
    },
    businessGuide: {
      title: 'What this means for the business',
      steps: [
        'A downgrade silently exposes the first request of every session to interception.',
        'The fix is a redirect rule, not a code change in the product.',
      ],
    },
    codeFixes: [
      {
        language: 'nginx',
        label: 'Force HTTPS',
        code: 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n# Remove any redirect whose target starts with http://',
      },
    ],
  },
];

export function getRemediation(ruleKey: string): RemediationEntry | undefined {
  return remediationRegistry.find((entry) => entry.ruleKey === ruleKey);
}

export function hasRemediation(ruleKey: string): boolean {
  return remediationRegistry.some((entry) => entry.ruleKey === ruleKey);
}
