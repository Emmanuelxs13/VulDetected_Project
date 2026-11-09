/**
 * Demo-mode switches.
 *
 * ## Why this module reads `process.env` directly
 *
 * `lib/env.ts` is the single source of truth for environment validity, and it
 * is the only module that should normally parse `process.env`. This module is a
 * deliberate, narrow exception for one reason: `lib/ssrf.ts` is imported by
 * unit tests that never build a full environment, so it must not pull in the
 * validated-env module (which is `server-only` and requires `DATABASE_URL`).
 *
 * The variables read here are already validated by `lib/env.ts` wherever the
 * application boots, including the production refusal for
 * `DEMO_ALLOW_PRIVATE_TARGETS`. This module only answers the boolean question
 * "is the demo profile active?" from a place both the server and its tests can
 * import.
 *
 * ## Why the production check is repeated
 *
 * Defence in depth. `lib/env.ts` refuses to boot in production with the flag
 * enabled; repeating the check here means a future refactor that skips env
 * validation still cannot silently disable the SSRF guard in production.
 */

/** True only outside production, and only when explicitly enabled. */
export function demoAllowsPrivateTargets(): boolean {
  return (
    process.env.NODE_ENV !== 'production' && process.env.DEMO_ALLOW_PRIVATE_TARGETS === 'true'
  );
}

/**
 * True when a scan target must prove domain ownership (HU-03).
 *
 * Defaults to `true`: the Sprint 1 specification makes ownership a prerequisite
 * of scanning. `SCAN_REQUIRE_VERIFIED_DOMAIN=false` restores the pre-Sprint-1
 * passive behaviour and is refused in production by `lib/env.ts`.
 */
export function scanRequiresVerifiedDomain(): boolean {
  return process.env.SCAN_REQUIRE_VERIFIED_DOMAIN !== 'false';
}

/**
 * Origins to try when fetching the ownership proof file.
 *
 * Production (and the default profile) tries HTTPS on the standard port only.
 * The demo profile additionally tries plain HTTP, and a configurable port, so a
 * fixture site served on `127.0.0.1:8099` can serve its own proof file without
 * a TLS certificate. Order matters: the strict origin is always first, so a
 * real deployment never falls back to HTTP.
 */
export function ownershipProofOrigins(hostname: string): string[] {
  const origins = [`https://${hostname}`];
  if (!demoAllowsPrivateTargets()) {
    return origins;
  }
  origins.push(`http://${hostname}`);
  const port = process.env.DEMO_TARGET_PORT;
  if (port !== undefined && port !== '') {
    origins.push(`http://${hostname}:${port}`);
  }
  return origins;
}
