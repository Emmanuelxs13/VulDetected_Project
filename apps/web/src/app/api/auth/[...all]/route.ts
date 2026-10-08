import { toNextJsHandler } from 'better-auth/next-js';

import { getAuth } from '@/lib/auth';

/**
 * Better Auth's catch-all endpoint.
 *
 * ## WHY THE INSTANCE IS BUILT PER REQUEST
 *
 * `toNextJsHandler` is given a **handler function**, not an instance — the
 * installed signature accepts either `{ handler }` or
 * `(request: Request) => Promise<Response>`:
 *
 * ```ts
 * export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
 * ```
 *
 * Passing `getAuth()` directly would construct the instance at module-evaluation
 * time, which `next build` does while collecting page data — so the build would
 * need a populated `.env` and a reachable database. `getAuth()` memoises
 * internally, so the indirection still yields one instance per process at runtime.
 * See `lib/auth.ts`.
 *
 * ## WHY THIS ROUTE IS SERVER-ONLY
 *
 * This is the ONLY place the Better Auth HTTP surface is exposed. Every endpoint
 * — sign-up, sign-in, session revocation, verification — is served from here, so
 * adding another auth path somewhere else is how an app ends up with two
 * different auth behaviours. The Client Components talk to this one route via
 * `auth-client.ts`.
 *
 * `dynamic` is forced because this handler reads cookies. Without it Next may
 * attempt to statically optimise the route, which is both wrong and would fail at
 * build time with an opaque error about `cookies()`.
 */
export const dynamic = 'force-dynamic';

export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
