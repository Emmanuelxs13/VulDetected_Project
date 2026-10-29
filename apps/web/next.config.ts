import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

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
  serverExternalPackages: ['@node-rs/argon2', 'postgres', 'pino'],

  /**
   * `standalone` is what the production image ships: Next traces the modules the
   * server actually imports and emits a self-contained `server.js` with its own
   * `node_modules`. Without it the image would have to carry the whole workspace
   * `node_modules` (hundreds of MB of dev dependencies) or reinstall at boot.
   *
   * The traced tree is exercised locally by starting the emitted server and
   * calling `/api/health` and `/api/ready`; that is the same artifact the
   * Dockerfile copies, so a missing file shows up here and not in production.
   */
  output: 'standalone',

  /**
   * `messages/*.json` are loaded through a template literal
   * (`import(`../../messages/${locale}.json`)` in `src/i18n/request.ts`), which
   * the bundler cannot follow statically. Without this entry the standalone
   * trace leaves both catalogues behind and the image starts fine but renders
   * every page without translations — a failure that only shows up on the first
   * request, in the language fallback, with no stack trace.
   *
   * The pattern is asserted by starting the emitted server and reading a
   * translated page; see `docs/deployment.md`.
   */
  outputFileTracingIncludes: {
    '/**': ['./messages/**/*.json', './node_modules/next/dist/server/lib/cpu-profile*.js'],
  },



  experimental: {
    optimizePackageImports: ['framer-motion', 'sonner', 'vaul', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', '@radix-ui/react-accordion'],
  },

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

/**
 * `next-intl` resolves the request config (`src/i18n/request.ts`) through this
 * plugin. Without it the app compiles, but a production build fails while
 * prerendering with "Couldn't find next-intl config file". The default path is
 * used, so no argument is passed.
 */
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(config);
