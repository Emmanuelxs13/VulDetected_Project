# Local PostgreSQL setup and Sprint 1 smoke test

**Status: EXECUTED through §5.** The login role, the `vuldetected` database, all
three migrations and the append-only proof were run against the local
PostgreSQL 18.3 server. **The application connection (§6) and the smoke test (§8)
are still open** — those are what turn a correct schema into a proven Sprint 1.

This is the path in use. [`supabase-setup.md`](./supabase-setup.md) stays as the
documented alternative for when the project moves to a managed provider.

## Progress

- [x] §1 — environment verified (server running, `citext` trusted, `psql` off PATH)
- [x] §2 — login role `vuldetected` + database `vuldetected` created in pgAdmin 4
- [x] §3 — migrations `0000` → `0001` → `0002` executed in order
- [x] §4 — schema verified: 5 tables, `citext` on `users.email`, append-only trigger
- [x] §5 — append-only proof: `UPDATE` and `DELETE` refused
- [ ] §6 — `apps/web/.env.local` written, `AUTH_SECRET` generated
- [ ] §7 — app starts and renders `/dashboard`
- [ ] §8 — smoke test T1–T15, including the enumeration-oracle tests T10–T12
- [ ] §11 — Sprint 1 committed to the repository

When the first unchecked box is ticked, this runbook stops being inference and
starts being evidence. Until every box above is ticked, do not describe Sprint 1
as verified.

Related: [ADR 0004](./adr/0004-database-provider-neutrality.md) ·
[database.md](./database.md) · [security.md](./security.md)

---

## 0. What is actually installed

Verified on this machine rather than assumed:

