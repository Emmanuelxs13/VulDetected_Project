# Supabase setup and Sprint 1 smoke test

> **SUPERSEDED — not the path in use.** Sprint 1 is being verified against a
> **local PostgreSQL 18** server through pgAdmin 4 instead. The current runbook is
> [`local-postgres-setup.md`](./local-postgres-setup.md).
>
> This file is kept as the documented alternative for when the project moves to a
> managed provider. Its smoke test (§8), troubleshooting table and the `LISTEN/NOTIFY`
> pooler reasoning remain valid and were deliberately not duplicated. The steps that
> differ — project creation, connection-string selection, password encoding,
> free-tier pausing — only matter once Supabase is adopted.

**Status:** Sprint 1 verification runbook (alternative path, not executed).

Until this runbook is completed, every claim about auth in this repository is
inference from source code. Nothing has ever executed against a database.

Related: [ADR 0004](./adr/0004-database-provider-neutrality.md) ·
[database.md](./database.md) · [security.md](./security.md)

---

## 0. What you are proving

| #   | Claim                                                                | Where it is asserted                    |
| --- | -------------------------------------------------------------------- | --------------------------------------- |
| 1   | The 3 authored migrations apply cleanly to a real Postgres           | `packages/db/drizzle/`                  |
| 2   | `users.email` is genuinely case-insensitive                          | `citext` in migration 0000              |
| 3   | Passwords are stored as argon2id digests, never plaintext            | `apps/web/src/lib/password.ts`          |
| 4   | A wrong password and an unknown email produce an **identical** error | `apps/web/src/features/auth/actions.ts` |
| 5   | Repeated failures lock the account                                   | same file, `recordFailure`              |
| 6   | `audit_logs` refuses `UPDATE` and `DELETE`                           | migration 0002 trigger                  |
| 7   | The session cookie is `httpOnly` + `SameSite=Lax`                    | `apps/web/src/lib/auth.ts`              |
| 8   | Every design token renders in both themes                            | `/dev/sprint-1`                         |

Claims 4 and 5 are the ones worth doing carefully. They are the difference between
a login form and an authentication system.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. **Organization** → create one if prompted.
3. **Name** → `vuldetected`.
4. **Database Password** → click _Generate a password_, then **save it somewhere
   you will not lose**. Supabase does not display it again; there is no recovery,
   only reset. A password manager is the right home for it.
5. **Region** → pick the one geographically closest to you. Region cannot be
   changed later without a restore.
6. Wait for provisioning to finish.

### Two things about the free tier you must know before you build on it

- **Free projects pause after 7 days of inactivity.** A paused project is not
  deleted, but it refuses connections, so every request that touches the database
  starts failing — including your auth flow. For a product you intend to demo,
  expect this and either touch the project weekly or move to the paid tier
  ($20/month) when it stops being a demo.
- **Two projects maximum, 500 MB.** Comfortable for Sprint 1 and 2. Scans will not
  store raw tool payloads in Postgres (that belongs in object storage), so the
  ceiling is far away.

### Do not use Supabase Auth

This product has its own auth (see [ADR 0002](./adr/0002-authentication.md)) and
our tables are not shaped like Supabase's `auth.users`. You are using Supabase for
**managed Postgres only**. Do not add `supabase-js` to this repository.

---

## 2. Copy the connection string

**Project Settings → Database → Connection string → the URI tab.**

Choose the **Session pooler** card, NOT the Transaction pooler. Copy the URI and
discard the password placeholder.

It looks like:

```
postgresql://postgres.PROJECTREF:YOUR-PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

### Why the Session pooler and not the Transaction pooler

Supabase offers three ways in, and the difference is not cosmetic:

|                                                              | Direct | Session pooler (5432) | Transaction pooler (6543) |
| ------------------------------------------------------------ | ------ | --------------------- | ------------------------- |
| Prepared statements                                          | yes    | yes                   | **no**                    |
| Cursors spanning statements                                  | yes    | yes                   | **no**                    |
| Session state (`LISTEN/NOTIFY`, advisory locks, temp tables) | yes    | yes                   | **no**                    |
| Query pipelining                                             | yes    | yes                   | **no**                    |
| Counts against your direct-connection quota                  | yes    | no                    | no                        |

The Transaction pooler hands the connection back to the pool after every
transaction, so anything bound to a session dies. `postgres.js` **pipelines queries
by default**, and Supabase's own documentation warns that this combination can hang
or return mismatched rows.

The Session pooler gives you managed Postgres with **none** of those caveats. It
still does not consume your direct-connection quota, which is the thing you actually
care about.

`packages/db/src/client.ts` already sets `prepare: false`, so even the transaction
pooler would work — but you would still be running with pipelining disabled. Use the
Session pooler and the question never arises.

**Sprint 2 note:** when scan progress moves to Server-Sent Events on a long-lived
connection, revisit this. `LISTEN/NOTIFY` needs a session, and it is exactly the
kind of thing that forces the decision back to a direct connection.

### URL-encode the password — this is where it breaks

If the generated password contains `@ : / ? # [ ] % &`, it must be percent-encoded,
or the URL parses up to the wrong place and you get a confusing authentication error
against a password you are sure is correct.

