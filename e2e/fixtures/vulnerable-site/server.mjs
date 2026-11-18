/**
 * Vulnerable fixture site for the VulDetected demo (Sprint 1 and Sprint 2).
 *
 * ## Why this exists
 *
 * The demo must prove that a real scan produces real findings. Scanning a public
 * site would make the demo depend on the internet, on DNS, and on a third party
 * being vulnerable that day. This fixture is a deliberately insecure app served
 * from `127.0.0.1:8099` behind the public hostname `127-0-0-1.nip.io`
 * (`nip.io` resolves `<ip-with-dashes>` back to that IP), so the scanner performs
 * genuine HTTP requests and the checks fire for real — nothing here fakes a
 * finding.
 *
 * ## What it is vulnerable to (one per built-in check)
 *
 *   - security_headers : sends none of the six required headers
 *   - tls              : plain HTTP, no HTTPS
 *   - cookies          : sets a session cookie with no Secure/HttpOnly/SameSite
 *   - xss              : reflects `q`/`s`/`search` into HTML without encoding
 *   - sqli             : a single quote in any value produces a DB error page
 *   - open_redirect    : `redirect`/`next`/... return a 302 to any external URL
 *   - cors             : reflects any Origin with credentials enabled
 *   - directory_listing: `/uploads/` serves an automatic index
 *   - sensitive_files  : `/.env`, `/.git/config`, `/backup.sql`, ... are readable
 *
 * ## Demo controls (`/__demo/*`)
 *
 * The Sprint 2 demo needs the fixture to CHANGE while the presenter watches:
 * a vulnerability that appears between two scans is what makes a "new
 * vulnerability" alert meaningful, and a slow response is what makes a scan long
 * enough to cancel. Both are runtime toggles, not restarts, because restarting
 * the target mid-demo is a way to lose the audience.
 *
 *   - `POST /__demo/sqli/on`   and `/off`   — SQL injection active or not
 *   - `POST /__demo/slow/on`   and `/off`   — delay every response (default 0 ms)
 *   - `POST /__demo/slow/ms?value=1500`     — set the delay explicitly
 *   - `GET  /__demo/state`                  — current toggles as JSON
 *
 * SQL injection starts ENABLED so the Sprint 1 scan keeps finding it. The
 * Sprint 2 flow turns it off, scans a baseline, turns it on and scans again.
 *
 * ## Login-protected route (HU-04, CA-25 a CA-27)
 *
 * `/login` renders a real form; `POST /login` with the fixture credentials sets a
 * session cookie and redirects to `/private`. `/private` returns 401 without that
 * cookie. This is the target for authenticated scanning: the worker has to log
 * in with the credentials the user stored, and only then can it see `/private`.
 *
 *   demo@miapp.local / Fixture-Pass-2026!
 *
 * ## Ownership proof
 *
 * `GET /.well-known/vuldetected.txt` returns the current contents of
 * `token.txt`, read on every request. The demo writes the token the web app
 * issues there (see `scripts/demo/write-token.mjs`), so the same proof file a
 * real deployment would serve is exercised end to end.
 *
 * ## Deliberately not hardened
 *
 * This is a target, not product code. It binds to loopback only and is never
 * deployed. Do not copy any pattern from this file into the application.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(HERE, 'token.txt');
const PORT = Number(process.env.PORT ?? 8099);
const HOST = process.env.HOST ?? '127.0.0.1';

/** Fixture credentials for the login-protected route (documented, not secret). */
const LOGIN_EMAIL = 'demo@miapp.local';
const LOGIN_PASSWORD = 'Fixture-Pass-2026!';
const SESSION_COOKIE = 'fixture_auth';
const SESSION_VALUE = 'fixture-authenticated-session';

/** A tiny "database error" the SQLi check recognises (see ERROR_SIGNATURES). */
const SQL_ERROR =
  "You have an error in your SQL syntax; check the manual that corresponds to " +
  'your MySQL server version for the right syntax to use near "\'" at line 1';

