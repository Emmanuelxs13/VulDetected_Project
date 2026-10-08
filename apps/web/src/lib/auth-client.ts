import { createAuthClient } from 'better-auth/react';

/**
 * Browser-side Better Auth client.
 *
 * Only usable in Client Components — importing this into a server component
 * pulls `better-auth/react` into the server bundle for nothing.
 *
 * No base URL is passed. The client infers the origin from the page, which is the
 * only correct choice: a hardcoded `baseURL` baked at build time points at
 * whatever host the build happened on, so a preview deployment would authenticate
 * against production cookies.
 *
 * `fetchOptions.credentials: 'include'` is explicit because the session cookie is
 * `HttpOnly` — JavaScript cannot read it, so the browser must be told to attach
 * it, and any cross-origin deployment (a proxy on another port, in development)
 * would otherwise silently send no cookie and look like a login bug.
 */
export const authClient = createAuthClient({
  fetchOptions: {
    credentials: 'include',
  },
});

/**
 * Type-safe session accessor.
 *
 * `authClient.useSession` is the reactive hook for Client Components. The
 * dashboard is a Server Component and reads the session through
 * `auth.api.getSession({ headers })` instead, which is the authoritative check:
 * a client-side hook result is a cached copy and must not gate a protected
 * render on its own.
 */
export const { signIn, signUp, signOut, useSession } = authClient;
