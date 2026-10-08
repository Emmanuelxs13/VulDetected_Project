# ADR 0004: Database provider neutrality

- **Status:** Accepted
- **Date:** Sprint 1

## Context

The owner has not chosen between a **local Postgres** (Docker, already composed
in `infra/docker-compose.dev.yml`) and **Supabase**. That decision is not
blocking Sprint 1, and it must not become blocking later.

The failure mode this ADR exists to prevent is specific and common: a codebase
accumulates provider assumptions until switching providers costs a rewrite.
Those assumptions are almost always invisible in review because each one is
individually reasonable:

- a connection string built in code from `PGHOST`,
- a `unix_socket` path or a `postgres` service hostname in a DSN,
- `pg_trgm` for a search feature,
- an `auth.uid()` call from the Supabase client inside business logic,
- migrations that only work because Supabase pre-enabled an extension.

Each is defensible in isolation. Collectively they are a lock-in nobody chose.

## Decision

The data layer is **provider-neutral**. Three hard rules.

### 1. No hardcoded hostnames

No `postgres`, `db`, `127.0.0.1`, `localhost`, or any service name appears in
application or migration code. The connection target comes from `DATABASE_URL`,
full stop. Compose service names are an infra detail and must not leak into the
data layer.

### 2. No local unix socket paths

Connection goes through TCP/TLS to the URL's host. Unix socket paths
(`/var/run/postgresql`, `/tmp/.s.PGSQL.5432`) are machine-specific and do not
translate to a managed provider.

### 3. No Postgres extensions beyond `citext` and `gen_random_uuid()`

Both are core Postgres or first-party, present on every managed provider
including Supabase, and available without superuser privileges.

- **`citext`** — case-insensitive text for email addresses. Case-insensitive
  lookup for login is a security property, not a cosmetic one.
- **`gen_random_uuid()`** — primary key defaults without an extension. Available
  natively since Postgres 13.

Explicitly **not** used: `pg_trgm` (fuzzy search — needs `pg_trgm` on the
provider, and native search would have to be rebuilt differently anyway),
`uuid-ossp`, PostGIS, `vector`, and anything requiring superuser. If a feature
truly needs an extension, that becomes an ADR plus an owner decision, not an
incidental `CREATE EXTENSION` in a migration.

### 4. Everything goes through `DATABASE_URL`

Connection pooling, TLS, and credentials are all encoded in the URL. Migrations
are applied through drizzle-kit against that same URL — never against a separate
admin URL, socket, or hardcoded target.

### Consequences of the rules

- **Switching between local Postgres and Supabase is a single `DATABASE_URL`
  edit.** No code change, no compose change, no migration rewrite.
- **Supabase's connection pooler** works, because it is addressed purely through
  the URL. Provider features such as Row Level Security are _available_ but not
  _assumed_ — using them means going through `DATABASE_URL` like anything else.
- **Migrations are portable**, so a provider swap cannot produce a
  migration-only outage.
- **The cost is real:** no fuzzy search without an extension, and search must be
  implemented with portable SQL (`ILIKE`, trigram-free approaches, or a future
  external search service). That is a genuine functional cost, accepted
  deliberately.
- **Connection lifecycle is our responsibility.** Provider-neutral means we
  manage pooling explicitly and cannot assume the provider's pooler exists.
- **A provider swap is untested until it is tested.** Neutrality is a structural
  guarantee, not proof of compatibility. The cutover plan — including a restore of
  `pg_dump` output and a verification pass — is an owner decision recorded in
  [decisions-pending.md](../decisions-pending.md#supabase-vs-local-postgres).

## What still needs an owner decision

Neutrality answers _how the data layer connects_, not _which provider to use_.
Still open, and deliberately not decided here:

- backup and retention policy,
- connection pooling topology (Supabase transaction pooler vs direct connection),
- Row Level Security posture, if RLS is used as a second authorization layer,
- whether the free tier tolerates Sprint 2's scan volume,
- cost at production traffic.

Those need real usage data and pricing knowledge, not architectural speculation.

## Consequences

**Accepted benefits**

- Provider choice is reversible at the cost of one environment variable.
- The data layer is portable and testable: the same code runs against a throwaway
  local container in CI and a managed database in production.
- No hidden privileged-extension dependency that fails on day one with Supabase.

**Accepted costs**

- Some Postgres-specific functionality is off the table without discussion
  (fuzzy search, PostGIS, native vector search).
- Discipline is required at review time: one hardcoded hostname in a DSN undoes
  this entirely, and it looks like a harmless line.
- Slightly more abstraction in the connection factory than a single-URL
  hardcode would need. The factory exists precisely so the rule is enforceable in
  one place.

## Alternatives considered

### Choose Supabase now and optimize for it

Rejected. It converts an open decision into a lock-in during Sprint 1, while the
schema has not yet survived the two schema-heavy sprints ahead. The cost of being
wrong (rewriting auth storage, migrations, and the connection layer) is far
higher than the cost of waiting for real data.

### Choose local Postgres only

Rejected. Same objection in reverse: it presumes a hosting answer that a
two-person-stage MVP does not need to make yet, and it would bake in a
`compose`-only assumption.

### Abstract behind an ORM with its own portable dialect

Rejected as unnecessary indirection. Drizzle is already SQL-shaped and explicit,
which is what makes the neutrality rules reviewable. An additional abstraction
layer would add a place to hide rule violations rather than removing one.

### Use an in-process or embedded database (SQLite, PGlite)

Rejected. Concurrent scan writes, real constraint enforcement, and a genuine
"would this work on Postgres" signal all argue against an embedded engine while
the schema is still moving.