| Component           | State                                                                            |
| ------------------- | -------------------------------------------------------------------------------- |
| PostgreSQL server   | **18.3**, service `postgresql-x64-18`, **running**                               |
| Listening           | port **5432**, open on `127.0.0.1` and `::1`                                     |
| pgAdmin 4           | installed at `C:\Program Files\PostgreSQL\18\pgAdmin 4\`, running                |
| `psql`              | present at `C:\Program Files\PostgreSQL\18\bin\psql.exe` but **not on PATH**     |
| Authentication      | `scram-sha-256` for `local` and TCP 127.0.0.1                                    |
| `citext` extension  | available at `share/extension/citext.control`, version **1.8**, `trusted = true` |
| `gen_random_uuid()` | **built into PostgreSQL 18** (core since PG 13) — no `pgcrypto` needed           |

Two of those deserve a note:

- **`trusted = true` on `citext` matters.** It means the database _owner_ can
  create the extension without superuser rights, so the application does not need
  to connect as `postgres`. Running migrations as the superuser and running the app
  as a different role is not required.
- **`psql` is not on PATH**, so `psql --version` fails in any shell. The binary is
  there; it is just not exported. That is why an earlier environment check
  concluded Postgres was missing when it was not. If you want it, add
  `C:\Program Files\PostgreSQL\18\bin` to the `PATH`, but pgAdmin makes it
  unnecessary for this runbook.

---

## 1. What you are proving

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

## 2. Create the login role and the database (pgAdmin 4)

You are creating **a role** (who connects) and **a database** (what is created).
They are separate objects, and creating only one of them produces a confusing
failure later.

### 2a. The login role

1. In the left tree, expand **Servers → PostgreSQL 18 → Login/Group Roles**.
2. Right-click → **Create → Login/Roles…** (some builds label it _Login Role_).
3. **General** tab → _Name_: `vuldetected`
4. **Definition** tab → _Password_: pick one and **save it in a password manager**.
   Re-type it in the confirmation field.
5. **Privileges** tab → _Can login?_ = **Yes**. Leave everything else No.
6. Click **Save**.

If pgAdmin's dialog does not let you set a password, or you would rather not fight
the GUI, run the SQL alternative in §2c instead.

### 2b. The database

1. In the left tree, right-click **Databases → Create → Database…**
2. _Database_: `vuldetected`
3. _Owner_: pick `vuldetected` from the dropdown (this is why the role comes first —
   the owner only appears in that list once the role exists).
4. **Save**.

### 2c. SQL alternative for both steps

If you prefer, open a Query Tool against the **`postgres`** database (create a
database from anywhere but a transaction block, so keep these as separate
executions):

```sql
CREATE ROLE vuldetected LOGIN PASSWORD 'CHOOSE-A-PASSWORD';
CREATE DATABASE vuldetected OWNER vuldetected;
```

Run `CREATE ROLE` first, then `CREATE DATABASE` on its own. Setting the role
password later if you need to change it:

```sql
ALTER ROLE vuldetected WITH LOGIN PASSWORD 'NEW-PASSWORD';
```

### 2d. Confirm you are connected to the right database

In pgAdmin's left tree, expand **Databases**. The `vuldetected` database should be
listed. Click it — the right-hand _Dashboard_ tab should show `vuldetected` as the
current database and `vuldetected` or `postgres` as the connected user.

---

## 3. Create the tables (Query Tool)

The three migration files already exist. Do **not** hand-write them — run them.

1. In the left tree, right-click the **`vuldetected` database → Query Tool**.
2. Confirm the database selector at the top of the Query Tool reads
   **`vuldetected`**, not `postgres`. This is the most common mistake: running the
   migrations into the wrong database and discovering it when the app says the
   relation does not exist.
3. Open the file: toolbar **Open File** (folder icon) →
   `C:\Programación\VulDetected_Project\packages\db\drizzle\0000_enable_citext.sql`
4. **Execute (F5)** — the play button. Expect `Query returned successfully`.
5. Repeat for `0001_auth_and_audit_schema.sql`, then `0002_audit_logs_append_only.sql`.

### Order is not optional

| File                              | Why it must be in this position                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `0000_enable_citext.sql`          | Defines the `citext` type. `users.email` is declared `"citext"`, and `CREATE TABLE` fails if the type does not exist yet. |
| `0001_auth_and_audit_schema.sql`  | Creates `users`, `accounts`, `sessions`, `verification_tokens`, `audit_logs` + indexes + FKs (83 lines).                  |
| `0002_audit_logs_append_only.sql` | Creates the append-only trigger. Cannot precede `audit_logs`.                                                             |

### What each table is for

Before running `0001`, know what you are about to create — the migration file is
SQL without prose, and two of these tables are counter-intuitive.

| Table                 | Plain-language purpose                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `users`               | **Who your customers are.** Email, name, account state, and the lockout counters that survive a restart.               |
| `accounts`            | **Where the password lives.** The `$argon2id$` hash is here, **not** in `users`. Better Auth owns this table.          |
| `sessions`            | **Who is logged in right now.** One row per active login, with its expiry so stale ones can be swept.                  |
| `verification_tokens` | **Single-use tokens.** Email verification, password reset — and `domain_ownership`, the Sprint 2 gate before any scan. |
| `audit_logs`          | **Who did what.** Append-only evidence; `UPDATE` and `DELETE` are refused by trigger.                                  |

Two rules worth stating out loud:

- **The password never goes in `users`.** Any query selecting from `users` is
  already free of secrets, so a careless `SELECT *` cannot leak a hash.
- **`domain_ownership` is the legal gate of the product.** Until a domain proves it
  belongs to the requester, VulDetected must not scan it. The vocabulary exists
  today so Sprint 2 writes into a schema that already expects it.

Column-by-column detail lives in [`database.md`](./database.md), including an
`accounts` section. That file and these migration files are the two references;
neither was written from the other's summary.

### If pgAdmin reports an uncommitted transaction

pgAdmin's Query Tool has an **auto-commit** toggle in the toolbar. If the execution
message is followed by a pending transaction and the tables do not appear when you
refresh, click the **Commit** button (checkmark). Then refresh the tree.

`0000` is deliberately idempotent (`CREATE EXTENSION IF NOT EXISTS`), so re-running
it is safe. `0001` is not — re-running it will fail on existing tables, which is the
correct behaviour and the signal that you already ran it.

---

## 4. Verify the schema landed

In Query Tool against the **`vuldetected`** database:

```sql
-- 1. Every expected table exists
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

-- 2. citext really is on users.email  -- if this says "text", claim 2 is false
select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_name = 'users' and column_name = 'email';

-- 3. The append-only trigger exists
select tgname, tgfoid::regprocedure
from pg_trigger
where tgrelid = 'audit_logs'::regclass
  and not tgisinternal;

-- 4. Indexes the queries depend on
select tablename, indexname
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 5. Enum types landed
select t.typname, e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
order by t.typname, e.enumsortorder;

