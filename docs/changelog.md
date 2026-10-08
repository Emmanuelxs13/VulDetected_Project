# Changelog

All notable changes to VulDetected are recorded here. This is the running record
of what changed — the roadmap says what _will_ happen; this file says what _did_.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
starting at `0.1.0`.

## [Unreleased]

Sprint 1 foundation — **complete and verified end-to-end** against the local
PostgreSQL 18.3 server. The first commit lands with this milestone.

The application is connected to a real database and the full auth surface has
been exercised: the 15-step smoke test in
[`local-postgres-setup.md`](./local-postgres-setup.md) passes 17/17 against a
running server, and the enumeration-oracle and progressive-lockout behaviours
were additionally confirmed by hand. The runbook records this as executed
through §5.

### Changed

- **Database migrations executed for the first time.** All three files applied in
  order against the local `vuldetected` database: `0000` (citext), `0001` (five
  tables, foreign keys, twelve indexes), `0002` (append-only trigger on
  `audit_logs`). Verified by querying `information_schema` for the tables and
  `udt_name` on `users.email`, `pg_trigger` for `audit_logs_append_only`, and by
  attempting an `UPDATE` against `audit_logs` and confirming it was refused.
  The runbook records this as executed through §5.
- **Documentation corrections found while verifying the schema.** The expected enum
  values in `docs/database.md`, `docs/changelog.md` and the runbook disagreed with
  the generated SQL: `account_status` is `pending`/`active`/`suspended`/`deleted`
  (not `pending_verification`), and `token_purpose` is `verify_email`/
  `reset_password`/`domain_ownership` (not `email_verification`/`password_reset`).
  A checklist that names values the database does not contain sends the reader
  looking for a failure that is not there, so the SQL won again.
- **`docs/database.md` gained the missing `accounts` section.** The table holding
  the argon2id hash was the only one in the schema without column-by-column
  documentation — precisely the one most likely to be misread as belonging in
  `users`.

- **Database hosting decision reversed: local PostgreSQL 18 via pgAdmin 4, not
  Supabase.** Sprint 1 is verified against the PostgreSQL 18.3 server already
  running on the development machine (port 5432, service `postgresql-x64-18`).
  Nothing in the code changes — ADR 0004 keeps every database access behind
  `DATABASE_URL`, so this is a connection string, not a migration. Supabase stays
  documented as the alternative path for when a managed provider is wanted.
  The pooler analysis (`Session` 5432 over `transaction` 6543) still applies if
  Supabase is adopted later; a local server has no pooler at all.
  See [`docs/local-postgres-setup.md`](./local-postgres-setup.md).
- `docs/decisions-pending.md` corrected two stale schema references:
  `users.email_verified_at` is actually the boolean `users.email_verified`, and
  `account_status` defaults to `active`, not `pending` (email
  verification is disabled in Sprint 1, so no transition path exists yet).

### Changed (continued)

- **Sprint 1 verified end-to-end against PostgreSQL 18.3.** The five-table schema
  in a real database, tables owned by the least-privilege `vuldetected` role in
  pgAdmin (ownership moved off the `postgres` superuser, runbook §4b), and the
  auth flow proven over HTTP: register, session cookie (`HttpOnly`, `SameSite=Lax`,
  `Path=/`), login, identical `Invalid email or password` for unknown email and
  wrong password, dashboard session gate, and sign-out — smoke test 17/17.
- **`features/auth` split into four cohesive modules.** `actions.ts` (616 lines,
  six responsibilities) is now `actions.ts` (only the three server actions),
  `lockout.ts` (progressive ladder state machine), `request.ts` (headers/IP), and
  `sign-in.ts` (credential wrapper + timing decoy). Pure move, byte-verified
  against a backup by an independent verifier — no logic changed.
- **Lint was a no-op; now it is real.** The repo had no ESLint anywhere, so
  `pnpm lint` ran zero tasks and `pnpm check` validated nothing on that leg.
  Added ESLint 9 flat config via `FlatCompat` bridging `eslint-config-next`
  (`next/core-web-vitals` + `next/typescript`; the 15.x line has no flat entry).
  All 30 lintable files were already clean; `lint` is
  `eslint . --max-warnings=0` in `apps/web`.
