# VulDetected Roadmap

The authoritative plan for VulDetected. If a statement about scope exists in two
places, this file wins.

Last updated: Sprint 1, foundation commit.

## Status legend

| Status          | Meaning                                                                   |
| --------------- | ------------------------------------------------------------------------- |
| **Planned**     | Committed to a sprint, not started.                                       |
| **In progress** | Actively being built right now.                                           |
| **Done**        | Implemented and verified; the exit criteria are met.                      |
| **Blocked**     | Cannot proceed; waiting on an owner decision or an external dependency.   |
| **Deferred**    | Deliberately pushed out of the MVP; recorded here so it is not forgotten. |

## Sprint map

| Sprint    | Focus                                                                | Status      |
| --------- | -------------------------------------------------------------------- | ----------- |
| Sprint 1  | Monorepo, design system, email + password authentication             | In progress |
| Sprint 2  | URL input, domain ownership verification, scan worker, live progress | Planned     |
| Sprint 3  | Severity classification, dashboard, per-vulnerability remediation    | Planned     |
| Sprint 4+ | OAuth, billing, executive PDF exports, scheduled scans               | Deferred    |

---

## Sprint 1 — Foundation, design system, authentication

**Status:** In progress

**Goal:** a running local environment, a defensible architectural record, and a
user who can register and sign in.

### Deliverables

- Monorepo skeleton: pnpm workspaces + Turborepo, Node 22, `.nvmrc`, formatting
  and lint configuration shared across packages.
- `infra/docker-compose.dev.yml`: Postgres 16, Mailpit, Redis.
- Architecture Decision Records (ADR 0001–0005) covering the runtime split,
  authentication, design tokens, database neutrality, and deferred multi-tenancy.
- Threat model seed (`docs/security.md`) with every non-negotiable marked as
  `Open (planned Sprint N)` or `Done`.
- `apps/web`: Next.js App Router application.
- `packages/db`: Drizzle schema and the first migrations — `users`, `sessions`,
  `verification_tokens`, `audit_logs`.
- `packages/ui`: Tailwind v4 CSS-first `@theme` semantic tokens plus the base
  primitives (Button, Input, Card, Badge, Alert).
- Authentication: email + password via Better Auth, argon2id password hashing,
  hashed session tokens in Postgres.
- Design system: semantic token layer, severity palette, WCAG-compliant badges
  (color + icon + text), automated contrast test against the severity palette.
- `README.md` (root), `docs/` set, and `docs/changelog.md` as the running record.

### Exit criteria

- [ ] `pnpm install` completes cleanly on Node 22 with pnpm 10.
- [ ] `docker compose -f infra/docker-compose.dev.yml up -d` brings up Postgres
      healthy, Mailpit reachable, Redis reachable.