-- 6. OWNER of every object — the gotcha that bites at 500s
--    If pgAdmin was connected as `postgres` when the migrations ran, every table
--    belongs to `postgres` and the app gets `permiso denegado a la tabla users`
--    (SQLSTATE 42501) on its first query. Expected: every row says `vuldetected`.
select tablename, tableowner
from pg_tables
where schemaname = 'public'
order by tablename;
```

Expected for (1): `accounts`, `audit_logs`, `sessions`, `users`,
`verification_tokens`.
Expected for (2): `udt_name` = **`citext`**.
Expected for (3): one row, `audit_logs_append_only`.
Expected for (5): `account_status` with `pending`, `active`,
`suspended`, `deleted`; `token_purpose` with `verify_email`, `reset_password`,
`domain_ownership`.
Expected for (6): every `tableowner` = **`vuldetected`**.

### 4b. I ran the migrations as `postgres` — fix

Anyone can fall for this; pgAdmin defaults to the superuser for new Query Tools.
The clean fix is to make the application role the owner, which grants every
privilege at once (select/insert/update/delete/truncate/references/trigger and
index creation). Run this **connected as `postgres`**, against the
`vuldetected` database:

```sql
ALTER TABLE public.accounts OWNER TO vuldetected;
ALTER TABLE public.audit_logs OWNER TO vuldetected;
ALTER TABLE public.sessions OWNER TO vuldetected;
ALTER TABLE public.users OWNER TO vuldetected;
ALTER TABLE public.verification_tokens OWNER TO vuldetected;
ALTER TYPE public.account_status OWNER TO vuldetected;
ALTER TYPE public.token_purpose OWNER TO vuldetected;
ALTER SEQUENCE public.audit_logs_id_seq OWNER TO vuldetected;
ALTER FUNCTION public.audit_logs_append_only() OWNER TO vuldetected;
```

Then re-run verification query 6 and confirm every owner is `vuldetected`:

Going forward: connect the Query Tool **as `vuldetected`** (or reassign after every
migration run as `postgres`). The mismatch is invisible until the first HTTP
request touches the table, which is the most expensive place to discover it.

---

## 5. Prove the audit trail is append-only

This is a security control, so prove it does something:

```sql
insert into audit_logs (action, metadata) values ('manual.test', '{}');

update audit_logs set action = 'tampered' where action = 'manual.test';  -- must FAIL
delete from audit_logs where action = 'manual.test';                     -- must FAIL

truncate audit_logs;  -- the documented escape hatch, if you want it clean
```

Both mutations must raise an exception. If the update succeeds, the trigger is
missing and your audit trail is fiction.

`TRUNCATE` bypasses the trigger on purpose — it is a DDL statement, not a row
mutation. That is exactly why it is the maintenance path.

---

## 6. Give the application a connection string

Next.js reads `.env*` from **its own directory**, so the values file goes in
`apps/web/`:

```powershell
Copy-Item .env.example apps\web\.env.local
```

Edit `apps/web/.env.local`:

```dotenv
# --- Database ---  local PostgreSQL 18 on 127.0.0.1
DATABASE_URL=postgresql://vuldetected:CHOOSE-A-PASSWORD@127.0.0.1:5432/vuldetected

# --- Auth ---
AUTH_SECRET=<generate below>
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Notes:

- **No `sslmode`.** Local TCP has no TLS and `postgres.js` reports `ssl: false`
  here. Adding `sslmode=require` would break the connection.
- **`?schema=public` is harmless** if present — verified that `postgres.js` parses
  the URL correctly with and without it. It is Supabase-flavoured and can be
  dropped.
- **No port 6543 / pooler reasoning applies.** That is Supabase-specific; a local
  server is a single backend and the pooler discussion in
  [`supabase-setup.md`](./supabase-setup.md) is irrelevant here. `prepare: false`
  in `client.ts` is a no-op cost (one extra parse per query) that buys provider
  neutrality for later.

### Generate `AUTH_SECRET`

Windows has no `openssl` by default. Use Node:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the 44 characters in. The app requires ≥32 characters and refuses to start
without it — the secret signs session cookies, so its length is the entropy an
attacker must guess to forge one.

### Confirm it is not going to git

```powershell
git check-ignore apps/web/.env.local
```

It must print the matching rule. If it prints nothing, stop and fix `.gitignore`
first.

### Do not run `db:migrate`

```powershell
pnpm --filter @vuldetected/db run db:migrate   # DO NOT RUN THIS
```

`drizzle-kit migrate` applies SQL through its own bookkeeping table, which is
unaware of migrations you executed by hand in pgAdmin. Running it now would try to
apply `0000` again and fail on `citext` — and worse, if you had ever touched the
tables by hand, it could appear to apply something that already exists.

**pgAdmin is the application authority for now.** If you ever want `drizzle-kit` to
take over the migration history, say so first: the two must be reconciled
explicitly, not allowed to discover each other by failing.

`pnpm --filter @vuldetected/db run db:generate` (authoring new SQL from schema
changes) **is** safe — it opens no connection.

---

## 7. Start the app

```powershell
pnpm dev
```

Wait for `ready` and open <http://localhost:3000>.

---

## 8. Sprint 1 smoke test

Do these in order. Each one tests a specific claim.

### Design system

| #   | Action                                | Expected                                                                                                                              |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Open `/dev/sprint-1`                  | Every primitive renders: buttons, all 7 severity badges, dense table, 4 alert variants, progress, empty state, full token swatch grid |
| T2  | Toggle OS to dark mode, reload        | Same page, dark tokens. No `dark:` classes exist in the source, so this works via CSS alone                                           |
| T3  | Read a severity badge                 | It has a **shape** (octagon/triangle/diamond/circle/square) **and** a text label — not color alone                                    |
| T4  | Home → Register, tab through the form | Focus ring visible with keyboard only. No mouse needed to see where you are                                                           |

