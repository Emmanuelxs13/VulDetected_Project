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
  {
    ruleKey: 'xss',
    severities: ['high'],
    version: '1.0',
    developerGuide: {
      title: 'Encode the reflected parameter',
      steps: [
        'Escape user input for the exact context it lands in: HTML body, attribute, URL or JavaScript.',
        'Prefer a templating engine with contextual auto-escaping over manual string concatenation.',
        'Never feed request data into innerHTML, dangerouslySetInnerHTML or eval.',
        'Keep a strict Content-Security-Policy as the second line of defence.',
      ],
      notes: [
        'HTML-escaping is what makes the check pass: the payload arrives as text, not as markup.',
      ],
    },
    sysadminGuide: {
      title: 'Reduce the blast radius while the fix ships',
      steps: [
        'Confirm the response sends Content-Type with an explicit charset.',
        'Deploy a Content-Security-Policy that forbids inline script.',
        'Check whether a WAF rule is masking the issue locally but not in production.',
      ],
    },
    businessGuide: {
      title: 'What this means for the business',
      steps: [
        'Reflected XSS lets an attacker run code in a customer session through a crafted link.',
        'The usual outcomes are session theft, form manipulation and phishing from your own domain.',
      ],
    },
    codeFixes: [
      {
        language: 'typescript',
        label: 'DOM: write text, never HTML',
        code: "// The value becomes text. Markup in the input stays markup for the attacker only.\nelement.textContent = untrustedValue;",
      },
      {
        language: 'typescript',
        label: 'Server: sanitise what must allow markup',
        code: "import sanitizeHtml from 'sanitize-html';\n\nconst safe = sanitizeHtml(untrustedHtml, {\n  allowedTags: [],\n  allowedAttributes: {},\n});",
      },
    ],
  },
  {
    ruleKey: 'sqli',
    severities: ['critical'],
    version: '1.0',
    developerGuide: {
      title: 'Parameterise the query',
      steps: [
        'Replace string concatenation with bound parameters or a query builder.',
        'Do the same for ORDER BY and column names: those need an allow-list, not a placeholder.',
        'Give the application database user only the privileges it needs.',
      ],
      notes: [
        'Escaping quotes by hand is not a fix: numeric contexts and second-order queries still break it.',
      ],
    },
    sysadminGuide: {
      title: 'Contain the exposure now',
      steps: [
        'Rotate database credentials that may have been reachable through the endpoint.',
        'Enable query logging and look for the injected parameter in recent requests.',
        'Restrict the database user to the application schema and remove DDL rights.',
      ],
    },
    businessGuide: {
      title: 'What this means for the business',
      steps: [
        'SQL injection can read, modify or delete the whole database, including customer records.',
        'It is the finding that most often turns into a reportable data breach.',
      ],
    },
    codeFixes: [
      {
        language: 'typescript',
        label: 'Parameterised query',
        code: "// The driver sends the value separately from the statement.\nconst rows = await client.query('SELECT id, email FROM users WHERE id = $1', [userId]);",
      },
      {
        language: 'typescript',
        label: 'Drizzle query builder',
        code: "const rows = await db.select().from(users).where(eq(users.id, userId));",
      },
    ],
  },
  {
    ruleKey: 'open_redirect',
    severities: ['medium'],
    version: '1.0',
    developerGuide: {
      title: 'Stop redirecting to caller-supplied hosts',
      steps: [
        'Accept only a path, never an absolute URL, in the redirect parameter.',
        'Reject protocol-relative values such as //evil.example.',
        'If external destinations are a real feature, keep an allow-list and match the full origin.',
      ],
    },
    sysadminGuide: {
      title: 'Review the redirect surface',
      steps: [
        'Search the proxy and application logs for redirect parameters pointing at unknown hosts.',
        'Check whether the same parameter is used in OAuth or password-reset flows.',
      ],
    },
    businessGuide: {
      title: 'What this means for the business',
      steps: [
        'A trusted link that lands on an attacker page is a highly credible phishing vector.',
        'It can also leak one-time tokens when the redirect carries them.',
      ],
    },
    codeFixes: [
      {
        language: 'typescript',
        label: 'Allow only local paths',
        code: "function safeRedirect(target: string | null): string {\n  if (target && target.startsWith('/') && !target.startsWith('//')) {\n    return target;\n  }\n  return '/';\n}",
      },
    ],
  },
  {
    ruleKey: 'cors',
    severities: ['high', 'medium', 'low'],
    version: '1.0',
    developerGuide: {
      title: 'Replace the wildcard with an explicit origin list',
      steps: [
        'Reflect only origins that appear in an allow-list you control.',
        'Never combine Access-Control-Allow-Credentials with a reflected or wildcard origin.',
        'Add Vary: Origin so caches do not serve one origin response to another.',
      ],
      notes: [
        'CORS is not authorisation: the server still has to check the session on every request.',
      ],
    },
    sysadminGuide: {
      title: 'Fix it at the edge or in the app, not in the browser',
      steps: [
        'Locate the component adding Access-Control-Allow-Origin and make it the single owner.',
        'Remove duplicate CORS headers from both the proxy and the framework.',
      ],
    },
    businessGuide: {
      title: 'What this means for the business',
      steps: [
        'A permissive CORS policy lets any website read data your users are allowed to see.',
        'The credentials combination is the dangerous one: it reads authenticated responses.',
      ],
    },
    codeFixes: [
      {
        language: 'typescript',
        label: 'Express: explicit origin list',
        code: "import cors from 'cors';\n\napp.use(\n  cors({\n    origin: ['https://app.example.com'],\n    credentials: true,\n  }),\n);",
      },
    ],
  },
  {
    ruleKey: 'directory_listing',
    severities: ['medium'],
    version: '1.0',
    developerGuide: {
      title: 'Disable automatic directory indexes',
      steps: [
        'Turn autoindex off in the web server configuration.',
        'Serve uploaded files through an application route that checks authorisation.',
        'Keep the document root free of backups, dumps and source archives.',
      ],
    },
    sysadminGuide: {
      title: 'Close the index and audit what is inside',
      steps: [
        'Disable autoindex globally and per virtual host.',
        'List the files that were exposed and treat any secret found as compromised.',
      ],
    },
    businessGuide: {
      title: 'What this means for the business',
      steps: [
        'A directory index publishes the file names a site never intended to show.',
        'Backups and exports found this way are a common route to a full data leak.',
      ],
    },
    codeFixes: [
      {
        language: 'nginx',
        label: 'Nginx: no automatic index',
        code: "autoindex off;\n\nlocation /uploads/ {\n  deny all;\n}",
      },
    ],
  },
  {
    ruleKey: 'sensitive_files',
    severities: ['critical', 'high'],
    version: '1.0',
    developerGuide: {
      title: 'Remove the file from the document root',
      steps: [
        'Move .env, .git and database dumps outside the served directory.',
        'Block dotfiles and common backup extensions in the web server.',
        'Rotate every secret the exposed file contained.',
      ],
      notes: [
        'Deleting the file is not enough if it was public: assume the credential was copied.',
      ],
    },
    sysadminGuide: {
      title: 'Contain the exposure',
      steps: [
        'Take the file offline and confirm with a fresh request that it returns 404.',
        'Rotate database passwords, API keys and signing secrets it listed.',
        'Review access logs for requests to the same path before you noticed it.',
      ],
    },
    businessGuide: {
      title: 'What this means for the business',
      steps: [
        'An exposed .env or .git directory can hand over database credentials and source code.',
        'Treat it as a security incident with notification obligations until proven otherwise.',
      ],
    },
    codeFixes: [
      {
        language: 'nginx',
        label: 'Nginx: deny dotfiles and dumps',
        code: "location ~ /\\.(env|git) {\n  deny all;\n  return 404;\n}\n\nlocation ~* \\.(sql|bak|old|zip)$ {\n  deny all;\n  return 404;\n}",
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
