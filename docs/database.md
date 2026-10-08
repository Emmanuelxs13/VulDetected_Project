# Database

Reference for the VulDetected schema and the decisions behind it. Sprint 1
schema documentation only — Sprint 2 adds the scan tables, and those touch points
are listed explicitly in
[DB touch points — owner decision required](#db-touch-points--owner-decision-required).

> **No migration has been executed yet.** Nothing in this document has been
> applied to any database. The schema below is the design of record, not a
> description of a live database.

Access is always through `DATABASE_URL`. Migrations are applied with
drizzle-kit against that URL — see
[ADR 0004](./adr/0004-database-provider-neutrality.md).

## DDL decisions already taken

These are settled. Changing any of them is an ADR plus an owner decision.

| Decision                        | Value                                                | Why                                                                                                                                                             |
| ------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Extension**                   | `citext`                                             | Case-insensitive email lookup. Case-insensitive login matching is a security property, not cosmetics. Available on every managed provider, no superuser needed. |
| **Primary key default**         | `gen_random_uuid()`                                  | UUID primary keys without an extension; native since Postgres 13. Avoids a sequential-ID enumeration vector and avoids granting `CREATE SEQUENCE` per table.    |
| **Enum type: `account_status`** | `pending`, `active`, `suspended`, `deleted`          | Domain of account states as a database type rather than free text. A wrong state is rejected by the database instead of by an `else` branch three layers away.  |
| **Enum type: `token_purpose`**  | `verify_email`, `reset_password`, `domain_ownership` | `domain_ownership` is reserved for the Sprint 2 DNS/`/.well-known` challenge, so the purpose vocabulary is fixed before that code exists.                       |

Extensions **not** used, and why: `pg_trgm` (provider-specific; fuzzy search must
be built portably), `uuid-ossp` (superseded by built-in `gen_random_uuid()`),
PostGIS, `vector` — anything requiring superuser is out of scope until an ADR and
an owner decision exist.

## Current schema (Sprint 1)

> **This section documents the schema as generated into
> `packages/db/drizzle/`, verified by reading `0001_auth_and_audit_schema.sql`.**
> Where an earlier draft disagreed with the generated SQL, the SQL won and the
> draft was corrected. Two specific corrections are called out below, because a
> design document that quietly diverges from the migration is worse than one that
> was never written.

### `users`

| Column               | Type             | Null | Default             | Notes                                                                                                                                                                                                                               |
| -------------------- | ---------------- | ---- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | `uuid`           | no   | `gen_random_uuid()` | Primary key. Supplied by the database, not the app.                                                                                                                                                                                 |
| `email`              | `citext`         | no   | —                   | `citext`: case-insensitive, so `A@x.com` and `a@x.com` are one account. Unique.                                                                                                                                                     |
| `email_verified`     | `boolean`        | no   | `false`             | **Corrected.** Better Auth's adapter requires this exact boolean column; a `email_verified_at` timestamp is not something it will write.                                                                                            |
| `name`               | `text`           | no   | —                   | **Corrected to NOT NULL.** Better Auth's `signUpEmail` input schema requires `name: z.string()`, so a nullable column would contradict the library's own contract. The form stays optional by deriving the local part of the email. |
| `image`              | `text`           | yes  | `null`              | Avatar URL, reserved for OAuth in Sprint 4+.                                                                                                                                                                                        |
| `status`             | `account_status` | no   | `'active'`          | Enum `pending`/`active`/`suspended`/`deleted`. Suspension without deletion, so audit history survives.                                                                                                                              |
| `locale`             | `text`           | no   | `'es'`              | Per-user display locale. Default matches the product's initial market.                                                                                                                                                              |
| `failed_login_count` | `integer`        | no   | `0`                 | Drives the progressive lockout ladder. Written only by the login action, atomically.                                                                                                                                                |
| `locked_until`       | `timestamptz`    | yes  | `null`              | Set by the lockout ladder; enforced again at session creation.                                                                                                                                                                      |
| `deleted_at`         | `timestamptz`    | yes  | `null`              | Soft-delete marker.                                                                                                                                                                                                                 |
| `created_at`         | `timestamptz`    | no   | `now()`             | Row creation time.                                                                                                                                                                                                                  |
| `updated_at`         | `timestamptz`    | no   | `now()`             | Maintained by the data layer — must not drift.                                                                                                                                                                                      |

**Why each sensitive column exists**

- `email` — the login identifier. `citext` is what makes case-insensitive matching
  safe; a case-sensitive unique index would allow `A@x.com` and `a@x.com` to
  register as two accounts. It is enforced by the database rather than by
  lowercasing in application code, which a direct SQL client would bypass.
- `status` — allows suspension and revocation without deleting a user row.
  Defaults to `active` rather than `pending`, because email
  verification is **off** in Sprint 1 (`docs/decisions-pending.md`). Defaulting to
  a non-active state while the transition that would activate it does not exist
  would lock out every account.
- `failed_login_count` / `locked_until` — per-account throttling. IP-only limiting
  is defeated by a botnet; per-account is what stops a password-spraying list
  aimed at one user.

**Password storage is not a column on `users`.** The argon2id hash lives in
`accounts.password` — that is Better Auth's schema, not a preference. See
[ADR 0002](./adr/0002-authentication.md).

### `accounts`

> **The most misread table in the schema.** The argon2id hash lives here, not in
> `users`. Better Auth owns this table; the application reads from it but does not
> design it.

| Column                     | Type          | Null | Default             | Notes                                                                                      |
| -------------------------- | ------------- | ---- | ------------------- | ------------------------------------------------------------------------------------------ |
| `id`                       | `uuid`        | no   | `gen_random_uuid()` | Surrogate primary key, database-supplied.                                                  |
| `account_id`               | `text`        | no   | —                   | The identity's ID **within** its provider. For `credential` logins this is the `users.id`. |
| `provider_id`              | `text`        | no   | —                   | `credential` today; `google` in Sprint 4. Same table, no schema change.                    |
| `user_id`                  | `uuid`        | no   | —                   | FK → `users`, `ON DELETE CASCADE`.                                                         |
| `password`                 | `text`        | yes  | `null`              | **The `$argon2id$` digest.** Null for OAuth rows.                                          |
| `access_token`             | `text`        | yes  | `null`              | OAuth access token, unused until Sprint 4.                                                 |
| `refresh_token`            | `text`        | yes  | `null`              | OAuth refresh token, unused until Sprint 4.                                                |
| `id_token`                 | `text`        | yes  | `null`              | OIDC ID token, unused until Sprint 4.                                                      |
| `access_token_expires_at`  | `timestamptz` | yes  | `null`              | OAuth expiry, unused until Sprint 4.                                                       |
| `refresh_token_expires_at` | `timestamptz` | yes  | `null`              | OAuth expiry, unused until Sprint 4.                                                       |
| `scope`                    | `text`        | yes  | `null`              | OAuth granted scopes, unused until Sprint 4.                                               |
| `created_at`               | `timestamptz` | no   | `now()`             | Row creation time.                                                                         |
| `updated_at`               | `timestamptz` | no   | `now()`             | Maintained by the data layer.                                                              |

**Why it is a separate table at all**

Two concerns are deliberately split:

- `users` is the **domain model** — name, email, account state, lockout counters.
  Everything this product reasons about.
- `accounts` is the **credential layer** owned by Better Auth. It stores how a user
  authenticates, which is a different question from who they are.

Keeping them apart means OAuth in Sprint 4 adds rows, not columns: the `users` table
never learns what a refresh token is, and the application's user model never carries
a secret it should not.

**Why the credential must not move to `users`**

This is Better Auth's schema, not a style preference (see
[ADR 0002](./adr/0002-authentication.md)). Moving it would break the adapter and
would also blur a boundary worth keeping: any query selecting from `users` is
already free of secrets, so a careless `SELECT *` cannot leak a password hash.