- [ ] Drizzle migrations apply cleanly to an empty database and can be re-checked
      with `drizzle-kit check` (after **owner sign-off**, see
      [database.md](./database.md#db-touch-points--owner-decision-required)).
- [ ] `pnpm check` (lint + typecheck + format:check) passes.
- [ ] A user can register, receive a verification email in Mailpit, sign in, and
      sign out, with the session surviving a page reload.
- [ ] Session tokens are stored hashed; the raw token never touches the database.
- [ ] The severity palette passes an automated contrast test (not a manual eyeball).
- [ ] No `organization_id` column exists anywhere in the schema.
- [ ] `docs/changelog.md` records everything added in this sprint.

---

## Sprint 2 — Input, ownership verification, scan worker, live progress

**Status:** Planned

**Goal:** the moment the product becomes real — a user submits a URL they own
and watches a scan run.

### Deliverables

- URL input with normalization, and rejection of anything that is not a
  well-formed public http(s) URL.
- Domain ownership verification, **mandatory before any job is enqueued**:
  - DNS `TXT` token challenge, and/or
  - a `/.well-known/` file challenge,
  - proof persisted with issue timestamp, method, and the verifying record.
- Tables: `domains`, `scans`, `findings`, `scan_events`.
- `services/scanner`: Python + Celery worker that orchestrates Nuclei and ZAP
  against the verified domain.
- SSRF hardening in the worker egress path: DNS resolution, rejection of
  private / loopback / link-local ranges, re-validation after every redirect,
  restricted port allowlist.
- Worker network isolation: filtered egress, read-only root filesystem, dropped
  capabilities.
- Real-time progress streamed to the browser (server-sent events) via
  `scan_events`.
- Rate limiting on scan submission and on auth endpoints.

### Exit criteria

- [ ] A scan cannot be enqueued without a verified ownership proof; the guard is
      covered by tests, not just by convention.
- [ ] SSRF defenses hold against redirects to `127.0.0.1`, `169.254.169.254`
      (cloud metadata), RFC1918 ranges, and IPv6 loopback — proven by tests.
- [ ] The worker runs with a read-only filesystem and cannot reach the Postgres
      credentials or the host's private network.
- [ ] A user sees live progress within 2 seconds of job start.
- [ ] Findings are stored in a normalized shape independent of the tool that
      produced them (Nuclei and ZAP both map to the same record).
- [ ] Scan submission is rate limited and the limit is enforced server-side.

---

## Sprint 3 — Severity, dashboard, remediation with code

**Status:** Planned

**Goal:** turn a raw finding list into something each audience can act on.

### Deliverables

- Severity classification: Critical / High / Medium / Low / Info, with a
  deterministic, documented mapping from tool findings — not a raw CVSS dump.
- Remediation content model: per-vulnerability guidance addressed to a
  developer, a sysadmin, and a business owner, including concrete fix code where
  a code change is the actual remedy.
- Content storage and versioning, so remediation guidance can be corrected without
  invalidating historical findings.
- Dashboard: scan history, per-domain posture trend, filterable finding list,
  severity breakdown.
- Finding detail view: description, evidence, affected endpoint, remediation
  steps, and copyable fix code.
- Export of findings to CSV/JSON for teams that need to file tickets.

### Exit criteria

- [ ] Every finding resolves to exactly one severity, with the mapping rule
      visible in the UI (no unexplained scores).
- [ ] Every Critical and High finding has remediation content; the build fails
      if a severity-bearing record exists without it.
- [ ] Remediation code samples are syntax-checked, not pasted from memory.
- [ ] The dashboard loads a domain with 10k findings without degrading (paged or
      cursor-based access, no unbounded query).
- [ ] A sysadmin and a business owner can each read their own view without a
      developer translating for them.

---

## Sprint 4+ — Deferred

**Status:** Deferred

Explicitly out of the MVP. Recorded so that "not built" is a decision rather than
an omission.

| Capability            | Why deferred                                                                                                    | Trigger to revisit                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Google / GitHub OAuth | Email + password proves the auth plumbing; OAuth adds provider config and redirect surface before it is needed. | Sprint 4, or on first request for enterprise onboarding |
| Stripe billing        | No metered value delivered yet — billing before scans work is premature.                                        | Sprint 4, after S3 proves retention and usage patterns  |
| Executive PDF exports | Requires the severity model to be stable; generating PDFs against a moving classification wastes effort.        | After Sprint 3 exit criteria pass                       |
| Scheduled scans       | Needs a scheduler with its own reliability story (retries, catch-up, timezone handling).                        | Sprint 4+ with the billing/metering model               |

---

## Deferred decisions

These are open or deliberately postponed. See
[decisions-pending.md](./decisions-pending.md) for the questions and
[adr/](./adr/) for the reasoning behind the ones that are already resolved.

### Supabase vs local Postgres — UNRESOLVED

Not blocked on a technical decision. Because the data layer is provider-neutral
(ADR 0004), the choice is a **single `DATABASE_URL` change**: Supabase's
connection string replaces the local Docker one and nothing in the application
code moves. What is still open is the _operational_ side — backup policy,
connection pooling (Supabase's transaction pooler vs a direct connection),
row-level security posture, and whether the free tier tolerates the scan volume
Sprint 2 will generate. Those answers need real usage data, not speculation.

The neutral position is deliberate: betting on one provider before the schema
has survived two schema-changing sprints would be premature.

### Multi-tenancy / organizations — deliberately deferred to S4+

Rationale and the reconsideration trigger live in
[ADR 0005](./adr/0005-deferred-multi-tenancy.md). Short version: adding
`organization_id` now means a NOT NULL column and a backfill on every table that
grows in Sprint 2 and Sprint 3, before a single real user has asked for it. The
cost is deferred, not the capability.

### Billing

Deferred with the rest of Sprint 4+. Stripe is not merely a payment page: it
forces a decision about quotas, metering, and what a "scan" costs, and that
decision should follow evidence about how long a real scan runs and what users
actually re-run.

### Scheduled scanning

Deferred. A scheduler introduces its own failure modes — missed runs, duplicate
runs, catch-up after downtime — that deserve a dedicated sprint rather than a
side feature in the MVP.

---

## How this document evolves

- Statuses are updated **as work lands**, not at the end of a sprint.
- New architectural decisions get a new ADR in `docs/adr/` and a link from here.
- Scope changes are recorded here first, so the reasoning survives the person who
  made it.
