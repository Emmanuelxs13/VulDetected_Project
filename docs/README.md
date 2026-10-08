# Documentation

Everything written about VulDetected lives here. This is the index; each file
below is a single source of truth for one topic, and each says so at the top.

## Read in this order

**New to the project?**

1. [`roadmap.md`](./roadmap.md) — what is being built, in what order, and what
   "done" means for each sprint.
2. [`codebase-map.md`](./codebase-map.md) — the repo layout, the import rules,
   and where the next sprints land.
3. [`architecture.md`](./architecture.md) — the three deployables, the request and
   scan flows, and the trust boundaries.
4. [`database.md`](./database.md) — the schema and the DDL decisions.

**Coming to make a change?**

5. [`adr/`](./adr/) — why the system is shaped this way. Read the relevant ADR
   before proposing an alternative.
6. [`security.md`](./security.md) — the non-negotiables, with status.
7. [`decisions-pending.md`](./decisions-pending.md) — what is already known to be
   undecided, so you do not solve it twice.

## Index

| File                                                       | What it is                                                                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`roadmap.md`](./roadmap.md)                               | **The authoritative plan.** Sprint table with deliverables and exit criteria, deferred decisions, status legend.                                     |
| [`codebase-map.md`](./codebase-map.md)                     | **Repo layout and import rules.** What goes where, the `server-only` wall, the decision table, and the extension seams for Sprints 2–3.              |
| [`architecture.md`](./architecture.md)                     | System overview: deployables, register/login flow, planned scan flow, trust boundaries, ASCII diagram.                                               |
| [`database.md`](./database.md)                             | Schema reference: every table, column, index, and DDL decision — plus the **DB touch points requiring owner sign-off**.                              |
| [`local-postgres-setup.md`](./local-postgres-setup.md)     | **Sprint 1 verification runbook (in use).** Local PostgreSQL 18 via pgAdmin 4: role, database, migrations, verification queries, 15-step smoke test. |
| [`supabase-setup.md`](./supabase-setup.md)                 | Supabase alternative (not executed): project setup, pooler selection, migrations, smoke test.                                                        |
| [`security.md`](./security.md)                             | Threat model. The six non-negotiable controls, each with `Open (planned Sprint N)` or `Done`.                                                        |
| [`decisions-pending.md`](./decisions-pending.md)           | Open product and technical questions awaiting the owner.                                                                                             |
| [`changelog.md`](./changelog.md)                           | Keep a Changelog format. The running record of what actually changed.                                                                                |
| [`adr/README.md`](./adr/README.md)                         | Architecture Decision Records — index and format rules.                                                                                              |
| [`adr/0001`](./adr/0001-monorepo-and-runtime-split.md)     | pnpm + Turborepo; Next.js is the only TS backend; Python exists solely to drive Nuclei/ZAP.                                                          |
| [`adr/0002`](./adr/0002-authentication.md)                 | Better Auth + Drizzle, argon2id, hashed session tokens, `HttpOnly` + `SameSite=Lax`.                                                                 |
| [`adr/0003`](./adr/0003-design-tokens-and-color-budget.md) | Semantic tokens in Tailwind v4 `@theme`, the color budget, and never color-only.                                                                     |
| [`adr/0004`](./adr/0004-database-provider-neutrality.md)   | No hardcoded hostnames, no sockets, no extra extensions — all through `DATABASE_URL`.                                                                |
| [`adr/0005`](./adr/0005-deferred-multi-tenancy.md)         | No `organization_id` in Sprint 1, with the reconsideration trigger.                                                                                  |
| [`../infra/README.md`](../infra/README.md)                 | The Docker Compose dev stack: how to run it and why Postgres runs in Docker.                                                                         |
| [`../README.md`](../README.md)                             | The main project README — what it is, how to run it, and what state it is in.                                                                        |

## Two documents that override the others

- **Scope:** if two files disagree about what will be built,
  [`roadmap.md`](./roadmap.md) wins.
- **Architecture:** if two files disagree about why the system is shaped this
  way, the relevant [ADR](./adr/) wins.

Everything else is commentary.

## Conventions used in these documents

- Written in **English**, matching the codebase.
- Status is always explicit. "Planned" is a real state, not a synonym for
  "forgotten".
- No feature is described unless it is planned somewhere. An idea without a
  roadmap entry does not go in the docs — it goes in
  [`decisions-pending.md`](./decisions-pending.md).
- Mermaid and ASCII diagrams only where they clarify something prose cannot.