**Why `ON DELETE CASCADE`**

Closing an account must remove its credentials and sessions together. A credential
row left behind by a deleted user is an orphaned secret. `audit_logs` is the one
table that deliberately does **not** cascade — evidence survives the account.

**The unique constraint that prevents duplicate accounts**

`accounts_provider_account_key UNIQUE (provider_id, account_id)` guarantees one
identity row per provider. Without it, a retry during registration could insert two
credential rows for the same person and the second login would create a session
attached to the wrong one.

### `sessions`

| Column       | Type          | Null | Default             | Notes                                                                                 |
| ------------ | ------------- | ---- | ------------------- | ------------------------------------------------------------------------------------- |
| `id`         | `uuid`        | no   | `gen_random_uuid()` | Primary key.                                                                          |
| `user_id`    | `uuid`        | no   | —                   | FK → `users.id` `ON DELETE CASCADE`. Deleting a user must not leave live sessions.    |
| `token`      | `text`        | no   | —                   | **Corrected.** This holds the **raw** session token, not a digest. See below. Unique. |
| `expires_at` | `timestamptz` | no   | —                   | Absolute expiry; sessions are not renewable indefinitely.                             |
| `ip_address` | `text`        | yes  | `null`              | Session created from this address, for abuse investigation.                           |
| `user_agent` | `text`        | yes  | `null`              | Same purpose; makes hijacked-session triage possible.                                 |
| `created_at` | `timestamptz` | no   | `now()`             | Row creation time.                                                                    |
| `updated_at` | `timestamptz` | no   | `now()`             | Touched at most daily by Better Auth's `updateAge`.                                   |