/** Files that must never be public; each returns a matching signature. */
const SENSITIVE_FILES = new Map([
  ['/.env', ['text/plain', 'APP_ENV=production\nDB_PASSWORD=super-secret\nAPI_KEY=sk_live_fixture\n']],
  ['/.git/config', ['text/plain', '[core]\n\trepositoryformatversion = 0\n\tbare = false\n']],
  ['/.git/HEAD', ['text/plain', 'ref: refs/heads/main\n']],
  [
    '/backup.sql',
    [
      'text/plain',
      "CREATE TABLE users (id int, email varchar(255));\nINSERT INTO users VALUES (1, 'admin@example.com');\n",
    ],
  ],
  [
    '/web.config',
    ['text/plain', '<?xml version="1.0"?>\n<configuration>\n  <system.web />\n</configuration>\n'],
  ],
  ['/phpinfo.php', ['text/plain', 'PHP Version 8.1.2\nSystem: Linux fixture 6.1\n']],
]);

/** Paths that serve an automatic directory index. */
const LISTED_DIRS = new Set(['/uploads/', '/files/', '/static/', '/backup/', '/assets/']);

/** Query parameters whose mere presence triggers an external redirect. */
const REDIRECT_PARAMS = ['redirect', 'redirect_uri', 'redirect_url', 'next', 'url', 'return'];

/** Query parameters reflected into the HTML response without encoding. */
const REFLECTED_PARAMS = ['q', 's', 'search', 'query', 'keyword', 'term', 'name'];

/**
 * Runtime demo toggles.
 *
 * In memory on purpose: the fixture is a demo target, and a toggle that survives
 * a restart is a toggle that surprises the next run.
 */
const state = {
  sqliEnabled: true,
  slowMs: 0,
};

function readToken() {
  try {
    return readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64_000) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(''));
  });
}

function parseCookies(req) {
  const header = req.headers.cookie ?? '';
  const cookies = new Map();
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return cookies;
}

/** Escapes nothing on purpose: the reflected XSS is the point of the fixture. */
function htmlPage(query, reflected, sqlError) {
  const reflections = reflected
    .map(([name, value]) => `<p>Results for <b>${name}</b>: ${value}</p>`)
    .join('\n');
  const error = sqlError ? `<pre class="error">${sqlError}</pre>` : '';
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>MiApp — fixture</title></head>
  <body>
    <h1>MiApp vulnerable fixture</h1>
    <form action="/" method="get"><input name="q" placeholder="Search"> <button>Go</button></form>
    ${reflections}
    ${error}
    <p>Query: ${query}</p>
  </body>
</html>`;
}

function loginPage(error = '') {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>MiApp — sign in</title></head>
  <body>
    <h1>Sign in</h1>
    ${error ? `<p class="error">${error}</p>` : ''}
    <form action="/login" method="post">
      <label>Email <input name="email" type="email" required></label>
      <label>Password <input name="password" type="password" required></label>
      <button type="submit">Sign in</button>
    </form>
  </body>
</html>`;
}

