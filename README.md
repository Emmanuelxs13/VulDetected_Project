# VulDetected

![Sprint 1 — in progress](https://img.shields.io/badge/status-Sprint%201%20%E2%80%94%20in%20progress-4c8cff)
![Stack](https://img.shields.io/badge/stack-TypeScript%20%C2%B7%20Python%20%C2%B7%20PostgreSQL-3178c6)
![Docs](https://img.shields.io/badge/docs-see%20%60docs%2F%60-informational)

**Current status:** Sprint 1 — in progress. See
[the roadmap](docs/roadmap.md) for what each sprint delivers and what "done"
means.

---

## What VulDetected is

You point VulDetected at a web application you own. It runs a real security scan,
finds the problems, and — this is the part that matters — **tells you how to fix
them, with the actual code you need to write.**

Most security tools produce a list of scary acronyms that only a security
engineer can translate into action. A finding says "SQL injection in
`/api/search`". VulDetected says: here is the vulnerable line, here is the
parameterized query that replaces it, here is the change for the developer, the
configuration change for the sysadmin, and the business risk in plain language for
the person who signs off the budget.

## Who it is for

| Audience            | What they get                                                                      |
| ------------------- | ---------------------------------------------------------------------------------- |
| **Developers**      | The vulnerable code path, a concrete fix, and copyable code.                       |
| **Sysadmins**       | What is exposed at the infrastructure level and the config change that closes it.  |
| **Business owners** | What it means in risk and cost terms, without needing a developer to interpret it. |

## The six non-negotiable security principles

These are not aspirations. Each is tracked with an explicit status in
[docs/security.md](docs/security.md).

1. **Domain ownership verification before any scan.** Proving you own a domain is a
   legal requirement, not a setting. No scan is ever queued without it.
2. **SSRF defense.** Scan targets are attacker-influenced input, so DNS is resolved
   and checked, private/loopback/link-local ranges are rejected, every redirect is
   re-validated, and ports are restricted.
3. **Worker isolation.** The scanner runs with filtered egress, a read-only
   filesystem, dropped capabilities, and no database credentials.
4. **Session tokens are stored as digests — _not yet achieved_.** Session tokens are
   currently stored in the clear, because Better Auth `1.7.7` derives the cookie
   from the hashed value it returns from the insert. The compensating controls are in
   place (7-day absolute expiry, `HttpOnly`/`SameSite=Lax`/`Secure`, immediate
   revocation, account-state gating), but this principle is **unmet**, and it is
   listed here rather than quietly marked done. Tracked as an open finding in
   [docs/security.md](docs/security.md#4-session-security) and
   [ADR 0002](docs/adr/0002-authentication.md).
5. **No secrets in git.** `.env` files are ignored; only `.env.example` is tracked;
   secrets are generated, never authored.
6. **Rate limiting.** Enforced server-side on auth and on scan submission.

---

## Stack

| Layer         | Technology                               | Why                                                                                                                                                                             |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces + Turborepo              | One repo, incremental builds, one task runner across TS packages.                                                                                                               |
| Web + backend | Next.js App Router (TypeScript)          | One runtime owns auth, authorization, business rules, and data access. No duplicated session validation or CORS.                                                                |
| UI system     | Tailwind v4 (CSS-first `@theme`) + Radix | Semantic tokens defined once; accessible, unstyled primitives. See [ADR 0003](docs/adr/0003-design-tokens-and-color-budget.md).                                                 |
| Database      | PostgreSQL 16 + Drizzle ORM              | Real constraints and transactions; a thin, reviewable query layer instead of a hidden abstraction.                                                                              |
| Auth          | Better Auth + argon2id                   | Maintained session lifecycle, memory-hard password hashing via prebuilt `@node-rs/argon2` binaries — no `node-gyp` on Windows. See [ADR 0002](docs/adr/0002-authentication.md). |
| Scan worker   | Python + Celery + Nuclei + OWASP ZAP     | Python is where the scanner tooling is; Celery gives a real queue for long-running work.                                                                                        |
| Queue         | Redis                                    | Celery broker and result backend.                                                                                                                                               |
| Email (dev)   | Mailpit                                  | Dev mail stays on the machine — nothing leaves localhost.                                                                                                                       |
| Local infra   | Docker Compose                           | Postgres, Mailpit, and Redis run in containers, so setup is identical everywhere. See [infra/README.md](infra/README.md).                                                       |

Full reasoning for each choice is in [docs/adr/](docs/adr/).

## Repository layout

```
vuldetected/
├─ apps/
│  └─ web/                        Next.js app — the entire product backend  (Sprint 1, in progress)
├─ packages/
│  ├─ db/                         Drizzle schema, migrations, connection factory  (Sprint 1)
│  ├─ ui/                         Tailwind v4 theme tokens and UI primitives  (Sprint 1)
│  └─ config/                     Shared tsconfig / eslint / prettier presets  (Sprint 1)
├─ services/
│  └─ scanner/                    Python + Celery worker running Nuclei and ZAP  (Sprint 2, not yet created)
├─ infra/
│  ├─ docker-compose.dev.yml      Postgres + Mailpit + Redis for local development
│  └─ README.md                   How to run the local stack, and why Postgres is in Docker
├─ docs/
│  ├─ README.md                   Documentation index
│  ├─ roadmap.md                  The authoritative plan: sprints, exit criteria, deferred decisions
│  ├─ architecture.md             Deployables, request and scan flows, trust boundaries
│  ├─ database.md                 Schema reference and DB touch points needing owner sign-off
│  ├─ security.md                 Threat model with an explicit status per control
│  ├─ decisions-pending.md        Open questions awaiting the owner
│  ├─ changelog.md                Keep a Changelog record of what actually changed
│  └─ adr/
│     ├─ README.md                ADR index and format rules
│     ├─ 0001-monorepo-and-runtime-split.md
│     ├─ 0002-authentication.md
│     ├─ 0003-design-tokens-and-color-budget.md
│     ├─ 0004-database-provider-neutrality.md
│     └─ 0005-deferred-multi-tenancy.md
├─ .atl/                          Tracked project configuration (do not remove)
├─ package.json                   Workspace root scripts
├─ pnpm-workspace.yaml            Workspace globs: apps/*, packages/*
├─ turbo.json                     Turborepo task graph and build outputs
├─ .env.example                   Every environment variable, documented — the single source of truth
├─ .prettierrc.json               Formatting rules shared by every package
├─ .editorconfig                  Encoding, line endings, indentation
├─ .nvmrc                         Node 22
└─ README.md                      This file
```

Directories under `apps/`, `packages/`, and `services/` arrive with the next
Sprint 1 commits. Everything else listed here exists today.

---

## Quick start

### What works today

Verified by running each command in this repository, not by intention:

| Command                             | Status              | Notes                                                                                                             |
| ----------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                      | ✅ works            | Workspace links resolve.                                                                                          |
| `pnpm typecheck`                    | ✅ works            | 3/3 packages clean via Turborepo.                                                                                 |
| `pnpm build`                        | ✅ works            | Next.js production build succeeds — **with no `.env` present**, which is a deliberate property, see below.        |
| `pnpm format` / `pnpm format:check` | ✅ works            | Prettier clean across the repo.                                                                                   |
| `pnpm lint`                         | ⚠️ no-op            | **No linter is configured.** An orphaned `eslint` script in `packages/ui` was removed because it could only fail. |
| `docker compose ... up -d`          | ✅ works            | Postgres, Mailpit, Redis on localhost.                                                                            |
| Running the app (`pnpm dev`)        | ⚠️ needs a database | Requires `.env` **and** the migrations applied. Neither has been done — see below.                                |
| Registering / logging in            | ❌ unverified       | Written and type-checked, but never exercised against a real database. See the warning below.                     |
| Scanning a target                   | ❌ not yet          | Sprint 2+. No worker, no queue, no findings.                                                                      |

#### The build succeeding without `.env` is intentional

`next build` completes on a machine with **no environment file and no database**.
That is a design requirement, not luck: `getEnv()`, `getDb()`, and `getAuth()` are
all lazy and memoised, and `getServerSession()` calls `headers()` _before_ touching
configuration. A build that requires secrets would mean the app cannot be compiled
or verified in CI without provisioning a database first.

Two ordering rules make this work, and both were learned by breaking them — see
[ADR 0002](docs/adr/0002-authentication.md):

- `headers()` must be called before `getAuth()`. A call written as
  `getAuth().api.getSession({ headers: await headers() })` evaluates the callee
  first, so env validation runs during prerender and the build fails with a
  misleading "missing `DATABASE_URL`".
- `features/auth/actions.ts` must start with `'use server'`. Without it, a client
  component importing the action pulls `next/headers` into the client bundle.
  `tsc` reports nothing; only the build fails.

#### What has NOT been verified, and this matters

**No code has ever run against a database.** Per the Sprint 1 constraint, no
container was started and **no migration was executed**. So the following are
authored and type-checked but unproven at runtime:

- the generated SQL in `packages/db/drizzle/`, including the `citext` extension and
  the append-only trigger;
- the Drizzle ↔ Better Auth schema mapping in both directions;
- argon2id hashing at the configured cost;
- every register / login / logout path, including the enumeration and lockout
  behaviour.

Treat the auth flow as **unproven until it has been run against Postgres once**. The
reasoning in the code is deliberate and, where checkable, verified against the
installed Better Auth source — but reading a library's source is not running it.

### Prerequisites

- **Node.js 22** or newer — see [`.nvmrc`](.nvmrc). Version is pinned there for a reason.
- **pnpm 10.25.0** — the version is pinned in `package.json` via `packageManager`.
  With Corepack enabled: `corepack enable && corepack prepare pnpm@10.25.0 --activate`
- **Docker** with Compose v2+.
- A `git` client. There are **no commits in this repository yet**.

### Setup

```powershell
# 1. Install dependencies (works once workspace packages exist)
pnpm install

# 2. Create your local environment file and fill in AUTH_SECRET
Copy-Item .env.example .env
# Generate a secret with:  openssl rand -base64 32

# 3. Start the local infrastructure (works today)
docker compose -f infra/docker-compose.dev.yml up -d
docker compose -f infra/docker-compose.dev.yml ps

# 4. Run the app in development mode
pnpm dev
```

Web UI: <http://localhost:3000> · Mailpit inbox: <http://localhost:8025>

### Stopping

```powershell
docker compose -f infra/docker-compose.dev.yml down      # stop containers, keep data
docker compose -f infra/docker-compose.dev.yml down -v   # stop and delete the volumes
```

### Migrations

**No migration has been run.** The schema is documented in
[docs/database.md](docs/database.md), and any migration touching the tables listed
there requires **owner sign-off before it is authored**. Migrations are applied
with drizzle-kit against `DATABASE_URL`.

---

## Documentation

| Document                                               | What it gives you                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [docs/roadmap.md](docs/roadmap.md)                     | The authoritative plan: sprints, deliverables, exit criteria, what is deferred.           |
| [docs/architecture.md](docs/architecture.md)           | The three deployables, request and scan flows, trust boundaries, diagram.                 |
| [docs/database.md](docs/database.md)                   | Every table and column, the DDL decisions, and the DB touch points needing your decision. |
| [docs/security.md](docs/security.md)                   | Threat model. Six non-negotiables, each with a status.                                    |
| [docs/decisions-pending.md](docs/decisions-pending.md) | Open questions waiting on you.                                                            |
| [docs/changelog.md](docs/changelog.md)                 | The running record of what changed.                                                       |
| [docs/adr/](docs/adr/)                                 | Architecture Decision Records — why the system is shaped this way.                        |
| [infra/README.md](infra/README.md)                     | The local Docker stack.                                                                   |

Two rules keep this from rotting: **scope** lives in
[docs/roadmap.md](docs/roadmap.md), and **architecture** lives in
[docs/adr/](docs/adr/). If another document disagrees with one of those, those
win.

---

## Open decisions

Four questions are waiting on the owner and are listed in full in
[docs/decisions-pending.md](docs/decisions-pending.md):

1. **Spanish or English UI copy** — the code and docs are English by contract;
   the product UI language is not decided.
2. **Email verification before first login** — required, or allow with limits?
3. **Free-tier scan quota for the MVP** — depends on real scan cost from Sprint 2.
4. **Retention period for scan results** — cheaper to design into the Sprint 2
   tables than to retrofit.

The database hosting question is **resolved**: local PostgreSQL 18 via pgAdmin 4,
documented in
[docs/local-postgres-setup.md](docs/local-postgres-setup.md).

Multi-tenancy and billing are deliberately deferred to Sprint 4+ — see
[ADR 0005](docs/adr/0005-deferred-multi-tenancy.md).

---

## Contributing

- **Conventional commits.** `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`, `build:`, `ci:`. A type of `refactor:`, `perf:`, or `feat!:` for
  breaking changes.
- **English for everything technical.** Code, identifiers, comments, documentation,
  commit messages, and UI copy are written in English. Repository artifacts are
  technical artifacts; they are not written in the conversation language.
- **No AI attribution in commits.** No `Co-Authored-By` trailers, no AI-generated
  lines in commit messages, and no tool-name footers.
- **Format before committing.** `pnpm check` runs lint, typecheck, and
  `format:check`. Formatting is enforced by Prettier; do not hand-tune whitespace.
- **One decision per commit.** A commit that changes behaviour and refactors
  unrelated code cannot be reviewed.
- **Schema changes need an owner.** Read
  [docs/database.md](docs/database.md#db-touch-points--owner-decision-required)
  first, and get sign-off before writing the migration.
- **New architectural decisions get an ADR.** Copy the six-section format from
  [docs/adr/README.md](docs/adr/README.md).
- **Secrets never enter the repository.** Add the variable to `.env.example`,
  generate the value locally, and leave `.env` untracked.

---

## License

Not yet specified. All rights reserved until the owner chooses a license.
