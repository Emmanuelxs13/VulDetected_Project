# Security

Threat model for VulDetected. Seeded in Sprint 1 for Sprint 2 execution.

This document is a list of **non-negotiables** with an explicit mitigation status
for each item. An item without a status is a bug in this document.

## Status values

| Status                    | Meaning                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `Done`                    | Implemented and verified in the codebase.                                          |
| `Open (planned Sprint N)` | Not implemented. Named, scoped, and scheduled — deliberately not silently omitted. |
| `Open (Sprint 1)`         | In flight in the current sprint.                                                   |

---

## 1. Domain ownership verification — legal precondition

**Status:** `Open (planned Sprint 2)`

**Threat.** VulDetected scans web applications on request. If a user can submit
any hostname, the product is a scanning service for third-party systems — which
is unlawful in most jurisdictions regardless of intent, and is the fastest route to
an abuse complaint, a blocklist entry, or an injunction.

This is a **legal requirement, not a security feature.** No amount of rate limiting
or abuse scoring substitutes for it.

**Mitigation.** Ownership must be proven _before any job is enqueued_:

- **DNS `TXT` token** — the user places a generated token at `_vuldetected.<domain>`.
  We query it and compare.
- **`/.well-known/` file** — the user serves a generated file at a well-known path
  and we fetch it.

Either method is sufficient; supporting both costs little and covers domains where
the other is impractical. The proof is persisted with its method, the verifying
record, and a timestamp.

**The guard is code, tested — not convention.** The enqueue path must be
structurally incapable of running without a verified `domains` row. A test asserts
that every enqueue attempt without a proof fails.

## 2. SSRF hardening

**Status:** `Open (planned Sprint 2)`

**Threat.** The scan target is user-supplied. Without controls, it is a classic
server-side request forgery primitive pointed at the infrastructure the worker can
reach: cloud metadata endpoints (`169.254.169.254`) leaking credentials,
`127.0.0.1` services, internal admin panels, and RFC1918 hosts.

The worker has _deliberately broad_ egress — it must reach arbitrary targets — so
the guard cannot be "we don't expose anything interesting." It cannot be.

**Mitigation.**

- **Resolve DNS, then validate the resolved address.** Validating the hostname
  string is worthless; the string is attacker-controlled, the address is not.
- **Reject** loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`,
  `fe80::/10` — including cloud metadata), private ranges (`10/8`, `172.16/12`,
  `192.168/16`), and IPv6 equivalents. Rejecting IPv6 loopback matters as much as
  IPv4: an IPv4-only check is bypassed by `::1`.
- **Re-validate after every redirect.** A permitted URL that redirects to
  `169.254.169.254` bypasses any one-time check entirely. Every hop is resolved
  and re-checked; redirect chains are bounded.
- **Restricted ports.** An explicit allowlist (80, 443, and whatever a specific
  scanner template legitimately needs). No arbitrary ports.
- **DNS rebinding.** Resolve once, pin the validated address for the connection,
  and do not re-resolve mid-request to a different answer.
- **Timeouts and concurrency caps** per target, so a slow target cannot pin a
  worker slot.

**Verified by test, not by inspection.** The test suite must include redirect-based
and IPv6 bypass attempts; a passing test is the evidence that the control works.

## 3. Worker network isolation and filesystem isolation

**Status:** `Open (planned Sprint 2)`

**Threat.** The worker executes third-party scanner tooling against attacker-chosen
targets. A compromise there is one step from the rest of the platform.

**Mitigation.**

- **Separate network with filtered egress.** The worker reaches the internet (it
  must) but not the database, the Redis broker's credentials in a readable file, or
  the host's private network.
- **No database credentials in the worker.** It consumes jobs and posts results
  through a narrow channel. A worker that can write to `users` or `sessions` has
  the whole product's blast radius.
- **Read-only root filesystem**, `tmpfs` on `/tmp`. A scanner writing into its own
  image is a persistence mechanism.
- **Dropped capabilities**, `no-new-privileges`.
- **No host filesystem or socket mounts.** Docker socket access inside the worker
  is equivalent to root on the host.
- **Resource limits** — CPU, memory, and a hard timeout per scan.
- **No shell access from the request path.** User input must never reach a shell
  string; arguments are passed as an argv array.

## 4. Session security

**Status:** `Partially done` — implemented in Sprint 1, with one accepted residual
risk recorded under [Open findings](#open-findings-sprint-1)

**Threat.** Session hijacking via database exposure, cookie theft via XSS, CSRF, and
session fixation.

### What is actually in place

- **Passwords hashed with argon2id** via `@node-rs/argon2` — memory-hard,
  prebuilt binaries, no `node-gyp` on Windows. 19 MiB / 2 iterations /
  parallelism 1 (OWASP minimums), and input capped at 128 characters so the
  memory-hard hash cannot be used as an amplification vector.
- **`HttpOnly`** — JavaScript cannot read the session cookie, the strongest single
  mitigation against XSS-based token theft.
- **`SameSite=Lax`** — blocks cross-site request forgery on subrequests while
  still allowing top-level navigation, which emailed verification links require.
- **`Secure`** derived from `AUTH_URL`'s scheme. Not hardcoded `true`, because a
  hardcoded `Secure` cookie is silently dropped on `http://localhost`, which looks
  exactly like a broken login in development only.