function privatePage(email, reflected = '') {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>MiApp — private</title></head>
  <body>
    <h1>Private area</h1>
    <p>Signed in as ${email}.</p>
    <p>Invoice 2026-001 — internal only.</p>
    <form action="/private" method="get"><input name="q" placeholder="Search invoices"> <button>Go</button></form>
    ${reflected ? `<p>Results: ${reflected}</p>` : ''}
  </body>
</html>`;
}

function send(res, status, contentType, body, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': contentType, ...extraHeaders });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? HOST}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // ── Demo controls ────────────────────────────────────────────────────────
  if (path === '/__demo/state') {
    return send(res, 200, 'application/json', JSON.stringify(state));
  }
  if (path === '/__demo/sqli/on' || path === '/__demo/sqli/off') {
    state.sqliEnabled = path.endsWith('/on');
    return send(res, 200, 'application/json', JSON.stringify(state));
  }
  if (path === '/__demo/slow/on' || path === '/__demo/slow/off') {
    state.slowMs = path.endsWith('/on') ? 1500 : 0;
    return send(res, 200, 'application/json', JSON.stringify(state));
  }
  if (path === '/__demo/slow/ms') {
    const value = Number(url.searchParams.get('value') ?? '0');
    state.slowMs = Number.isFinite(value) && value >= 0 ? Math.min(value, 10_000) : 0;
    return send(res, 200, 'application/json', JSON.stringify(state));
  }

  // The delay is applied to every non-control response, which is what makes a
  // scan long enough to cancel from the UI.
  if (state.slowMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, state.slowMs));
  }

  // ── Ownership proof file (HU-03) ─────────────────────────────────────────
  if (path === '/.well-known/vuldetected.txt') {
    const token = readToken();
    if (token === '') {
      return send(res, 404, 'text/plain; charset=utf-8', 'no token published');
    }
    return send(res, 200, 'text/plain; charset=utf-8', token + '\n');
  }

  // ── Login-protected area (HU-04) ─────────────────────────────────────────
  if (path === '/login' && method === 'GET') {
    return send(res, 200, 'text/html; charset=utf-8', loginPage());
  }
  if (path === '/login' && method === 'POST') {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const email = params.get('email') ?? '';
    const password = params.get('password') ?? '';
    if (email === LOGIN_EMAIL && password === LOGIN_PASSWORD) {
      return send(res, 302, 'text/plain; charset=utf-8', '', {
        location: '/private',
        'set-cookie': `${SESSION_COOKIE}=${SESSION_VALUE}; Path=/`,
      });
    }
    return send(res, 401, 'text/html; charset=utf-8', loginPage('Invalid credentials.'));
  }
  if (path === '/private') {
    const cookies = parseCookies(req);
    if (cookies.get(SESSION_COOKIE) !== SESSION_VALUE) {
      return send(res, 401, 'text/plain; charset=utf-8', 'authentication required');
    }
    // Reflected on purpose, and only for a signed-in visitor: this is the
    // finding that an anonymous scan cannot see (HU-04, CA-26). The `q` value
    // is echoed unencoded, exactly like the public page does.
    const reflected = url.searchParams.get('q') ?? '';
    return send(res, 200, 'text/html; charset=utf-8', privatePage(LOGIN_EMAIL, reflected));
  }

  const sensitive = SENSITIVE_FILES.get(path);
  if (sensitive) {
    return send(res, 200, sensitive[0] + '; charset=utf-8', sensitive[1]);
  }

  if (LISTED_DIRS.has(path)) {
    return send(
      res,
      200,
      'text/html; charset=utf-8',
      `<html><head><title>Index of ${path}</title></head><body><h1>Index of ${path}</h1>` +
        '<a href="report.pdf">report.pdf</a></body></html>',
    );
  }

  // Open redirect: any of the redirect params sends the browser elsewhere.
  for (const name of REDIRECT_PARAMS) {
    const target = url.searchParams.get(name);
    if (target) {
      return send(res, 302, 'text/plain; charset=utf-8', '', { location: target });
    }
  }

  // Everything else is the (insecure) home page.
  const origin = req.headers.origin;
  const extraHeaders = {
    // Cookie with none of the protective flags (cookies check).
    'set-cookie': 'session=fixture-session-id; Path=/',
  };
  // Permissive CORS: reflect any origin and allow credentials (cors check).
  if (origin) {
    extraHeaders['access-control-allow-origin'] = origin;
    extraHeaders['access-control-allow-credentials'] = 'true';
  }

  const reflected = REFLECTED_PARAMS.filter((name) => url.searchParams.has(name)).map((name) => [
    name,
    url.searchParams.get(name) ?? '',
  ]);

  const allValues = [...url.searchParams.values()];
  const sqlError =
    state.sqliEnabled && allValues.some((value) => value.includes("'")) ? SQL_ERROR : '';

  return send(
    res,
    200,
    'text/html; charset=utf-8',
    htmlPage(url.search, reflected, sqlError),
    extraHeaders,
  );
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[fixture] vulnerable site on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[fixture] public hostname: http://127-0-0-1.nip.io:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[fixture] login: ${LOGIN_EMAIL} / ${LOGIN_PASSWORD} -> /private`);
  // eslint-disable-next-line no-console
  console.log(
    `[fixture] toggles: /__demo/state, /__demo/sqli/{on,off}, /__demo/slow/{on,off}`,
  );
});
