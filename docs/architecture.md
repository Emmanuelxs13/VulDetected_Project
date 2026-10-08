# Architecture

System overview for VulDetected: what the pieces are, how a request flows through
them, and where the trust boundaries sit.

Read this first, then [`codebase-map.md`](./codebase-map.md) for the repository
layout and import rules, then the [ADRs](./adr/) for the reasoning, then
[`security.md`](./security.md) for the threat model.

## The three deployables

| Deployable                      | Technology                    | Responsibility                                                                                                                                 |
| ------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web** (`apps/web`)            | Next.js App Router on Node 22 | The entire product backend: auth, session validation, authorization, business rules, database access, UI, API routes, and the progress stream. |
| **Worker** (`services/scanner`) | Python + Celery               | Executes scans. Orchestrates Nuclei and OWASP ZAP against an already-verified domain. Holds no business rules and no session validation.       |
| **Database**                    | PostgreSQL 16                 | System of record for users, sessions, domains, scans, and findings. Never exposed to the public internet.                                      |

Supporting infrastructure: Redis (Celery broker and result backend, Sprint 2) and
an SMTP relay for transactional email (Mailpit locally).

The worker is a separate process on purpose — see
[ADR 0001](./adr/0001-monorepo-and-runtime-split.md). The single most important
consequence: **all product authorization logic lives in exactly one runtime.**

```
                            ┌───────────────────────────────────────────────┐
    Browser  ──── HTTPS ───▶ │  apps/web   Next.js App Router (Node 22)     │
    (cookie auth)           │                                               │
                            │  route handlers · server components · auth    │
                            │  session validation · business rules          │
                            └───────┬──────────────────────┬────────────────┘
                                    │                      │
                          SQL via DATABASE_URL      enqueue / progress
                                    │                      │
                    ┌───────────────▼──────────┐   ┌───────▼─────────────────┐
                    │  PostgreSQL 16           │   │  Redis 7                │
                    │  users · sessions ·      │◀──│  Celery broker          │
                    │  domains · scans ·       │   │  + result backend       │
                    │  findings · audit_logs   │   └───────▲─────────────────┘
                    └──────────────────────────┘           │ task / result
                                                           │
                                            ┌──────────────▼─────────────────┐
                                            │  services/scanner             │
                                            │  Python + Celery worker        │
                                            │  runs Nuclei + ZAP            │
                                            │  filtered egress              │
                                            │  read-only filesystem         │
                                            └──────────────┬─────────────────┘
                                                           │ outbound HTTP(S)
                                                           │ to VERIFIED targets only
                                                    ┌──────▼──────┐
                                                    │  Target     │
                                                    │  web app    │
                                                    │  (customer) │
                                                    └─────────────┘
```

Trust boundaries are marked `[TB]` and detailed below.

## Request flow — register and log in

```
 [TB1] Browser  ── HTTPS ──▶ [TB2] Next.js route handler
                                   │
                    ┌──────────────▼──────────────┐
                    │ 1. Parse and validate input │
                    │ 2. Check rate limit         │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ 3. Argon2id hash password   │
                    │    (deliberately slow)      │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ 4. Open pooled connection   │──▶ Postgres
                    └──────────────┬──────────────┘      [TB3]
                                   │
                    ┌──────────────▼──────────────┐
                    │ 5. Read user by citext     │
                    │    email; verify hash       │
                    └──────────────┬──────────────┘
                        fail ──────┴──────▶ append audit_logs entry
                        │                        (auth.login.failed)
                        ▼
                    ┌────────────────────────────┐
                    │ 6. Mint raw session token  │
                    │ 7. Store SHA-256 of token  │──▶ sessions.token_hash
                    │    (raw token NOT stored)  │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ 8. Set cookie: HttpOnly,   │
                    │    SameSite=Lax, Secure    │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ 9. Send verification email │──▶ SMTP / Mailpit :1025
                    └─────────────────────────────┘
```

**Every subsequent authenticated request repeats steps 5–7 in lookup form:** the
cookie's raw token is hashed, and the digest is looked up in `sessions.token_hash`.
An expired or unknown digest means an unauthenticated request — there is no
"trust the signature alone" path. That is why the database can be stolen without
handing over live sessions.

## Scan flow — planned, lands in Sprint 2

