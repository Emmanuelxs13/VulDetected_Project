# `@vuldetected/db`

The VulDetected data layer: Drizzle schema, migrations, and the one connection
factory. Source-export package — **no build step**, like `packages/ui`.

Binding decision:
[ADR 0004 — database provider neutrality](../../docs/adr/0004-database-provider-neutrality.md).
If this package and ADR 0004 disagree, ADR 0004 wins.

---

## Migrations are authored, NOT executed

**No migration in this package has ever been run against a database. No container
has been started.** The SQL here is reviewable on its own; applying it is an
explicit, separate decision.

| Command                   | Connects to a DB? | What it does                                               |
| ------------------------- | ----------------- | ---------------------------------------------------------- |
| `pnpm db:generate`        | **No**            | Diffs the schema against the last snapshot and writes SQL. |
| `pnpm db:generate:custom` | **No**            | Creates an empty migration for hand-written SQL.           |
| `pnpm db:migrate`         | **Yes**           | Applies pending migrations. Requires `DATABASE_URL`.       |

`generate` opening no connection is not a convenience — it is what allows the
migration to be authored and reviewed while the provider decision (local
Postgres vs Supabase) is still open. See [docs/database.md](../../docs/database.md).

The `.env.example` in the repository root is the single source of truth for
variable names. Copy it to `.env` and fill in the blanks; never commit `.env`.

---

## Schema overview

Five tables. Four belong to Better Auth's contract; one is entirely ours.

| Table                 | Owner            | Purpose                                                                                                       |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `users`               | Better Auth + us | Identity. Plus `status`, `locale`, `failed_login_count`, `locked_until`, `deleted_at` via `additionalFields`. |
| `accounts`            | Better Auth      | **Credentials, including the password hash.** Required for email + password to work at all.                   |
| `sessions`            | Better Auth      | Server-authoritative sessions. `token` currently stores the **raw** token — see the warning below.            |
| `verification_tokens` | Better Auth      | Email verification and password reset. `purpose` is our nullable extension.                                   |
| `audit_logs`          | **VulDetected**  | Append-only security event log. `UPDATE`/`DELETE` are refused by trigger.                                     |

### Two things that will surprise you

**1. Passwords live in `accounts.password`, not in `users`.**

Better Auth stores credentials in a provider-keyed `account` row, so email +
password writes `(provider_id='credential', account_id=<user id>, password=<argon2id>)`.
The original `docs/database.md` design had `users.password_hash`, which cannot
represent "one user, N providers" — the shape Sprint 4's OAuth needs. The hash
is in the credential row so adding a provider is a data change, not a redesign.

**2. `sessions.token` stores the raw token. This is an open security finding.**

ADR 0002 and `docs/database.md` both promised a hashed token. Better Auth 1.7.7
makes that impossible without breaking login: the cookie value is taken from
whatever the `INSERT` returns (`internal-adapter.mjs` → `sign-in.mjs`), and the
stored value also flows back _into_ the adapter on session updates, so a hash
would be hashed twice. The full trace is in the `SECURITY` comment at the top of
[`src/schema/sessions.ts`](./src/schema/sessions.ts), and the item is tracked in
[`docs/security.md`](../../docs/security.md) §4.

Do not "fix" that column without reading the trace first.

---

## Pointing at a provider

Everything goes through `DATABASE_URL`. There is no admin URL, no socket path,
and no service hostname anywhere in this package.

```dotenv
# Local Docker Postgres (infra/docker-compose.dev.yml)
DATABASE_URL=postgresql://vuldetected:vuldetected@localhost:5432/vuldetected?schema=public

# Supabase — same code, different string
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require
```

Switching is one environment variable. Three rules make that true, and all three
are checkable with `grep`:

1. **No hardcoded hostnames.** `postgres`, `db`, `localhost`, and `127.0.0.1` must
   not appear here. They belong in the compose file and in `DATABASE_URL`.
2. **No unix socket paths.** Machine-specific, meaningless to a managed provider.
3. **No extensions beyond `citext`.** Plus `gen_random_uuid()`, which is core
   Postgres since 13 and therefore needs nothing at all.

### Why the pool is small and `prepare: false`

`createDb()` defaults to `max: 5` and sets `prepare: false` deliberately:

- **Small pool** — each connection is a real Postgres backend; managed providers
  cap and bill for them. The cost of too small is latency. The cost of too large
  is an outage. Latency is the cheaper mistake.
- **`prepare: false`** — required for a transaction-mode pooler (PgBouncer, which
  Supabase hands out by default). With prepared statements enabled, a statement is
  bound to one backend and the next pooled connection fails with _"prepared
  statement does not exist"_. It costs a re-parse per query and buys provider
  neutrality, which is worth more.

Override with `createDb(url, { max: n })` if the provider's ceiling differs.

---

## Usage

```ts
import { getDb, users, eq } from '@vuldetected/db';

// Lazy: DATABASE_URL is read on first query, not at import time.
// This is what lets `next build` succeed without a running database.
const db = getDb();

const user = await db.query.users.findFirst({
  where: eq(users.email, 'someone@example.com'),
});
```

`createDb(url)` is available when you want an explicit handle — tests, scripts,
one-off tooling. Application code uses `getDb()`.

The barrel re-exports the query operators (`eq`, `and`, `inArray`, `desc`, …) so
call sites do not need a direct `drizzle-orm` dependency just to annotate a
query.