- **Server/client wall enforced with `server-only`.** `lib/env.ts`, `lib/db.ts`,
  `lib/audit.ts`, `lib/password.ts`, `lib/auth.ts`, and the three auth helper
  modules now start with `import 'server-only';` so a client bundle can no longer
  accidentally import credentials or database access. Verified by `next build`.

### Added

- `docs/local-postgres-setup.md` — **Sprint 1 verification runbook (in use).**
  Environment inventory of what is actually installed on the machine (server
  version, listening ports, `citext` trust, missing `psql` on PATH, which is how
  an earlier check wrongly concluded Postgres was absent), login role and database
  creation through pgAdmin 4 with a SQL alternative, the three migration files run
  in order with the reasoning for that order, schema verification queries, an
  append-only proof for `audit_logs`, the application `.env.local`, the 15-step
  smoke test — with the enumeration-oracle and lockout tests called out as the
  acceptance criteria — teardown, troubleshooting, and an explicit list of what it
  does **not** prove.
- `docs/supabase-setup.md` — Sprint 1 verification runbook (alternative path):
  project creation, connection-string selection with the pooler comparison table,
  password URL encoding, migrations, schema verification queries, an append-only
  proof for `audit_logs`, a 15-step manual smoke test covering the two
  enumeration-oracle tests that matter, teardown, a troubleshooting table, and an
  explicit list of what the runbook does **not** prove. Marked as superseded.
- `docs/codebase-map.md` — repo layout, the import rules (who may import whom),
  the `server-only` wall, the "what goes where" decision table, and the
  extension seams where Sprints 2–3 land. Indexed from `docs/README.md` and
  cross-linked from `docs/architecture.md`.

**Monorepo skeleton**

- Root `package.json` (private, `vuldetected`) with `dev`, `build`, `lint`,
  `typecheck`, `format`, `format:check`, and `check` scripts, pinned to
  `pnpm@10.25.0` and Node `>=22`.
- `pnpm-workspace.yaml` covering `apps/*` and `packages/*`. The Python service at
  `services/scanner` is deliberately excluded — it is built and run through Docker
  only.
- `turbo.json` with `build`, `dev`, `lint`, and `typecheck` tasks. `build` and
  `typecheck` depend on `^build`; outputs are `dist/**` and `.next/**` excluding
  `.next/cache/**`.
- `.editorconfig` (UTF-8, LF, 2 spaces, final newline, trimmed trailing
  whitespace), `.prettierrc.json` (semi, single quotes, width 100, trailing commas,
  empty plugin list), `.prettierignore`, and `.nvmrc` pinned to Node 22.
- `.gitignore`. Notes two deliberate exceptions: `.atl/` is **not** ignored
  (tracked project configuration), and
  `packages/db/drizzle/meta/_journal.json` **is** tracked (Drizzle Kit needs it to
  replay migrations). `.env` files are ignored while `!.env.example` is tracked.

**Environment contract**

- `.env.example` as the single source of truth for environment variables, grouped
  as Database / Auth / Email (dev) / Scanner (Sprint 2) / Logging, with a header
  explaining that adopting Supabase requires replacing `DATABASE_URL` only.

**Local infrastructure**

- `infra/docker-compose.dev.yml` — Postgres 16 (container `vuldetected-postgres`,
  named volume, `pg_isready` healthcheck), Mailpit (SMTP 1025, web UI 8025), and
  Redis 7 (appendonly, named volume, reserved for the Sprint 2 Celery worker).
  All ports bind to localhost only. The `scanner` service is **intentionally
  absent**, with its isolation constraints pre-recorded as a comment block rather
  than stubbed.
- `infra/README.md` — how to run the stack, why Postgres runs in Docker (no local
  `psql` client on this machine), and how `localhost:5432` maps onto Supabase's
  connection string.

**Architecture Decision Records** (`docs/adr/`)

- `0001-monorepo-and-runtime-split.md` — pnpm + Turborepo; Next.js App Router is
  the only product backend (no NestJS, because a second TS backend duplicates
  auth, CORS, deployment, and secrets for no MVP benefit); the Python service
  exists solely to orchestrate Nuclei/ZAP via Celery.
- `0002-authentication.md` — Better Auth with the Drizzle adapter and
  email+password; argon2id via `@node-rs/argon2` (prebuilt binaries, no node-gyp
  pain on Windows); session tokens stored hashed; `HttpOnly` + `SameSite=Lax`
  cookies. Records why Auth.js's Credentials provider was rejected (no user table,
  forcing hand-rolled users and ad-hoc session storage).