### Registration and storage

| #   | Action                                                     | Expected                                                              |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| T5  | Register `owner@vuldetected.test` with a 12+ char password | Redirect to `/dashboard`                                              |
| T6  | SQL: `select email, status from users;`                    | One row, `email` lowercase, `status = active`                         |
| T7  | SQL: `select left(password, 10) from accounts;`            | Starts with `$argon2id$`. **If you see the plaintext password, stop** |
| T8  | SQL: `select action from audit_logs order by created_at;`  | Contains `user.registered`                                            |
| T9  | Reload `/dashboard`                                        | Still signed in — the session survived a fresh request                |

### The two tests that matter

| #   | Action                                                                   | Expected                                                                                                      |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| T10 | Sign out. Try to register the **same** email again with a wrong password | Error is byte-identical to the wrong-password error in T11. If it differs, registered accounts are enumerable |
| T11 | Sign in with `owner@vuldetected.test` + a **wrong** password 6 times     | Same generic error every time; by the 6th the account is locked and the correct password stops working        |
| T12 | Sign in with a **nonexistent** email + any password                      | **Exactly** the same message as T11                                                                           |

T10–T12 are the acceptance criteria for the auth work. Everything else in Sprint 1
is scaffolding; these three are the product.

### Session handling

| #   | Action                                                              | Expected                                                                                                                  |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| T13 | Devtools → Application → Cookies                                    | Session cookie has `HttpOnly` **and** `SameSite=Lax`                                                                      |
| T14 | Copy the cookie value; SQL: `select left(token, 10) from sessions;` | Cookie and stored value match, both are digests, not the raw token. See ADR 0002 for why hashing twice is impossible here |

### Logout

| #   | Action   | Expected                                                                                                                                                                       |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T15 | Sign out | You are sent to `/login`; `/dashboard` renders **"No active session"** (200 — this app deliberately does not redirect, ADR 0002 §4); `auth.logged_out` appears in `audit_logs` |

---

## 9. Reset if you want to start clean

```sql
drop table if exists audit_logs cascade;
drop table if exists sessions cascade;
drop table if exists verification_tokens cascade;
drop table if exists accounts cascade;
drop table if exists users cascade;
-- then re-run 0000, 0001, 0002 in order
```

Leaving `citext` in place is fine — `0000` is idempotent. Dropping the whole
database works too:

```sql
-- run from the postgres database
drop database if exists vuldetected;
```

---

## Troubleshooting

| Symptom                                               | Cause                                                                                                  | Fix                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `type "citext" does not exist`                        | `0000` never ran, or ran against another database                                                      | Verify §4 query 2. Re-run `0000`                               |
| `relation "users" does not exist`                     | Migrations went into `postgres`, or never ran                                                          | Check the Query Tool's database selector; re-run §3            |
| `password authentication failed`                      | Wrong password, or the role has no password                                                            | `ALTER ROLE vuldetected WITH LOGIN PASSWORD '...'` in §2c      |
| `database "vuldetected" does not exist`               | Step 2b skipped, or the app's `DATABASE_URL` points elsewhere                                          | Confirm in §4 query 1 against the same name you put in the URL |
| `relation "users" already exists` when running `0001` | You re-ran it                                                                                          | Harmless — it already exists. Move to `0002`                   |
| `permiso denegado a la tabla users` (SQLSTATE 42501)  | Migrations ran as `postgres`; tables are owned by the superuser, but the app connects as `vuldetected` | §4b — reassign ownership to `vuldetected`                      |
| `AUTH_SECRET is required` at `/dashboard`             | `.env.local` missing or not inside `apps/web/`                                                         | Confirm the path; restart `pnpm dev`                           |
| Login 500s but works after a restart                  | Env is validated lazily on first request                                                               | See §10                                                        |
| Port already in use on 5432                           | Another Postgres is running                                                                            | `Get-Service *postgres*` shows the instances                   |

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
`apps/web/` because that is where Next.js reads from — and `drizzle-kit` reads
whatever `process.env` the shell exports.

A permanent fix is available and cheap on this machine: Node 22 supports
`--env-file-if-exists`, verified working on v22.14.0, so dev and migrate scripts
could load one root `.env.local` regardless of the package that starts them:

```json
"dev": "cross-env NODE_OPTIONS=--env-file-if-exists=../../.env.local next dev"
```

That is deliberately **not** done yet. It changes how every package resolves
configuration, and it is better introduced as its own change than folded into a
verification run.