| Character | Encode as   |
| --------- | ----------- |
| `@`       | `%40`       |
| `:`       | `%3A`       |
| `/`       | `%2F`       |
| `?`       | `%3F`       |
| `#`       | `%23`       |
| `[` `]`   | `%5B` `%5D` |
| `%`       | `%25`       |

Easiest is to generate your own password with alphanumeric characters only and avoid
the whole problem.

---

## 3. Create the local environment file

The root `.env.example` is the source of truth for **names**. Next.js reads
`.env*` from **its own directory**, so the values file goes in `apps/web/`.

```powershell
Copy-Item .env.example apps\web\.env.local
```

Then edit `apps/web/.env.local`:

```dotenv
# --- Database ---
# Supabase SESSION pooler (port 5432) — see docs/supabase-setup.md
DATABASE_URL=postgresql://postgres.PROJECTREF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require

# --- Auth ---
AUTH_SECRET=<generated below>
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Generate `AUTH_SECRET`

Windows has no `openssl` by default. Use Node, which is already installed:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

That prints 44 characters of base64. Paste it in. The app requires a minimum of 32
characters and will refuse to start without it — this is not a formality: the secret
signs session cookies, so its length is the entropy an attacker must guess to forge
one.

### You do not need SMTP yet

Email verification is disabled in Sprint 1, so nothing is sent. Leave the
`SMTP_*` variables pointing at `localhost:1025` and ignore Mailpit until Sprint 2.

### `.env.local` is gitignored

Confirm it never gets committed:

```powershell
git check-ignore apps/web/.env.local
```

It must print the matching rule. If it prints nothing, stop and fix `.gitignore`
before doing anything else.

---

## 4. Run the migrations

`drizzle-kit migrate` reads `DATABASE_URL` from the environment, and its working
directory is `packages/db` — so export it for the session rather than creating a
second config file:

```powershell
$env:DATABASE_URL = "postgresql://postgres.PROJECTREF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
pnpm --filter @vuldetected/db run db:migrate
```

Expected: three migrations applied in order.

```
0000_enable_citext.sql
0001_auth_and_audit_schema.sql
0002_audit_logs_append_only.sql
```

`citext` must be its own migration because `users.email` is emitted as `"citext"`
and Postgres must already know the type at `CREATE TABLE` time. If 0000 ever fails,
check that the extension is available on your plan.

---

## 5. Verify the schema landed

Paste this into **Supabase → SQL Editor → New query → Run**:

```sql
-- 1. Every expected table exists
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 2. The append-only trigger exists
select tgname, tgtype
from pg_trigger
where tgrelid = 'audit_logs'::regclass
  and not tgisinternal;

-- 3. citext is really in use on users.email
select column_name, data_type, udt_name
from information_schema.columns
where table_name = 'users' and column_name = 'email';