**The session token is stored in the clear, and this is a known gap.**

An earlier draft of this document specified a `token_hash` column holding a SHA-256
digest. **That column was never created, and the claim was never true.** Better Auth
`1.7.7` hashes the token internally, uses the digest for the `RETURNING` clause, and
derives the cookie from that returned value — so hashing it again on write would put
the _digest_ in the cookie and break every subsequent request. The full round-trip is
documented in [ADR 0002](./adr/0002-authentication.md) and tracked as an open
finding in [security.md](./security.md#4-session-security).

Accepted for Sprint 1 with compensating controls: 7-day absolute expiry, `HttpOnly`,
`SameSite=Lax`, `Secure` in production, immediate server-side revocation, and
account-state gating at session creation. Revisit before any public launch.

`ip_address` and `user_agent` exist because without them, detecting a hijacked
session is guesswork. They are metadata, not identifiers, and are not used for
rate limiting decisions that could lock out a user on a shared or mobile IP.

### `verification_tokens`

| Column       | Type            | Null | Default             | Notes                                                                                                                                                          |
| ------------ | --------------- | ---- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `uuid`          | no   | `gen_random_uuid()` | Primary key.                                                                                                                                                   |
| `identifier` | `text`          | no   | —                   | Lookup key — the email, for most flows. **Stored SHA-256 hashed**, via `verification.storeIdentifier: 'hashed'`, which is not the library default (`"plain"`). |
| `value`      | `text`          | no   | —                   | The token itself. **Stored raw** — see below.                                                                                                                  |
| `purpose`    | `token_purpose` | yes  | `null`              | `verify_email` / `reset_password` / `domain_ownership`. Keeps token types from being interchangeable.                                                          |
| `expires_at` | `timestamptz`   | no   | —                   | Absolute expiry.                                                                                                                                               |
| `created_at` | `timestamptz`   | no   | `now()`             | Row creation time.                                                                                                                                             |
| `updated_at` | `timestamptz`   | no   | `now()`             | Row update time.                                                                                                                                               |

**Corrected shape.** An earlier draft specified `user_id`, an `email` column, and a
`token_hash` column. None of those exist. Better Auth's model is `(identifier,
value)`: there is no user FK, because a verification token must be resolvable
_before_ a user row exists. The schema was changed to match, and no
`verificationTokens → users` relation is declared, because there is no column to
join on.

**`value` is stored raw and cannot be hashed with a core option.** Verified:
`createVerificationValue` applies `processIdentifier` to the _identifier_ only and
spreads the rest of the payload through untouched. A `storeToken` option exists but
belongs to the magic-link _plugin_, not to core email verification.

This is currently inert — `sendOnSignUp` is `false` and Sprint 1 has no mailer, so
no row is ever written. It becomes live the moment mail arrives in Sprint 2, and
must be resolved before the first verification email is sent.

`purpose` is what keeps token types from being interchangeable: without it, a
value leaked from one email flow would be valid in another. `domain_ownership` is
reserved for Sprint 2's ownership challenge, so the vocabulary is fixed before
that feature needs it.

### `audit_logs`

**Append-only.** Rows are never updated and never deleted by application code —
per OWASP A09 (2021: Security Logging and Monitoring Failures), an audit log that
can be rewritten is not evidence.

| Column          | Type          | Null | Default             | Notes                                                                                                                                             |
| --------------- | ------------- | ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | `uuid`        | no   | `gen_random_uuid()` | Primary key.                                                                                                                                      |
| `actor_user_id` | `uuid`        | yes  | `null`              | FK → `users.id`. Nullable: authentication events (login attempts, failures) have no authenticated actor yet.                                      |
| `action`        | `text`        | no   | —                   | Stable machine-readable verb: `auth.login.succeeded`, `auth.login.failed`, `scan.enqueued`, `domain.ownership.verified`. Not a free-text message. |
| `target_type`   | `text`        | yes  | `null`              | Kind of entity acted upon, e.g. `user`, `session`, `scan`.                                                                                        |
| `target_id`     | `uuid`        | yes  | `null`              | Identifier of the affected entity.                                                                                                                |
| `metadata`      | `jsonb`       | yes  | `null`              | Structured context. Explicitly **never** stores passwords, raw tokens, full cookies, or auth headers.                                             |
| `ip_address`    | `text`        | yes  | `null`              | Source address of the event.                                                                                                                      |
| `user_agent`    | `text`        | yes  | `null`              | Client identity of the event.                                                                                                                     |
| `created_at`    | `timestamptz` | no   | `now()`             | Event time. Append-only means this column is the authoritative ordering.                                                                          |

Why this exists: incident response starts with "when did this happen and who did
it". Without an append-only record, a breach investigation has nothing to work
from. The `actor_user_id` nullability is deliberate — failed logins are exactly the
events worth recording, and they have no user.

## Indexes and why each exists

| Index                                | Table                 | Type          | Serves                                                                                                                                                                                |
| ------------------------------------ | --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users_email_unique`                 | `users`               | unique        | Enforces one account per address and makes login lookup a single index hit. With `citext`, case-insensitive by construction.                                                          |
| `users_status_idx`                   | `users`               | btree         | "All suspended accounts", and account-state gating at session creation.                                                                                                               |
| `users_locked_until_idx`             | `users`               | partial btree | Lockout sweeps. Partial on `locked_until IS NOT NULL`, so the index holds only genuinely locked rows instead of every user.                                                           |
| `sessions_token_unique`              | `sessions`            | unique        | Session validation on **every authenticated request**. Must be unique and must exist — without it, token verification degrades to a sequential scan. The hottest index in the schema. |
| `sessions_user_id_idx`               | `sessions`            | btree         | "List / revoke all sessions for this user" — used by sign-out-everywhere and by incident response.                                                                                    |
| `sessions_expires_at_idx`            | `sessions`            | btree         | Session-expiry sweeps and revocation. Also supports cheap TTL-style cleanup.                                                                                                          |
| `accounts_provider_account_key`      | `accounts`            | unique        | One row per provider account. **Corrected to a unique index** — it was a plain index, which would have allowed duplicate rows for the same provider identity.                         |
| `accounts_user_id_idx`               | `accounts`            | btree         | Credential lookup by user; also the FK target for cascading deletes.                                                                                                                  |
| `verification_tokens_lookup_idx`     | `verification_tokens` | btree         | The `(identifier, value)` lookup that every verification does.                                                                                                                        |
| `verification_tokens_expires_at_idx` | `verification_tokens` | btree         | Expired-token cleanup without scanning every row.                                                                                                                                     |
| `verification_tokens_purpose_idx`    | `verification_tokens` | btree         | "Outstanding tokens of this purpose" for resend / revoke UI.                                                                                                                          |
| `audit_logs_actor_user_id_idx`       | `audit_logs`          | btree         | "Everything this user did" during investigation.                                                                                                                                      |
| `audit_logs_created_at_idx`          | `audit_logs`          | btree, `DESC` | Time-range queries — the dominant access pattern. Descending, because every such query is "most recent first", which is what a B-tree can serve without a sort.                       |
| `audit_logs_target_idx`              | `audit_logs`          | btree         | "History of this specific entity".                                                                                                                                                    |

