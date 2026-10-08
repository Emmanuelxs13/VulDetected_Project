# ADR 0001: Monorepo and runtime split

- **Status:** Accepted
- **Date:** Sprint 1

## Context

VulDetected needs three very different kinds of machinery:

1. A web application — forms, dashboards, authentication, a real-time stream of
   scan progress.
2. A scan worker — long-running, CPU- and network-heavy, orchestrating external
   tools (Nuclei, OWASP ZAP) that are distributed as standalone binaries.
3. A relational database.

Two of these (1 and 2) want different things from a runtime:

- The web app benefits from server-side rendering, route handlers, cookie-based
  sessions, and a build step that produces a deployable artifact.
- The worker wants a long-lived process with a job queue, no HTTP surface, and
  whatever bindings make shelling out to scanners reliable.

A common instinct is to give the backend a NestJS service alongside Next.js, on
the theory that "backend deserves a real backend framework." That instinct costs
more than it returns at MVP scale, and this ADR explains why.

The repository also has to host a Python service, which means the tooling story
is not purely TypeScript.

## Decision

**1. Monorepo layout.** pnpm workspaces + Turborepo, with `apps/*` and
`packages/*` as the workspace globs.

```
apps/web                 Next.js App Router (web + product backend)
packages/db              Drizzle schema, migrations, connection factory
packages/ui              Tailwind v4 theme tokens and primitives
packages/config          Shared tsconfig/eslint/prettier presets
services/scanner         Python + Celery worker (built and run via Docker only)
infra/                   Docker Compose dev stack
docs/                    This documentation set
```

`services/scanner` is deliberately **not** a pnpm package. It is built and run
through Docker. Mixing a Python toolchain into the pnpm/Turbo task graph would
mean every `pnpm run` invocation negotiates with two ecosystems for zero benefit.

**2. Next.js App Router is the only product backend. No NestJS.** The Next.js
server owns auth, session validation, authorization, the database connection
pool, business rules, and the API surface that the browser talks to.

**3. The Python service exists for exactly one reason: to orchestrate Nuclei and
ZAP via Celery.** It is a scan executor with a job queue, not a second product
backend. It holds no business rules, no session validation, and no write access
to product data beyond scan results posted back through a narrow, authenticated
channel.

## Consequences

**Accepted costs**

- A long-running scan job cannot be hosted inside a serverless request handler.
  This is why the Python worker and a real job queue (Celery + Redis) are not
  optional — they are what makes long-running work survivable.
- Two runtimes means two dependency sets, two Dockerfiles, and two CI jobs. Turbo
  hides some of this; it does not eliminate it.
- The Python service cannot import TypeScript domain types directly. Types
  crossing the boundary are validated at runtime, not shared by the compiler.
  We accept the cost and pay it with schema validation, because compile-time
  coupling across a process boundary would be a lie anyway.

**Accepted benefits**

- One place where auth is enforced. Every authorization decision happens in one
  runtime, one framework, one language. There is no "which service validates the
  session?" question to get wrong.
- One set of secrets to manage for the product surface.
- One CORS story: the browser talks to one origin. Cross-origin complexity
  between `web` and `api` disappears entirely.
- One deployment artifact for the product backend, instead of two that must be
  version-compatible.
- TypeScript across the whole product surface means one type system, one lint
  setup, and shared types in `packages/`.

## Alternatives considered

### NestJS as a separate API service

Rejected. It would mean a second TS backend duplicating concerns that the
Next.js server already has to solve, and each duplication is a place for a
security control to be missed:

- **Auth/session validation implemented twice.** Two implementations drift. The
  one that drifts wrong is an auth bypass.
- **CORS configuration** between `web` and `api`, including credentialed
  requests, preflight caching, and origin allowlists.
- **Deployment coordination** — two services to version, roll back, and keep on
  compatible API versions.
- **Secrets** — a second environment to configure and a second place for a
  secret to leak from.
- **Body validation and error handling** duplicated in a second framework with
  different idioms.

For an MVP whose traffic is authenticated dashboard users, not a public API
consumed at scale, this is pure overhead. If a real, heavy public API later
justifies a separate service, this ADR is superseded — and the trigger is
recorded rather than assumed away.

### Micro-frontends / separate frontend repo

Rejected. There is one product surface. A split frontend repo buys organizational
independence the team does not need yet and pays in cross-repo coordination,
duplicated types, and inconsistent design tokens — which directly contradicts
ADR 0003's requirement that tokens be defined exactly once.

### Python backend instead of a Python worker

Rejected. Making the worker a full backend would drag business logic, session
handling, and authorization across a process boundary that exists solely to run
external scanners. Keeping the service narrow is what makes its isolation
requirements (filtered egress, read-only filesystem, no database credentials)
achievable — see [ADR 0004](./0004-database-provider-neutrality.md) and
[`docs/security.md`](../security.md).

### Go or Rust for the scanner worker

Not rejected on merit — viable and faster to run. Deferred: it adds a third
toolchain for a workload that is I/O-bound (network waits against slow targets),
not CPU-bound. Python plus Celery is the fastest path to a working scan loop,
and Celery is a mature, observable queue. Revisit if worker memory or cold-start
cost becomes a measured problem.