- **Seven-day absolute expiry**, refreshed at most daily. Absolute, not sliding: a
  sliding window means a stolen cookie that keeps being presented never expires,
  which removes the property that makes cookie theft survivable.
- **Revocation is real**, because sessions live in the database — sign-out deletes
  the row; a revoked session cannot be replayed.
- **Authorization is re-checked in the data layer**, never delegated to middleware
  alone — see [architecture.md](./architecture.md#tb2-browser--nextjs-server).
- **`AUTH_SECRET` is 32+ bytes**, generated locally, never committed.
- **Account state is gated at session creation.** A `databaseHooks.session.create`
  `before` hook refuses to mint a session for a `suspended`/`deleted` account or an
  unexpired lockout. It runs before the row is persisted, which is the only point
  at which refusing is still meaningful.

### The session token is stored in the clear, and that is a real gap

`sessions.token` stores the **raw** session token. An earlier draft of this
document claimed it held a SHA-256 digest in a `token_hash` column. **That was
wrong**, and the error was ours, not the library's — the column does not exist in
the schema. Correcting it here rather than leaving a reassuring sentence in place
of a control that was never built.

The cause is a round-trip constraint in Better Auth `1.7.7`, verified against the
installed source:

1. Better Auth **generates** the token.
2. It **hashes** it with SHA-256 to decide what to store.
3. It **stores the digest**, then **returns `{ token, session }` built from the
   `RETURNING` clause** — i.e. the digest, not the token.
4. It derives the cookie from that returned value.

So a hash-on-write hook writes the digest, and the cookie then carries the digest.
The browser would hold a value the server cannot look up, and every login would
fail on the next request with no error at the point of the mistake.

**Why it is accepted for Sprint 1 rather than worked around:**

- The alternative is a hand-patched adapter or a forked dependency. A fragile
  local patch to an authentication library is a worse outcome than a documented
  risk: it looks like the problem is solved, and it breaks silently on upgrade.
- The exposure is scoped. A database dump yields session tokens, but the cookie is
  `HttpOnly` + `SameSite=Lax` + `Secure` in production, so exploiting this needs
  database read access, which is a prior breach in its own right.
- It is bounded in time: seven-day absolute expiry, and revocation is immediate.

**What must happen before any public launch** — tracked in
[ADR 0002](./adr/0002-authentication.md):

- Re-evaluate on every Better Auth minor upgrade, and check for a first-party
  hashing option before anything else.
- Prefer an upstream fix over a local patch if one is ever offered.
- Until then, treat `sessions.token` as a secret: restrict dump access, and never
  paste a row from it into an issue, a log, or a screenshot.

### Open findings (Sprint 1)

| Finding                                                                                                        | Severity | Status                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session tokens stored unhashed (above)                                                                         | Medium   | Accepted for Sprint 1; revisit before public launch                                                                                                                                              |
| `audit_logs.ip` comes from `x-forwarded-for` and is **unverified** — `advanced.trustedProxyHeaders` is `false` | Low      | Accepted: audit rows are explicitly non-security telemetry. Blocks any forensic use                                                                                                              |
| Client IP is read raw from `x-forwarded-for` in the auth actions, so it is attacker-controlled and may be a    | Low      | Accepted for Sprint 1; a malformed value causes the audit row to be dropped by the `inet` cast rather than a crash                                                                               |
| No account lockout on the registration path (by design — it would let anyone lock a victim out)                | Info     | Deliberate; the register endpoint's rate limit is the control that belongs there                                                                                                                 |
| Email verification not enforced before first login                                                             | Info     | Open product decision, `docs/decisions-pending.md`                                                                                                                                               |
| No Content-Security-Policy                                                                                     | Medium   | Open — deliberately deferred; a guessed CSP breaks Next's inline bootstrap or gets "fixed" with `unsafe-inline`, which is not a policy. Measure in report-only mode first. See `next.config.ts`. |
| No per-IP rate limiting on auth actions or registration                                                        | Medium   | Open, planned Sprint 2. Per-account lockout is implemented and does not cover these paths                                                                                                        |

## 5. Secrets never in git

**Status:** `Done`

**Threat.** A committed credential is a credential. `.env` in git is a
credential leak, and rotating it does not un-leak it — history keeps it.

**Mitigation.**

- **`.gitignore` covers `.env`, `.env.local`, `.env.*.local`, and explicitly
  re-includes `!.env.example`.** Only the example file — which must contain no real
  values — is tracked.
- **`.env.example` is the single source of truth** for variable names, and every
  value in it is either empty or a local development default.
- **Secrets are generated, never authored.** `AUTH_SECRET` is created locally with
  `openssl rand -base64 32`.
- **Credentials come from the environment at runtime**, never from constants,
  fixtures, or test defaults that could migrate into production code.
- **No credential reaches the browser.** `NEXT_PUBLIC_*` variables are public by
  definition and are treated as such.
- **Audit logs never record secrets** — no passwords, tokens, cookies, or
  authorization headers in `audit_logs.metadata`.

## 6. Rate limiting

**Status:** `Partially done` — per-account lockout implemented in Sprint 1; global
per-IP limiting still `Open (planned Sprint 2)`

**Threat.** Unthrottled endpoints invite credential stuffing, password spraying,
resource exhaustion through scan submission, and enumeration.

### Implemented in Sprint 1

- **Progressive per-account lockout**, not a flat ban. A flat 30-minute lock after
  5 attempts is a denial-of-service weapon: anyone who knows a victim's email can
  lock them out indefinitely by failing five times, forever.

  | Failed attempts | Lockout    |
  | --------------- | ---------- |
  | 5               | 1 minute   |
  | 8               | 15 minutes |
  | 11+             | 1 hour     |

- **The increment is atomic.** `failed_login_count = failed_login_count + 1` is
  evaluated by Postgres with `RETURNING`, so the read and the write are one
  statement. This is not a stylistic preference: under the earlier read-then-write
  version, N concurrent requests all read the same value and all wrote the same
  incremented value, so the ladder never advanced and **parallel requests bypassed
  the limit entirely**.
- **A successful login resets the counter**, so a real user who corrects a typo is
  not carrying yesterday's failures.
- **Account state is enforced at session creation**, so a lockout cannot be walked
  around by hitting the session endpoint instead of the login form.
- **Deliberately NOT applied to the registration path.** That form is
  unauthenticated and bypasses the sign-in rate limiter; letting it increment the
  counter would hand anyone who can submit a form a way to lock an arbitrary
  victim out — the exact denial of service the ladder exists to prevent.
- **Fail closed**: a lockout returns the same generic message as every other auth
  failure, so it cannot be used to confirm that an address is registered.

### Still open (Sprint 2)

- **Per-IP limiting is not implemented.** Better Auth's built-in limiter is keyed on
  the sign-in endpoint only; the Server Action path and the registration endpoint
  are not covered by it.
- **Scan submission is rate limited** — per user and per IP. A scan is a cost
  control as much as an abuse control: a scan is expensive and the attacker might
  not be the customer.
- **Fail closed on limiter outage.** If the limiter is unavailable, the endpoint
  is closed rather than open.
- **Noted interaction:** argon2id is intentionally slow, which makes rate limiting
  a genuine denial-of-service mitigation rather than optional hygiene. The
  constant-work decoy verify on unknown addresses inherits this cost on purpose,
  and is memoised per process so it cannot be turned into an amplification vector.

---

## Additional controls tracked here

| Control                                                 | Status                    | Notes                                                                                                      |
| ------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Audit trail for security events (OWASP A09)             | `Done` (schema)           | `audit_logs` is append-only; populated during Sprint 1 auth flows.                                         |
| Authorization enforced in the data layer                | `Open (planned Sprint 1)` | Not middleware-only.                                                                                       |
| Severity never communicated by color alone (WCAG 1.4.1) | `Done` (design)           | Color + icon + text on every severity badge; see [ADR 0003](./adr/0003-design-tokens-and-color-budget.md). |
| Automated contrast test for severity palette            | `Open (planned Sprint 1)` | Guarantees what "guaranteed contrast" means; a violation fails the build.                                  |
| Findings table contains no credentials                  | `Open (planned Sprint 2)` | Tool output may embed auth headers or tokens from the target; must be scrubbed before storage.             |
| Stored XSS in remediation content                       | `Open (planned Sprint 3)` | Remediation includes rendered code samples; rendering path must not inject HTML.                           |
| Domain takeover checks                                  | `Open (planned Sprint 3)` | Advisory: dangling DNS records on verified domains become a scan-and-report vector.                        |

## Deliberately out of scope for the MVP

Recorded so their absence is a decision rather than an oversight:

- WAF / rate limiting at the edge (delegated to the deployment platform).
- DDoS protection (platform concern).
- Multi-tenancy isolation controls (deferred to Sprint 4+ — see
  [ADR 0005](./adr/0005-deferred-multi-tenancy.md)).
- Formal third-party penetration test (post-MVP, before public launch).