```
 [TB1] Browser ──▶ [TB2] Next.js
                     │
        ┌────────────▼─────────────────────────────────────┐
        │ 1. User submits a URL                          │
        └────────────┬────────────────────────────────────┘
                     │
        ┌────────────▼────────────────────────────────────┐
        │ 2. Reject anything malformed, non-http(s), or  │
        │    resolving to a private / loopback / link-    │
        │    local address                                │
        └────────────┬────────────────────────────────────┘
                     │  NOT verified → STOP HERE. No job is enqueued.
                     ▼
        ┌─────────────────────────────────────────────────┐
        │ 3. DOMAIN OWNERSHIP PROOF (legal requirement)   │
        │    • DNS TXT token, and/or                      │
        │    • /.well-known/ file                         │
        │    Persist method + record + verified_at         │
        └────────────┬────────────────────────────────────┘
                     │
        ┌────────────▼────────────────────────────────────┐
        │ 4. Rate limit, then insert `scans` (queued)     │──▶ Postgres
        └────────────┬────────────────────────────────────┘
                     │ Celery task
        ┌────────────▼─────────────┐        ┌──────────────▼────────────┐
        │ 5. Redis (broker)        │───────▶│ 6. Worker picks up task   │
        └──────────────────────────┘        └──────────────┬─────────────┘
                                                        │
        ┌───────────────────────────────────────────────────▼────────────┐
        │ 7. SSRF-hardened egress                                         │
        │    resolve DNS · reject private/link-local/loopback/IPv6 loopback│
        │    restricted port allowlist                                    │
        │    RE-VALIDATE after every redirect                             │
        └───────────────────────────┬────────────────────────────────────┘
                                    │
        ┌───────────────────────────▼────────────────────────────────────┐
        │ 8. Run Nuclei and ZAP against the verified domain              │
        │    emit progress events                                       │
        └───────────────────────────┬────────────────────────────────────┘
                                    │
        ┌───────────────────────────▼────────────────────────────────────┐
        │ 9. Normalize tool output → one `findings` shape                 │──▶ Postgres
        │    (Nuclei and ZAP must both map to the same record)            │
        └───────────────────────────┬────────────────────────────────────┘
                                    │
        ┌───────────────────────────▼────────────────────────────────────┐
        │ 10. Append `scan_events` for live progress                      │──▶ Postgres
        └───────────────────────────┬────────────────────────────────────┘
                                    │
        ┌───────────────────────────▼────────────────────────────────────┐
        │ 11. Worker posts result; browser stream updates live           │──▶ Browser
        └───────────────────────────────────────────────────────────────┘
```

Two properties of this flow are load-bearing:

- **Step 3 is a gate, not a feature.** Domain ownership verification exists because
  scanning a system you do not own is unlawful in most jurisdictions. No scan may
  be enqueued without it, and that guard is covered by tests — not by
  convention.
- **Step 7 is re-applied at every hop.** Validating the initial URL is not enough:
  a redirect to `169.254.169.254` or `127.0.0.1` defeats a one-time check. Each
  redirect target is resolved and re-validated.

## Trust boundaries

### [TB1] Browser ↔ server

Untrusted. The browser is fully under an attacker's control in a compromised or
hostile-client scenario. Everything arriving from it is untrusted input.

Controls: server-side validation on every field, no authorization decision in the
browser, `HttpOnly` + `SameSite=Lax` + `Secure` session cookies, no secrets ever
sent to the client, and `NEXT_PUBLIC_*` variables treated as public.

### [TB2] Browser ↔ Next.js server

The authenticated application surface. Session cookies are the only credential,
and they are checked against the database on every request.

Crossing this boundary in the wrong direction is the classic Next.js mistake:
placing authorization in middleware alone. **Server-side data access must validate
the session itself.** Middleware is a coarse filter, not the authorization
boundary; a route handler or server action that trusts middleware has no
authorization.

### [TB3] Web server ↔ PostgreSQL

The web server is trusted; the database holds the most sensitive state in the
system (hashed passwords, token digests, audit trail). It is never exposed to the
public internet — reachable only from the application network.

Controls: connections only via `DATABASE_URL`, TLS outside local development,
credentials from environment only, least-privilege role, pooled connections with
bounded size, and the parameterized queries Drizzle emits.

### [TB4] Web server ↔ worker (via Redis)

The worker is a **separate trust domain** from the web app, not a trusted
extension of it. Anyone who can write to the broker can ask the worker to scan a
host — which makes the broker a privileged channel.

Controls: Redis not exposed publicly, credentials from the environment, the broker
is not a general-purpose message bus, and the worker independently re-validates
every target against the SSRF rules. The worker trusts the queue for _what to do_
and **never** for _whether a target is safe_.

### [TB5] Worker ↔ target network

The most dangerous boundary, because the destination is attacker-influenced input.

Controls: filtered egress (only the ports and protocols scanning requires),
rejection of private / loopback / link-local / IPv6 loopback ranges after DNS
resolution, port restrictions, request timeouts and concurrency caps, a read-only
root filesystem with `tmpfs` on `/tmp`, dropped capabilities, and no host
filesystem or database mounts in the worker container. Full detail in
[`security.md`](./security.md).

### [TB6] Service ↔ external providers (Supabase, SMTP, Stripe)

Third-party processors holding real data. Credentials come from the environment,
never from git; outbound traffic is provider-specific and should not carry
credentials to unrelated hosts.

## Component flow at a glance

```
apps/web
  ├─ routes            /, /login, /register, /dashboard, /scans/*, /settings
  ├─ auth              Better Auth (email+password), argon2id, hashed sessions
  ├─ server-only data  drizzle queries in packages/db, session-validated
  └─ streams           SSE endpoint backed by scan_events

services/scanner (Sprint 2)
  ├─ celery app        consumes CELERY_BROKER_URL
  ├─ tasks             run_nuclei, run_zap
  ├─ guard             SSRF validation on the initial URL and every redirect
  └─ normalizer        tool output → findings shape
```

## Design constraints that follow from this architecture

- **One authorization runtime.** Every permission decision happens in Next.js. The
  worker never decides who may see what.
- **Worker has no business logic.** Keeping it narrow is what makes its isolation
  requirements achievable. If business rules creep in, the isolation model starts
  eroding.
- **The worker does not hold database credentials.** It receives a scan job and
  posts a result back through a narrow channel. If the worker can write directly
  to `users` or `sessions`, its blast radius after a compromise is the entire
  product.
- **Normalized findings are tool-independent.** Nuclei and ZAP must map onto one
  `findings` shape, otherwise severity classification in Sprint 3 becomes a
  per-tool special case.
- **Progress is append-only.** `scan_events` is written by the worker and read by
  the browser stream. Nothing rewrites history mid-scan.