`audit_logs` is expected to grow without bound, so retention sweeps will be driven
by `audit_logs_created_at_idx`.

**Removed:** `users_active_idx` and `users_active_email_idx`, a pair of partial
indexes on `status = 'active'`. They encoded an assumption — that "active" is the
interesting slice — which stopped being true the moment suspension existed, and a
partial index on a boolean-ish enum that is the common case indexes nearly the whole
table while helping almost no query. Replaced with the two indexes above.

---

## DB touch points — owner decision required

> **The owner must be notified BEFORE any migration that touches the items below
> is authored.** Not reviewed afterwards — authored. A migration written without
> notice is a decision made by accident.
>
> **No migration has been executed yet.** `users`, `sessions`,
> `verification_tokens`, and `audit_logs` are documented here as the agreed
> Sprint 1 design. Sprint 1 migrations have not been run against any database.

### Sprint 2 — scan domain

New tables, no backfill:

| Table         | Purpose                               | Key columns to agree on                                                                                                                                                                                                                               |
| ------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domains`     | A domain the user has proven they own | `id`, `user_id`, `hostname`, `normalized_hostname` (**unique per user** — decides whether the same hostname can be claimed by two accounts), verification status, verification method (`dns_txt` / `well_known`), verification record, `verified_at`. |
| `scans`       | One run against one domain            | `id`, `domain_id`, status (`queued`/`running`/`completed`/`failed`/`cancelled`), tool(s) used, started/finished timestamps, Celery task id, error state.                                                                                              |
| `findings`    | One normalized vulnerability          | `id`, `scan_id`, stable finding key for deduplication across re-scans, severity, title, description, affected endpoint, evidence, raw tool payload.                                                                                                   |
| `scan_events` | Append-only progress stream           | `id`, `scan_id`, timestamp, event type, payload — the source for real-time progress.                                                                                                                                                                  |

**Owner decisions needed before Sprint 2 migrations:**

1. Can the same hostname be verified by **two different accounts**? This decides
   the uniqueness scope of `domains.normalized_hostname` and is a product and
   abuse-prevention decision, not a schema detail.
2. Retention for `scan_events` — they grow fastest of all these tables and are the
   main candidate for a shorter retention than `findings`.
3. Retention for raw tool payloads. They are the bulkiest field and the most
   sensitive (endpoints discovered on the target). Truncation or separate
   storage may be correct.
4. Whether `findings` dedupes **within** a scan or **across** re-scans of the
   same domain. Cross-scan dedup is much more useful and much harder to index.

### Sprint 3 — remediation

| Change                        | Why it is a schema change, not just content                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remediation content or fields | Per-vulnerability remediation addressed to developer / sysadmin / business owner, plus copyable fix code. Whether remediation lives in the database, versioned in the repo, or in a hybrid is **undecided**, and it changes the schema substantially. |
| Versioning                    | Guidance must be correctable without rewriting history of past findings, which implies versioning.                                                                                                                                                    |
| Finding identity              | Stable keys across re-scans and across guidance revisions.                                                                                                                                                                                            |
| Severity provenance           | Which tool produced the severity and under which rule version, so a classification change is auditable.                                                                                                                                               |

**Owner decisions needed before Sprint 3 migrations:** where remediation content
lives (database vs repository vs hybrid), whether remediation is versioned per
finding, and whether severity rules are versioned.

### Sprint 4 — tenancy and billing

| Change                     | Consequence                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations` table      | New entity. Requires deciding the membership model, invites, and roles.                                                                                                                                       |
| `organization_id` backfill | Nullable column added to `users`, `sessions`, `audit_logs`, then backfilled, verified, then made `NOT NULL`. **Do not do this in a single migration** — see [ADR 0005](./adr/0005-deferred-multi-tenancy.md). |
| `subscriptions`            | Stripe customer/subscription mapping, plan state, and the metering that quotas need.                                                                                                                          |

