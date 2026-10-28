/**
 * Next.js instrumentation hook — the one place a server error reaches the log.
 *
 * ## WHY THIS EXISTS AT ALL
 *
 * `app/error.tsx` catches errors inside a route segment, but it is a Client
 * Component: it can only write to the *browser* console. An error thrown in a
 * Server Component, a route handler or the middleware never reaches the
 * operator's log in a shape a collector can read — Next prints its own
 * unstructured line, or nothing at all. `onRequestError` is the framework-level
 * hook that fires for every one of them, on the server, with the route attached.
 *
 * ## WHY THE LOGGER IS IMPORTED LAZILY
 *
 * `instrumentation.ts` runs in BOTH the Node.js and the Edge runtime. `pino` and
 * `server-only` cannot be bundled for Edge, and the middleware — which is the
 * most likely place for an early error — runs there. A static import would break
 * the Edge build; the `NEXT_RUNTIME` guard plus a dynamic import keeps the Edge
 * copy of this file free of Node-only modules.
 *
 * ## WHY THIS IS THE SEAM FOR AN ERROR TRACKER
 *
 * Reporting to a hosted tracker (Sentry, Bugsnag) belongs here and nowhere else:
 * one hook receives every server error with its route, its digest and the
 * request. Adding a DSN later is a change to this file, not a change to every
 * route. Until a DSN exists, the structured log line IS the report — see
 * `docs/deployment.md` for the alerting rule that reads it.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  try {
    const { getLogger } = await import('./lib/logger');
    // A single line at boot: it proves the logger and its stdout sink are wired in
    // the deployed artifact, which is the thing that cannot be checked from a
    // health probe.
    getLogger('boot').info(
      { node: process.version, env: process.env.NODE_ENV },
      'server started',
    );
  } catch (err) {
    console.error('[instrumentation] boot log failed', err);
  }
}

interface RequestInfo {
  path: string;
  method: string;
}

interface RequestContext {
  routerKind: string;
  routePath: string;
  routeType: string;
}

/**
 * Reports an unhandled error from a Server Component, route handler or
 * middleware.
 *
 * `digest` is Next's correlation id: it is what a user sees on the error page
 * ("Reference: …"), and it is the only way to connect that screenshot to the line
 * this function writes.
 */
export async function onRequestError(
  error: unknown,
  request: RequestInfo,
  context: RequestContext,
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    // Edge has no pino. The platform's own log still carries the throw; this
    // hook deliberately stays silent rather than shipping a second sink.
    return;
  }

  try {
    const { getLogger } = await import('./lib/logger');
    const digest =
      typeof error === 'object' && error !== null && 'digest' in error
        ? String((error as { digest?: unknown }).digest)
        : undefined;

    getLogger('request').error(
      {
        err: error,
        digest,
        path: request.path,
        method: request.method,
        routePath: context.routePath,
        routeType: context.routeType,
        routerKind: context.routerKind,
      },
      'unhandled request error',
    );
  } catch (err) {
    console.error('[instrumentation] request error log failed', err);
  }
}
