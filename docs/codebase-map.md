# Codebase map

Where everything lives, what may import what, and where the next sprints land.
Read this after [`roadmap.md`](./roadmap.md) and before
[`architecture.md`](./architecture.md) — the roadmap says what is being built,
this file says where the code goes, and the architecture file explains how the
deployables talk to each other.

## Repository layout

```
VulDetected_Project            pnpm + Turborepo monorepo (ADR 0001)
├─ apps/web                    Next.js App Router — the entire product backend
│  └─ src
│     ├─ app/                  routes ONLY: page/layout/loading/error + route handlers
│     ├─ features/<domain>/    business slices: auth today, scans / sites next
│     ├─ components/           app-shell components shared across routes
│     ├─ lib/                  server infrastructure: auth, db, env, audit, password
│     ├─ types/                ambient type declarations (.d.ts)
│     └─ middleware.ts         (planned, Sprint 2) coarse filter — never authorization
├─ packages/ui                 presentational design system (ADR 0003): tokens,
│                              primitives, cn/contrast utilities. No logic, no data.
├─ packages/db                 data layer (ADR 0004): Drizzle schema, provider-neutral
│                              client, migrations. No app code.
├─ infra/                      Docker Compose dev stack (Redis reserved for Sprint 2 worker)
├─ docs/                       roadmap, codebase-map, architecture, ADRs, runbooks, changelog
└─ services/scanner            (Sprint 2) Python + Celery worker — isolated, Docker-only
```

Key principle: **`apps/web` owns the product rules, `packages/db` owns the data,
`packages/ui` owns the pixels.** A file's home is decided by the layer it may
talk to, not by its size or by convenience.

## Dependency rules (what may import what)

| Directory                 | May import                                                             | Must NOT import                              |
| ------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| `apps/web/src/app`        | features, components, lib, types, `@vuldetected/ui`, `@vuldetected/db` | — (nothing imports routes)                   |
| `apps/web/src/features/*` | lib, `@vuldetected/db`, `@vuldetected/ui`, `./../enums`                | `app/*`, other features' internals           |
| `apps/web/src/lib`        | `@vuldetected/db`, Next server APIs                                    | `features/*`, client components, `app`       |
| `apps/web/src/components` | `@vuldetected/ui`                                                      | `features/*`, `lib` (keep it presentational) |
| `packages/ui`             | its own `src/lib` (cn, contrast) only                                  | any app code, `@vuldetected/db`              |
| `packages/db`             | `drizzle-orm`, `postgres`, its own schema                              | any app or ui code                           |

Rules that are structural, not stylistic:

- **Routes are thin.** `app/` files select components and call actions; business
  logic lives in `features/` and server actions. A `page.tsx` with a database
  query is a smell.
- **Features are private.** One feature never reaches into another feature's
  internals. Shared business logic that stops fitting one feature moves to `lib/`
  or, when more than one runtime needs it, to a package under `packages/`.
- **`lib/` never renders.** It contains no components; `components/` never
  queries data. The two directions of the classic Next.js tangle.

## The server/client wall (`server-only`)

Anything that touches credentials, the database, the filesystem, or Better Auth
must live behind `import 'server-only';` — the compiler then refuses to bundle
it into a client component. Guarded today:

- `apps/web/src/lib/env.ts`, `lib/db.ts`, `lib/audit.ts`, `lib/password.ts`,
  `lib/auth.ts`
- `apps/web/src/features/auth/sign-in.ts`, `lockout.ts`, `request.ts`

New server modules MUST start with that import. The one explicit exception is
`lib/auth-client.ts`, which exists to serve the client.

## What goes where — the decision table

| You are about to…                         | It goes in                                                           |
| ----------------------------------------- | -------------------------------------------------------------------- |
| add a route or a shell boundary           | `apps/web/src/app/<path>/`                                           |
| add a mutation or a read with rules       | a server action in `features/<domain>/actions.ts`                    |
| add business logic used by one feature    | that feature's folder                                                |
| add business logic shared across features | `apps/web/src/lib/`                                                  |
| add a UI primitive or a token             | `packages/ui/src/` (+ tokens in `styles/tokens.css`)                 |
| add a table, column, or query             | `packages/db/src/schema/` + migrations via drizzle-kit `db:generate` |
| add an environment variable               | `.env.example` + the `lib/env.ts` contract                           |
| record a structural decision              | a new ADR in `docs/adr/`, then update the index                      |
| document a verified procedure             | a runbook under `docs/`                                              |

## Extension seams — where Sprints 2–3 land

The repo is deliberately at Sprint 1 size. The seams that absorb growth, in order:

1. **Second web feature slice**: `features/scans/`, `features/sites/` — same
   shape as `features/auth/` (actions + schema + components), no new patterns.
2. **Scanner runtime**: `services/scanner` (Python + Celery, Docker-only). It is
   a separate trust domain — see architecture TB4/TB5; it never holds business
   rules or database credentials.
3. **Shared domain models**: when the worker and the web app must agree on a
   `findings` / severity shape (Sprint 3), that contract moves to a
   `packages/` library consumed by both. Created when the need is real — never
   as an empty placeholder.
4. **Scan tables**: `scans`, `scan_events`, `domain_ownership` live in
   `packages/db/src/schema/` with `audit_logs`-grade append-only care.

## Never committed

`node_modules/`, `.next/`, `.turbo/`, `.codegraph/`, `packages/*/dist/`,
`.env*` (only `.env.example` is tracked), and `*.log`. Tool state (`.codegraph`,
`.turbo`) is machine-local; project configuration (`.atl/`) is tracked on
purpose — see `.gitignore` for the two deliberate exceptions.