The `organization_id` backfill runs against a **live** database and is the single
most dangerous migration in the project. It must be sequenced, backed up, verified
with a data-integrity check, and reversible. See
[ADR 0005](./adr/0005-deferred-multi-tenancy.md#reconsideration-trigger) for the
triggers that force this earlier than Sprint 4.

---

## Switching providers

Change `DATABASE_URL`. That is the whole procedure:

```dotenv
# Local Docker Postgres
DATABASE_URL=postgresql://vuldetected:vuldetected@localhost:5432/vuldetected?schema=public

# Supabase
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require
```

No code change, no compose change, no migration rewrite. That guarantee is
structural, and it is only true because of three enforced rules: no hardcoded
hostnames, no local unix socket paths, and no Postgres extensions beyond `citext`
and `gen_random_uuid()`. See
[ADR 0004](./adr/0004-database-provider-neutrality.md).

Two caveats, stated plainly:

- **Neutrality is structural, not proof.** A provider swap still needs a
  rehearsed cutover: dump, restore into the target, run migrations, verify. See
  [decisions-pending.md](./decisions-pending.md#supabase-vs-local-postgres).
- **Server-side features are a separate decision.** Supabase Row Level Security is
  _available_ without violating neutrality, but _using_ it is an authorization
  decision with an owner sign-off, not a configuration detail.