-- 4. Indexes that the queries depend on
select indexname from pg_indexes where schemaname = 'public' order by indexname;
```

Query 1 must list `accounts`, `audit_logs`, `sessions`, `users`,
`verification_tokens`. Query 3 must report `udt_name = citext` — if it says `text`,
the extension was not applied and email case-insensitivity is silently absent.

---

## 6. Prove the audit trail is append-only

This is a security control, so prove it does something:

```sql
insert into audit_logs (action, metadata) values ('manual.test', '{}');
update audit_logs set action = 'tampered' where action = 'manual.test';  -- must FAIL
delete from audit_logs where action = 'manual.test';                     -- must FAIL
```

Both mutations must raise an exception. If the update succeeds, the trigger is
missing and your audit trail is fiction. Clean up with:

```sql
truncate audit_logs;
```

`TRUNCATE` deliberately bypasses the trigger — it is a DDL statement, not a row
mutation. That is why it is the documented escape hatch for maintenance.

---

## 7. Start the app

```powershell
pnpm dev
```

Wait for `ready` and open <http://localhost:3000>.

---

## 8. Sprint 1 smoke test

Do these in order. Each one is testing a specific claim.

### Design system

| #   | Action                              | Expected                                                                                                                              |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Open `/dev/sprint-1`                | Every primitive renders: buttons, all 7 severity badges, dense table, 4 alert variants, progress, empty state, full token swatch grid |
| T2  | Toggle your OS to dark mode, reload | Same page, dark tokens. No `dark:` classes exist in the source, so this works via CSS alone                                           |
| T3  | Read a severity badge               | It has a **shape** (octagon/triangle/diamond/circle/square) **and** a text label — not color alone                                    |
| T4  | Home → Register, click through      | Focus ring is visible on keyboard `Tab`. No mouse needed to see where you are                                                         |

### Registration and storage

| #   | Action                                                     | Expected                                                              |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| T5  | Register `owner@vuldetected.test` with a 12+ char password | Redirect to `/dashboard`                                              |
| T6  | SQL: `select email, status from users;`                    | One row. `email` lowercase, `status = active`                         |
| T7  | SQL: `select left(password, 10) from accounts;`            | Starts with `$argon2id$`. **If you see the plaintext password, stop** |
| T8  | SQL: `select action from audit_logs order by created_at;`  | Contains `user.registered`                                            |
| T9  | Reload `/dashboard`                                        | Still signed in. The session survived a fresh request                 |

### The two tests that matter

| #   | Action                                                                        | Expected                                                                                                      |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| T10 | Sign out. Try to register the **same** email again with a wrong password      | Error is byte-identical to a wrong-password error below. If it differs, you can enumerate registered accounts |
| T11 | Sign in with `owner@vuldetected.test` + a **wrong** password 6 times in a row | Same generic error every time, and by the 6th the account is locked — the correct password stops working      |
| T12 | Sign in with a **nonexistent** email + any password                           | **Exactly** the same message as T11. This is the enumeration oracle being closed                              |

T10–T12 are the acceptance criteria for the auth work. Everything else in Sprint 1
is scaffolding; these three are the product.

### Session handling

| #   | Action                                                              | Expected                                                                                                                        |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| T13 | Browser devtools → Application → Cookies                            | The session cookie has `HttpOnly` **and** `SameSite=Lax`                                                                        |
| T14 | Copy the cookie value; SQL: `select left(token, 10) from sessions;` | Cookie and stored value match, and both are digests, not the raw token. See ADR 0002 for why hashing twice is not possible here |

### Logout

| #   | Action   | Expected                                                                                 |
| --- | -------- | ---------------------------------------------------------------------------------------- |
| T15 | Sign out | Redirect to `/login`; `/dashboard` redirects again; `auth.logged_out` is in `audit_logs` |

---

## 9. Tear down

```sql
drop table if exists audit_logs cascade;
drop table if exists sessions cascade;
drop table if exists verification_tokens cascade;
drop table if exists accounts cascade;
drop table if exists users cascade;
```

The `__drizzle_migrations` table can stay: it records that migrations ran. Drop it
too if you want a truly clean slate.

---

## Troubleshooting

| Symptom                                                         | Cause                                      | Fix                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `password authentication failed for user "postgres.PROJECTREF"` | Password not URL-encoded, or wrong project | Re-copy the string; percent-encode `@ : / ? # [ ] %`                                         |
| `ENOTFOUND aws-0-...pooler.supabase.com`                        | Corporate DNS or proxy blocking Supavisor  | Try the direct connection `db.PROJECTREF.supabase.co:5432`                                   |
| `error: prepared statement "s0" already exists`                 | Transaction pooler (6543)                  | Use the Session pooler (5432)                                                                |
| `relation "users" does not exist`                               | Migrations never ran                       | Re-run step 4 and confirm it printed three migrations                                        |
| `extension "citext" is not available`                           | Plan restriction                           | Check the SQL Editor for the extension list; Supabase includes `citext` on all current plans |
| `AUTH_SECRET is required` at `/dashboard`                       | `.env.local` missing or not in `apps/web/` | Confirm the path; restart `pnpm dev`                                                         |
| Login 500s, works after a restart                               | Env validated lazily on first request      | See section 11                                                                               |
| `Can't reach database server`                                   | Free-tier project paused after 7 days idle | Resume it from the dashboard                                                                 |

---

## 10. What this runbook does NOT prove

Sprint 1 contains no scanner, so none of the following are tested here. They are
Sprint 2:

- Domain ownership verification — the legal gate before any scan.
- SSRF hardening in the worker.
- Real-time progress streaming.
- Severity classification.

Do not describe Sprint 1 as "the scanner works". It is account management plus a
design system.

---

## 11. Known gap: the environment file lives in two places

The root `.env.example` owns the **names**, but the values file must sit in
`apps/web/` because that is where Next.js reads from — and `drizzle-kit` reads from
whatever `process.env` the shell exports. Step 4 works around this with
`$env:DATABASE_URL`.

A permanent fix is available and cheap on this machine: Node 22 supports
`--env-file-if-exists`, verified working on v22.14.0, so the dev and migrate scripts
can load one root `.env.local` regardless of the package that starts them:

```json
"dev": "cross-env NODE_OPTIONS=--env-file-if-exists=../../.env.local next dev"
```

That is deliberately **not** done yet. It changes how every package resolves
configuration, and it is better introduced as its own change than folded into a
verification run.
