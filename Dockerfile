# syntax=docker/dockerfile:1
#
# Production image for the web application.
#
# ## WHY THREE STAGES + A MIGRATOR
#
#   deps      resolves the pnpm workspace once, with the lockfile, so a source
#             change does not re-download dependencies.
#   build     runs `next build` and emits `.next/standalone`, the traced server
#             tree that carries only the modules the server actually imports.
#   migrator  reuses `build` because `drizzle-kit` is a dev dependency: the
#             migration runner must run *before* the app starts and must never be
#             part of the runtime image (a shell in production with a schema tool
#             is an unnecessary privilege).
#   runtime   copies the traced tree, drops to the unprivileged `node` user, and
#             runs `server.js`. No package manager, no source, no dev dependency.
#
# ## WHY THE PATHS LOOK FLAT
#
# `apps/web/next.config.ts` sets `outputFileTracingRoot` to `apps/web`, so
# `server.js` sits at the root of `standalone/` instead of under `apps/web/`.
# The static assets are NOT part of the trace (they are copied by the server from
# the filesystem) and must be copied explicitly.
#
# The exact tree this copies is exercised locally by starting
# `.next/standalone/server.js` and calling `/api/health`, `/api/ready` and a
# translated page; see `docs/deployment.md`.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Corepack reads `packageManager` from the workspace manifest, so the pnpm
# version is the one the repository pins, not a number copied into this file.
RUN corepack enable

# ---------------------------------------------------------------- deps ----
FROM base AS deps
WORKDIR /repo

# Only the manifests: this layer is cached until a dependency actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --------------------------------------------------------------- build ----
FROM deps AS build
WORKDIR /repo
COPY . .
RUN pnpm --filter @vuldetected/web build

# ------------------------------------------------------------ migrator ----
# One-shot: applies pending migrations, then asserts the result against the
# migration files. `drizzle-kit migrate` is idempotent (it records applied files
# in `drizzle.__drizzle_migrations`), so a redeploy with no new migration is a
# no-op — and `db:verify` is what turns "the command exited 0" into "the schema
# the app queries actually exists". `depends_on: service_completed_successfully`
# in the other services means a failed verification stops the whole stack
# instead of starting it against a half-migrated database.
FROM build AS migrator
WORKDIR /repo/packages/db
ENV NODE_ENV=production
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:verify"]

# ------------------------------------------------------------- runtime ----
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./.next/static
# The scheduler is a plain script that drives an authenticated endpoint; it has
# no imports, so it runs on the runtime image without a build step.
COPY --from=build --chown=node:node /repo/apps/web/scripts/run-scheduler.mjs ./scripts/run-scheduler.mjs

USER node
EXPOSE 3000

# `node` is the only HTTP client guaranteed to exist in this image, so the probe
# uses it instead of adding curl. It hits liveness, not readiness: a container
# whose database is down is still alive, and restarting it fixes nothing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
