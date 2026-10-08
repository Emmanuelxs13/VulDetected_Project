import type { NextConfig } from 'next';

const config: NextConfig = {
  /**
   * `packages/ui` is a **source-export** package: it ships `.ts`/`.tsx`, not a
   * build artifact. Node's ESM rules will not load TypeScript from
   * `node_modules`, and because pnpm symlinks workspace packages there, Next
   * needs to be told to transpile it explicitly.
   *
   * Without this the failure is a build error about an unparseable file rather
   * than anything mentioning `@vuldetected/ui`, which is why it is worth the
   * comment.
   */
  transpilePackages: ['@vuldetected/ui', '@vuldetected/db'],

  /**
   * `apps/web` is not the workspace root, so Next would otherwise guess a
   * tracing root one directory up and try to trace the entire monorepo into
   * `.next/standalone`. Pointing it at `apps/web` keeps standalone output scoped
   * to this deployable, which is the only one that ships.
   */
  outputFileTracingRoot: import.meta.dirname,

  /**
   * `betterAuth()` is invoked per request from a server component, and it reads
   * the route handlers it needs to mount at `/api/auth/[...all]`. Next must not
   * try to statically analyse that file at build time — hence `serverExternalPackages`
   * rather than an experimental flag whose only effect would be to silence a
   * build-time module read that should never happen.
   */
  serverExternalPackages: ['@node-rs/argon2', 'postgres'],

  reactStrictMode: true,

  /**
   * Baseline response headers.
   *
   * Next.js sends none of these by default. All four here are ones that cannot
   * plausibly break a correct application, which is the bar for adding a header
   * without a browser in front of you:
   *
   *  - `X-Content-Type-Options: nosniff` stops a browser from re-interpreting a
   *    response as a different content type. Free, and it closes MIME-confusion
   *    paths on anything served from this origin.
   *  - `Referrer-Policy: strict-origin-when-cross-origin` keeps full paths out of
   *    the `Referer` header on cross-origin requests. This app is on paths like
   *    `/login` and `/dashboard`, which are not sensitive in themselves, but the
   *    habit is what stops a future path from leaking one that is.
   *  - `X-Frame-Options: DENY` blocks clickjacking. The app has no reason to be
   *    framed.
   *  - `Permissions-Policy` disables browser APIs this product has no use for.
   *    `camera=()` and `microphone=()` are the ones worth naming: a vulnerability
   *    scanner or a future "scan by screenshot" feature should not be able to
   *    quietly reach for either.
   *
   * ## WHY THERE IS NO CSP HERE
   *
   * A Content-Security-Policy is the single highest-value header on this list and
   * it is deliberately absent. Shipping a guessed CSP is worse than shipping none:
   * Next injects inline bootstrap scripts and Tailwind sets inline styles, so a
   * policy written without measuring the real response either breaks the app or,
   * worse, gets "fixed" by adding `'unsafe-inline'` — which is not a policy, it is
   * the absence of one with extra steps.
   *
   * The correct sequence is to run in report-only mode, collect violations against
   * real traffic, and only then enforce. Tracked as an open finding in
   * `docs/security.md`; do not add `unsafe-inline` to make it pass.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default config;
