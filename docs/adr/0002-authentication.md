# ADR 0002: Authentication

- **Status:** Accepted
- **Date:** Sprint 1

## Context

Sprint 1 must deliver working authentication with email + password. The
non-negotiable properties:

- **Passwords are never stored in recoverable form.** A database leak must not
  yield usable credentials.
- **Session tokens are never stored recoverably either.** The database is a
  higher-value target than the session cookie jar, so a plaintext token column
  turns a read-only SQL injection into full session hijacking.
- **The setup works on a Windows workstation without a compiler.** A developer
  should not need Visual Studio Build Tools or WSL to register an account.
- **Sessions are server-authoritative.** Every protected request validates
  against Postgres. A signed-but-unvalidated cookie is not a session.

Two constraints narrowed the field significantly: we are on Node 22 with
Postgres, and we already decided on Drizzle as the data layer (see
[ADR 0001](./0001-monorepo-and-runtime-split.md) and
[ADR 0004](./0004-database-provider-neutrality.md)).

## Decision

### Better Auth with the Drizzle adapter, email + password only

- **Better Auth** provides the schema, session lifecycle, and the Drizzle
  adapter, so the session and account records follow one library's contract
  rather than something hand-assembled.
- **Email + password only for Sprint 1.** Social providers (Google, GitHub) are
  Sprint 4+ per the [roadmap](../roadmap.md#sprint-4--deferred).
- **argon2id password hashing via `@node-rs/argon2`.** argon2id is the current
  OWASP-recommended password hash: memory-hard, salted, and resistant to both
  GPU cracking and side-channel comparison attacks. The `@node-rs/` distribution
  ships **prebuilt native binaries** for Windows, macOS, and Linux, which
  removes `node-gyp` and its Build Tools requirement from the setup path.

### Session tokens are stored hashed — REVISED, this decision did not hold

> **This decision was reversed during Sprint 1 implementation, and the reversal was
> forced by the library rather than chosen.** The original text is kept below the
> correction so the record shows what was believed and why, not just what is true.

**The decision as originally written, which turned out to be unimplementable:**

- The raw session token exists **only** in the user's cookie.
- Postgres stores `sessions.token_hash` — a SHA-256 digest of the raw token —
  never the token itself.
- Lookup is by hash, so a stolen database dump yields hashes that cannot be
  replayed as cookies.

**Why it failed.** The assumption was that Better Auth would generate a raw token,
hand it to the cookie, and store something else. Verified against the installed
`1.7.7`, it does the opposite ordering:

1. Better Auth **generates** the raw token.
2. It **hashes** it with SHA-256 to decide what to store.
3. It **inserts the digest**, then builds its return value from the database's
   `RETURNING` clause — which yields the _digest_, not the token.
4. It derives the session cookie from that same returned value.

So Better Auth's "returned" token is the hash. A `databaseHooks.session.create.after`
hook that hashed the value before insert would store `hash(hash(token))` and hand
the browser `hash(token)`. On the next request the server would look up
`hash(token)`, not find it, and reject a session that was created correctly
milliseconds earlier. There is no insert-time hook that can avoid this, because the
value the cookie must contain is not the value the application controls at insert
time.

**The decision as implemented:**

- `sessions.token` holds the **raw** token. There is no `token_hash` column, and
  the schema never had one.
- The property is scoped and compensated rather than eliminated: 7-day absolute
  expiry (no silent renewal), `HttpOnly`, `SameSite=Lax`, `Secure` in production,
  immediate server-side revocation on sign-out, and account-state gating at session
  creation.
- The exposure is bounded by requiring prior database read access — a database
  dump is a prior breach, not a path to one.

**Rejected alternatives:**

- **Patch or fork the adapter.** Rejected: a hand-patched authentication library
  fails silently on upgrade, and it would _look_ like the problem was solved. That
  is worse than a documented gap, because the next engineer inherits false
  confidence instead of a known risk.
- **Store a digest in a second column and keep the raw token for lookup.** Rejected:
  it reintroduces the raw token into the database, so the dump risk — the entire
  point of the original decision — is unchanged, while the schema gets more
  complex.

**Revisit condition:** re-evaluate on every Better Auth minor upgrade, and check
for a first-party hashing option before anything else. Until then, treat
`sessions.token` as a secret — restrict dump access, and never paste a row from it
into an issue, a log, or a screenshot.

Tracked as an open finding in
[security.md](../security.md#4-session-security).

### Verification tokens are hashed where the library allows it

The same limitation does **not** apply to `verification_tokens`, and the distinction
is worth recording because it shows the constraint is specific rather than blanket.

- `identifier` **is** hashed, via `verification.storeIdentifier: 'hashed'`. The
  library defaults this to `"plain"`, so leaving it alone would have stored every
  address in the clear. The lookup path applies the identical transform, which is
  what makes hashed rows still findable.
- `value` is stored **raw**. `createVerificationValue` hashes the identifier only
  and passes the rest of the payload through untouched; the `storeToken` option
  that would cover it belongs to the magic-link plugin, not core email
  verification.

Accepted because the table is currently inert: `sendOnSignUp` is `false` and Sprint
1 has no mailer, so nothing writes a verification row. It must be resolved before
the first verification email is sent in Sprint 2.

### Cookies are httpOnly and SameSite=Lax

- **`HttpOnly`** — JavaScript cannot read the session cookie. This is the single
  most effective mitigation against token theft via XSS.
- **`SameSite=Lax`** — the cookie is not sent on cross-site subrequests, which
  blocks the classic cross-site request forgery vector while still allowing
  top-level navigations (an emailed verification link) to work.
- `Secure` in every non-local environment; omitted locally only because
  `http://localhost` is not a secure context.
- `AUTH_SECRET` must be 32+ bytes. It is generated locally and never committed.

## Consequences

**Accepted benefits**

- The setup works on Windows with no native toolchain. This is not a nicety; it
  removes the single most common reason a JS auth setup stalls on a new machine.
- One library owns the session lifecycle, so cookie rotation, expiry, and
  revocation follow a reviewed implementation instead of bespoke code.
- The Drizzle adapter keeps auth tables in the same schema and the same migration
  history as the rest of the product — no parallel, hand-managed table set.

**Accepted costs**

- **Session tokens are stored unhashed.** This is the single most significant cost of
  this decision, and it is a direct consequence of Better Auth's `1.7.7` token
  round-trip rather than a shortcut taken for convenience. A database compromise
  yields live session tokens instead of inert digests. Compensated by a 7-day
  absolute expiry, immediate revocation, `HttpOnly`/`SameSite=Lax`/`Secure` cookies,
  and account-state gating at session creation — but not eliminated. This must be
  resolved, or formally accepted with eyes open, before any public launch.
- **`verification_tokens.value` is unhashed** for the same structural reason, though
  the table is inert until Sprint 2 mail arrives.
- **Better Auth owns the shape of `users`, `sessions`, and `verification_tokens`.**
  Column-level control is partial, and deviating from its expectations is a
  source of subtle breakage. `verification_tokens` exists in Sprint 1 largely
  because the library expects it, even though verified-email enforcement is an
  open product question (see
  [decisions-pending.md](../decisions-pending.md#email-verification-before-first-login)).
- **argon2id is intentionally slow.** Login and registration are deliberately
  more expensive than a hash-and-compare. That is the point, and it makes
  rate limiting on auth endpoints mandatory rather than optional — see
  [`docs/security.md`](../security.md).
- **`@node-rs/argon2` is a native module**, so deployment targets must be
  linux-x64 or linux-arm64 (or win32 for local dev) with matching prebuilds. A
  platform without a prebuild falls back to a source build.
- One more dependency in the auth path. Accepted: writing authentication by hand
  is exactly the category of code that should not be improvised.

**Also required by Better Auth, and easy to miss**

- **`nextCookies()` plugin.** Without it, calling `auth.api.*` from a Server Action
  silently drops `Set-Cookie`: sign-in "succeeds", no error is raised, and the next
  request has no session. This is the worst bug shape available — no exception, no
  log line, and a bug report that just says "login is broken".
- **`'use server'` at the top of the Server Action module.** Without it, a client
  component importing the action drags `next/headers` into the client bundle. The
  build fails with an error about Server Components that points at the wrong file,
  and `tsc` reports nothing at all.
- **`advanced.database.generateId: 'uuid'`.** Our primary keys are
  `uuid DEFAULT gen_random_uuid()`. Better Auth's default id generator produces a
  32-character alphanumeric string, which Postgres rejects for a `uuid` column —
  so every signup would 500. With `'uuid'` set, Better Auth omits `id` from the
  INSERT and lets the database default supply it, putting the authority for
  uniqueness in Postgres where a constraint can enforce it.
- **`nextCookies` and `'use server'` are load-bearing, not stylistic.** All three
  items above were verified against the installed package rather than inferred from
  documentation.

## Alternatives considered

### Auth.js (NextAuth) with the Credentials provider — **rejected**

Rejected, and the reason is structural rather than a matter of taste:

- **It provides no user table.** The Credentials provider does not create or own
  a user model. Registering a user therefore requires a hand-rolled `users`
  table plus hand-rolled signup logic, and Auth.js's own docs treat this as
  user-managed territory.
- **It forces ad-hoc session storage.** With Credentials and database sessions
  you must wire a session table and adapter yourself, which is precisely the
  security-critical machinery that should come from a maintained implementation.
- **The credentials flow is a documented footgun.** NextAuth's own guidance
  treats credentials as requiring extra care (hashing, secure cookies, database
  sessions). Auth.js actively encourages OAuth providers, which is the opposite
  of what Sprint 1 needs — and it is why the maintained-core-credentials path is
  thinner than the OAuth paths.
- **The combination degrades to hand-rolled auth with a library in the middle.**
  That is the worst of both: the attack surface of custom auth plus an extra
  layer of configuration to keep in sync.

For an MVP whose entire auth surface is email + password, Auth.js Credentials
gives us the least structure for the most custom code.

### Roll our own sessions with signed cookies

Rejected. Rolling your own session implementation is a well-trodden path to
subtle replay, rotation, and fixation bugs. The cost of this decision is a
dependency; the cost of getting it wrong is an authentication bypass. Use the
reviewed implementation.

### bcrypt instead of argon2id

Rejected. bcrypt is not memory-hard and is GPU-friendly; argon2id is the current
OWASP recommendation. bcrypt is also implemented in pure JavaScript and is
_faster_, which in a password context is a disadvantage.

### Storing raw session tokens (the default-friendly path)

**Rejected as a choice — and then forced as a constraint.** These were two separate
conclusions that initially got conflated, and keeping them apart is the point:

- **Rejected on the merits.** If the token column is readable, every SQL injection,
  backup leak, or accidental dump becomes instant session theft. On its own terms
  this option is correct and worth real cost to get right.
- **Forced by the library.** Every application-side route to that outcome turned out
  to be blocked by Better Auth's `1.7.7` token round-trip — see the revised
  decision above. Hashing on write is not merely inconvenient here; it produces a
  session the server cannot subsequently resolve.

So the honest statement is that this is a known, scoped, and _currently
unavoidable_ deviation from good practice, with a documented revisit condition. It
is not a case of the mitigation having been considered and traded away.

### Firebase Auth / Supabase Auth / Clerk

- **Firebase Auth** — a separate identity system whose admin SDK requires
  service-account credentials in our environment, adding an operational
  dependency and a second source of truth for user records.
- **Supabase Auth** — would drag the entire Supabase decision into Sprint 1 while
  [ADR 0004](./0004-database-provider-neutrality.md) deliberately keeps the data
  layer provider-neutral.
- **Clerk** — a hosted commercial dependency with its own pricing, its own
  session model, and a hard coupling between our user table and theirs. Too much
  product surface before there is a product.

### JSON Web Tokens instead of database sessions

Rejected for now. JWTs remove the revocation problem only on paper: you cannot
invalidate a stateless token before expiry, so "log out everywhere" and "revoke a
compromised session" both stop working. Database sessions cost one indexed lookup
and give real revocation. Reconsider only if the lookup becomes a measured
bottleneck at scale.