- `0003-design-tokens-and-color-budget.md` — semantic tokens defined once in
  Tailwind v4 `@theme`, no `dark:` sprinkling, the ≈95% neutrals / ≤3% brand iris
  color budget, severity colors from Radix steps 9/10 with an automated contrast
  test rather than an assumption, and never color-only (WCAG 1.4.1).
- `0004-database-provider-neutrality.md` — no hardcoded Docker hostnames, no local
  unix socket paths, no extensions beyond `citext` and `gen_random_uuid()`;
  everything through `DATABASE_URL`; migrations via drizzle-kit against that URL.
  Consequence: local Postgres ↔ Supabase is a single env change.
- `0005-deferred-multi-tenancy.md` — no `organization_id` in Sprint 1, with the
  rationale (speculative schema cost now versus a later `ALTER TABLE`) and the
  trigger for reconsideration.

**Documentation**

- `docs/roadmap.md` — the authoritative plan. Sprint table with deliverables and
  exit criteria per sprint, a deferred-decisions section (Supabase vs local
  Postgres as **unresolved but reduced to a `DATABASE_URL` change**, multi-tenancy
  deferred to S4+, billing, scheduled scanning), and a status legend.
- `docs/database.md` — the Sprint 1 schema table by table (`users`, `sessions`,
  `verification_tokens`, `audit_logs`) with every column, type, nullability,
  default, and the reason each sensitive column exists; the DDL decisions already
  taken (`citext`, `account_status`, `token_purpose`, `gen_random_uuid()`);
  indexes and why each exists; and a prominent **"DB touch points — owner decision
  required"** section listing what S2, S3, and S4 will change, stating that the
  owner must be notified _before_ a migration is authored and that **no migration
  has been executed**.
- `docs/architecture.md` — the three deployables, the register/login request flow,
  the planned scan flow, trust boundaries TB1–TB6, and an ASCII diagram.
- `docs/security.md` — threat model seeded for Sprint 2. The six
  non-negotiables: domain ownership verification as a legal precondition, SSRF
  hardening (DNS resolution, private/link-local/loopback rejection, re-validation
  after every redirect, restricted ports), worker isolation (filtered egress,
  read-only filesystem), session security, secrets never in git, and rate
  limiting — each with an `Open (planned Sprint N)` or `Done` status.
- `docs/decisions-pending.md` — open product and technical questions awaiting the
  owner.
- `docs/README.md` — documentation index.
- Root `README.md` — value proposition, status, security principles, stack table,
  repository layout, quick start (with an explicit statement of what works today),
  documentation index, open decisions, and contributing conventions.

### Fixed

Security defects found by review during Sprint 1 implementation. All three were
invisible to `tsc` and would have shipped.

- **Account lockout could be bypassed with parallel requests.** `recordFailure` read
  `failed_login_count`, incremented in JavaScript, and wrote the total. Concurrent
  requests all read the same value and all wrote the same incremented value, so the
  progressive ladder never advanced — an attacker sending requests in parallel was
  never throttled at all. Now a single atomic statement
  (`failed_login_count = failed_login_count + 1`) with `RETURNING`, so the database
  serialises read and write and the ladder decision uses the persisted value.
- **Every failed login escaped as an unhandled error.** Better Auth's server API
  _throws_ `APIError` on bad credentials rather than returning a falsy result
  (verified in the installed `dist/api/routes/sign-in.mjs`). The code tested
  `if (!result?.user?.id)` — a branch that could never be taken. A wrong password
  therefore threw out of the Server Action instead of incrementing the counter,
  which is what made the bug above reachable: unlimited password guessing, with the
  global error boundary rendered in place of the generic message.
- **The registration page was an account-enumeration oracle.** The same throw made a
  duplicate address with a wrong password behave visibly differently from a fresh
  registration, reinstating the exact leak the surrounding comments describe as
  closed. Both call sites now go through a `signInEmailSafe` wrapper that absorbs
  `APIError` only and re-throws everything else, so a real fault is not disguised
  as a wrong password.
- **`trustedOrigins` was configured in the wrong place.** Nested under `advanced`, it
  type-checked and was silently ignored at runtime — `getTrustedOrigins` reads
  top-level `options.trustedOrigins`. Moved, and the `advanced` slot now carries
  `trustedProxyHeaders: false`, which is the option that actually governs
  `x-forwarded-for` (and whose default the earlier code left to chance).
