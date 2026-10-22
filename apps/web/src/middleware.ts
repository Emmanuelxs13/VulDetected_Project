import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cheap, edge-safe gate for the authenticated area.
 *
 * ## WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
 *
 * This middleware answers exactly one question: *does the request carry a
 * session cookie at all?* If it does not, there is no plausible way the request
 * is authenticated, so it is redirected to `/login` with the intended
 * destination preserved.
 *
 * It does NOT validate the session. It cannot: this runs on the Edge runtime,
 * where there is no Postgres connection, and the real session check
 * (`getServerSession`) belongs to `better-auth`, which queries the database.
 * A forged cookie with the right *name* sails straight through here.
 *
 * That is intentional, and it is why the pages keep their own
 * `getServerSession()` check. This is a usability and surface-reduction layer,
 * not the authorization boundary:
 *
 *   - before: `/dashboard` answered `200 OK` with an empty state to anyone
 *     probing it, and every new protected page had to remember to check the
 *     session itself. One forgotten check = a silently public page.
 *   - after: an unauthenticated visitor is sent to the login form like every
 *     other web app, and "is this route protected?" is answered in ONE place.
 *
 * The page-level session check remains the authority. Removing it because
 * "the middleware handles it" would turn a forged cookie into a breach.
 *
 * ## WHY `/api` IS EXCLUDED, AND THIS IS LOAD-BEARING
 *
 * The scan worker authenticates with a Bearer secret, not a session cookie. Its
 * two endpoints — `/api/scans/{id}/callback` (terminal result) and
 * `/api/scans/{id}/events` (progress POST) — are called by a Python process that
 * holds no cookie and, by design, never will.
 *
 * If this middleware touched `/api`, an unauthenticated worker request would be
 * answered with a `307` to an HTML login page instead of reaching the handler.
 * The worker's `send_event` ignores anything below `500`, so the failure would
 * be *silent*: scans would simply stop reporting progress, with nothing in the
 * logs to explain it. Excluding `/api` is not tidiness; it is what keeps the
 * pipeline correct.
 *
 * `/login` and `/register` are excluded too, or the redirect would loop.
 */
/**
 * Paths that require a session cookie.
 *
 * Listed explicitly rather than inverted from a public allowlist: a new protected
 * area must be added here on purpose, which is the moment someone has to decide
 * whether it is protected at all.
 *
 * `/dev` is here because `/dev/sprint-1` renders live session internals (user
 * id, email, account status, expiry timestamps) and the open security findings.
 * It answered `200 OK` to anonymous visitors, which is a diagnostics surface an
 * attacker can read for free. Gating it keeps "is this route protected?" in one
 * place instead of a silent exception to the rule above.
 */
const PROTECTED_PREFIXES = ['/dashboard', '/scans', '/dev'];

/**
 * The cookie `better-auth` sets for a signed-in session.
 *
 * Presence is checked, never trust: the value is opaque here and the real
 * verification happens server-side against the database.
 */
function hasSessionCookie(req: NextRequest) {
  // `better-auth` prefixes its cookies with `__Secure-` in production (HTTPS).
  // Both spellings are checked so a local HTTP run and a deployed HTTPS run
  // behave the same.
  return Boolean(
    req.cookies.get('better-auth.session_token') ??
    req.cookies.get('__Secure-better-auth.session_token'),
  );
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) {
    return NextResponse.next();
  }

  if (hasSessionCookie(req)) {
    return NextResponse.next();
  }

  /*
   * `next` carries the full intended destination (path AND query) so the login
   * form can send the visitor back to what they asked for. A bare path would
   * lose a cursor or filter in the query string.
   */
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  /*
   * Run on page requests only.
   *
   *  - `api`     excluded so the worker's Bearer-authenticated calls are never
   *              turned into an HTML redirect (see the header note above).
   *  - `_next/static`, `_next/image` excluded because they are build assets; a
   *              matcher that caught them would serve the login page for a
   *              stylesheet.
   *  - `favicon.ico`, `robots.txt`, `sitemap.xml` excluded because they are
   *              public by definition.
   *  - `login`, `register` excluded so the redirect cannot loop.
   *
   * The negative lookahead is hoisted into one expression rather than several
   * `matcher` entries so the exclusion list is impossible to half-apply.
   */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|login|register).*)',
  ],
};
