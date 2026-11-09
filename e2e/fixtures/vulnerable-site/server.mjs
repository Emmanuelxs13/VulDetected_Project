/**
 * Vulnerable fixture site for the Sprint 1 demo (HU-04 .. HU-07 evidence).
 *
 * ## Why this exists
 *
 * The demo must prove that a real scan produces real findings. Scanning a public
 * site would make the demo depend on the internet, on DNS, and on a third party
 * being vulnerable that day. This fixture is a deliberately insecure app served
 * from `127.0.0.1:8099` behind the public hostname `miapp.localtest.me`
 * (`localtest.me` resolves to 127.0.0.1), so the scanner performs genuine HTTP
 * requests and the checks fire for real — nothing here fakes a finding.
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

/** A tiny "database error" the SQLi check recognises (see ERROR_SIGNATURES). */
const SQL_ERROR =
  "You have an error in your SQL syntax; check the manual that corresponds to " +
  'your MySQL server version for the right syntax to use near "\'" at line 1';

/** Files that must never be public; each returns a matching signature. */
const SENSITIVE_FILES = new Map([
  ['/.env', ['text/plain', 'APP_ENV=production\nDB_PASSWORD=super-secret\nAPI_KEY=sk_live_fixture\n']],
  ['/.git/config', ['text/plain', '[core]\n\trepositoryformatversion = 0\n\tbare = false\n']],
  ['/.git/HEAD', ['text/plain', 'ref: refs/heads/main\n']],
  ['/backup.sql', ['text/plain', 'CREATE TABLE users (id int, email varchar(255));\nINSERT INTO users VALUES (1, \'admin@example.com\');\n']],
  ['/web.config', ['text/plain', '<?xml version="1.0"?>\n<configuration>\n  <system.web />\n</configuration>\n']],
  ['/phpinfo.php', ['text/plain', 'PHP Version 8.1.2\nSystem: Linux fixture 6.1\n']],
]);

/** Paths that serve an automatic directory index. */
const LISTED_DIRS = new Set(['/uploads/', '/files/', '/static/', '/backup/', '/assets/']);

/** Query parameters whose mere presence triggers an external redirect. */
const REDIRECT_PARAMS = ['redirect', 'redirect_uri', 'redirect_url', 'next', 'url', 'return'];

/** Query parameters reflected into the HTML response without encoding. */
const REFLECTED_PARAMS = ['q', 's', 'search', 'query', 'keyword', 'term', 'name'];

function readToken() {
  try {
    return readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return '';
  }
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

function send(res, status, contentType, body, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': contentType, ...extraHeaders });
  res.end(body);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? HOST}`);
  const path = url.pathname;

  // Ownership proof file (HU-03). Served dynamically from token.txt.
  if (path === '/.well-known/vuldetected.txt') {
    const token = readToken();
    if (token === '') {
      return send(res, 404, 'text/plain; charset=utf-8', 'no token published');
    }
    return send(res, 200, 'text/plain; charset=utf-8', token + '\n');
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
  const sqlError = allValues.some((value) => value.includes("'")) ? SQL_ERROR : '';

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
  console.log(`[fixture] public hostname: http://miapp.localtest.me:${PORT}`);
});