- **The "optional" registration name was required.** `FormData.get('name')` returns
  `''` for a blank input, not `null`, so `?? undefined` did not convert it and the
  schema rejected it. Now coerced, including all-whitespace values.
- **`session.freshAge` was off by a factor of sixty** relative to its own comment
  (`60 * 30` is 1800 seconds, documented as 30). Set to 15 minutes with the value
  and rationale stated together.
- **The CSS stylesheet failed to compile** because a comment contained a recursive
  glob; the `*/` inside `**/` closed the comment early. Documented in place so it is
  not reintroduced.

### Changed

- **Migrations squashed to a clean three-file baseline** (`0000_enable_citext`,
  `0001_auth_and_audit_schema`, `0002_audit_logs_append_only`). Nothing had been
  executed, so a corrective `0003` would have implied a history that never happened.
  `citext` is its own migration because `users.email` is emitted as `"citext"` and
  the type must exist at `CREATE TABLE` time.
- `users.name` is now `NOT NULL` — Better Auth's `signUpEmail` requires a name, so a
  nullable column contradicted the library's contract. The form stays optional by
  deriving the local part of the email.
- `accounts_provider_account_key` is now a **unique** index; it was a plain index,
  which permitted duplicate rows for one provider identity.
- `audit_logs.action` is `varchar(64)`, matching the action vocabulary, and
  `audit_logs_created_at_idx` is `DESC` because every access pattern is "most recent
  first".
- Replaced the `users_active_idx` / `users_active_email_idx` partial indexes with
  `users_status_idx` and a partial `users_locked_until_idx`.
- `verification.storeIdentifier: 'hashed'` — the identifier column was being stored
  in the clear, since the library defaults to `"plain"`.
- Logout now redirects, instead of leaving the user on a page they are no longer
  authenticated for.
- Added baseline security headers (`nosniff`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy`), verified present against a running server.
- Removed an orphaned `lint: "eslint ."` script from `packages/ui`; there is no
  ESLint dependency or config in the repository, so the script could only fail.

### Added

**Web application (`apps/web`)**

- Next.js App Router application with the full auth surface: register, login,
  logout, and a dashboard. No middleware — authorisation is enforced in the data
  layer, per the documented trust boundary.
- Server Actions for all three mutations, with `'use server'` and generic errors.
- Progressive per-account lockout, a constant-work decoy argon2 verify so an
  unknown address is not measurably faster than a wrong password, and a deliberate
  refusal to increment the counter on the registration path (it would be a
  lockout-bypass tool).
- Session authority in one place, with `cache()` for per-request dedupe.
- Lazy, memoised `getEnv()` / `getDb()` / `getAuth()`, so `next build` succeeds with
  no `.env` and no database. Verified.
- Error, not-found, and loading boundaries; a `/dev/sprint-1` page that reports
  built-versus-declared status rather than asserting features exist.

**Data layer (`packages/db`)**

- Five tables with plural naming, an explicit Better Auth model mapping, and
  relations centralised in `schema/relations.ts` to keep the table modules
  cycle-free.
- Provider-neutral connection code: `DATABASE_URL` only, no host, port, or socket
  assumptions.
- One pooled connection per process, via `createPool` / `bindDb` / `createDb`.
- Append-only `audit_logs`, enforced by a statement-level trigger that is portable
  across containers and managed providers.

**Documentation corrections**

- `docs/security.md`, `docs/database.md`, ADR 0002, and the root `README` all
  claimed session tokens were stored as digests in a `token_hash` column. **No such
  column ever existed.** All four were corrected to state that the token is stored
  raw, why Better Auth `1.7.7` forces that, the rejected alternatives, and the
  revisit condition. A design document that describes a control which was not built
  is the specific failure mode this project is meant to catch.
- `README.md` "What works today" rewritten against commands actually executed,
  including an explicit statement that no code has run against a database and the
  auth flow is unproven until it has.

## [Unreleased roadmap of note]

Sprint 2 picks up: email delivery (Mailpit), which makes `verification_tokens`
live and requires resolving its raw `value` column first; per-IP rate limiting; and
the `domain_ownership` verification flow, which is a legal precondition rather than
a feature.
