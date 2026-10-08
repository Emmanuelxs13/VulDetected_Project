import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getAuth } from '@/lib/auth';

/**
 * Server-side session reader.
 *
 * ## ONE AUTHORITY, NOT TWO
 *
 * A `useSession()` hook on the client and `getSession()` on the server can
 * disagree, and the client one will be the stale one. So protected UI gates on
 * THIS function, called during the server render, and never on the hook's cached
 * result. The hook is for reacting to a change after hydration, not for deciding
 * whether to render protected content at all.
 *
 * ## WHY `cache()`
 *
 * `cache()` dedupes within a single render pass. Without it, a layout and a page
 * that both ask "who is this?" would run two argon2-free-but-still-DB session
 * queries per request. The value lives only for the request, which is exactly the
 * lifetime wanted — a session must be re-read on every navigation, never pinned.
 *
 * `headers()` is what makes this request-scoped in the first place: it reads the
 * cookie from the current request, and is why this function cannot be called at
 * module scope.
 *
 * ## WHY `headers()` IS CALLED FIRST, AND THAT ORDER IS LOAD-BEARING
 *
 * The obvious one-liner is `getAuth().api.getSession({ headers: await headers() })`.
 * It is wrong. JavaScript evaluates a call's callee before its arguments, so
 * `getAuth()` runs FIRST — which runs `getEnv()` FIRST — which throws on a
 * machine with no environment. That happens during `next build`, while
 * prerendering `/_not-found`, and the build dies with a "missing DATABASE_URL"
 * error that has nothing to do with the code that actually reads it.
 *
 * Reading `headers()` into a variable first is not a style preference. It is the
 * only thing that makes Next bail out of static generation and mark the route
 * dynamic, because `headers()` is the dynamic-API signal. Touch it before
 * anything that might validate configuration, and the render becomes
 * request-scoped by construction.
 */
export const getServerSession = cache(async () => {
  const requestHeaders = await headers();

  return getAuth().api.getSession({
    headers: requestHeaders,
  });
});

/**
 * The session's user id, or `null`. The only shape most callers need.
 *
 * Note the shape: `getSession` returns `{ session, user }`, not a flattened row.
 * `session.user` is the user; `session.session` holds the token and the expiry.
 * Both are needed at different call sites, so neither is flattened away here.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession();
  return session?.user?.id ?? null;
}

/** Requires a session. Redirects to the login page when there is none. */
export async function requireUser() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    // `redirect()` throws a control-flow signal, so execution does not continue
    // past it. TypeScript cannot see that, which is why the return below still
    // has to narrow `session` explicitly.
    redirect('/login');
  }

  return { session, userId: session.user.id };
}
