# Open decisions

Questions waiting on the **owner**. These are product and operational calls, not
engineering tasks — engineering can build either side, so the choice is recorded
here instead of being made implicitly in code.

Related: [roadmap.md](./roadmap.md) → [Deferred decisions](./roadmap.md#deferred-decisions).

---

## 1. Database hosting — RESOLVED (twice)

**Status:** Resolved. **Local PostgreSQL 18 via pgAdmin 4**, for Sprint 1
verification.

The data layer is provider-neutral (see
[ADR 0004](./adr/0004-database-provider-neutrality.md)), so this was always a
`DATABASE_URL` edit. The owner first chose **Supabase**, then switched to a
**local PostgreSQL 18** server for Sprint 1 because it is already installed and
running on the development machine (18.3, port 5432, pgAdmin 4 alongside it).

Current runbook: [`local-postgres-setup.md`](./local-postgres-setup.md).
Supabase alternative, not executed: [`supabase-setup.md`](./supabase-setup.md).

**Provider neutrality was not tested, but it is load-bearing here.** Supabase chose
`Session pooler (5432)` over the transaction pooler because transaction mode
destroys session state and `postgres.js` pipelines by default. A local server has no
pooler at all, so the choice never arises — but the moment the project moves to
Supabase, that table applies again, and `LISTEN/NOTIFY` in Sprint 2 makes it a real
decision rather than a preference.

Remaining open sub-questions:

- Backups and retention policy.
- Whether to use Supabase Row Level Security as a second authorization layer. It
  is _available_ without violating neutrality, but _using_ it is an
  authorization decision, not a configuration detail. (Not applicable to a local
  server; this question only exists if/when Supabase is adopted.)
- Cost at production traffic.

---

## 2. Spanish or English UI copy?

**Status:** Unresolved.

The entire codebase, documentation, and commits are in English by contract. The
**product-facing UI copy** is a separate question and has not been decided.

Open sub-questions:

- Is the UI English only, Spanish only, or bilingual from the start?
- If bilingual, is it i18n from the first component, or English first with copy
  centralized so translation is possible later? Centralizing copy in Sprint 1 is
  cheap insurance; wiring full i18n before the copy exists is expensive.
- Do the three audiences (developer, sysadmin, business owner) read the same
  language? A business owner and the developer they hired may differ.

**Why it matters now:** retrofitting i18n touches every component, so "decide
later" has a real cost. It does not have to be decided _this_ week, but the
answer should be "centralize copy" or "go bilingual" rather than left implicit.

---

## 3. Email verification required before first login?

**Status:** Unresolved.

`users.email_verified` (boolean) exists so this can change without a migration. The
product question is whether an account can sign in before verifying.

- **Required before first login** — higher integrity; costs friction and a support
  path for people who never see the email.
- **Allowed before verification, with unverified accounts limited** — lower
  friction; the application must then enforce the limit, which is a real code path
  and a real place to get a check wrong.

Also open: whether an unverified account can create a scan at all.

**Note:** `account_status` currently defaults to `active`, because email verification
is disabled in Sprint 1 and no code path performs the transition yet. When this
decision is made, that default is the thing that changes — and changing it is a
migration, which is exactly why it needs an owner decision before Sprint 2 authors
`scans`.

---

## 4. Free-tier scan quota for the MVP

**Status:** Unresolved.

The number of scans a free account gets per month. This is a product decision with
a direct cost consequence, and it is blocked on knowing what a scan actually costs
in wall-clock time and worker capacity — which Sprint 2 measures rather than
predicts.

Open sub-questions:

- Scans per month, or per day? Monthly is easier to communicate; daily spreads load
  better.
- Does a re-scan of the same domain count as a new scan?
- Are concurrent scans limited separately from total volume?
- What happens at the limit: hard block, or a queued position?
- Does a failed scan count against the quota? (Recommendation: no — charging for
  our failures is indefensible.)

**Interim stance:** rate limiting exists in Sprint 2 to protect the system; the
_quota_ as a product concept waits for real cost data.

---

## 5. Retention period for scan results

**Status:** Unresolved.

How long `scans`, `findings`, and `scan_events` are kept.

- **Storage cost** — `scan_events` grows fastest and is the most likely to be
  trimmed first.
- **Security exposure** — raw tool payloads may contain endpoints discovered on
  the target, and possibly auth headers or tokens echoed back by the target. Longer
  retention means a longer exposure window. Scrubbing at write time is the correct
  fix; retention is a second line of defense.
- **Product value** — a security posture trend needs history; a finding that
  disappears undermines trust.
- **Regulatory** — depends on the customer's jurisdiction and their own obligations.

Open sub-questions: per-plan retention? user-visible deletion? an explicit "delete
all my data" path?

**Why it matters now:** retention is much cheaper to design into the Sprint 2
tables than to retrofit, because the deletion job and its cascades must exist from
the start.

---

## Resolved since the start of the project

Kept here so the reasoning is not lost.

| Question                   | Resolution                                                                 | Where                                                    |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| Database hosting           | Local PostgreSQL 18 via pgAdmin 4 (Supabase documented as the alternative) | [local-postgres-setup.md](./local-postgres-setup.md)     |
| Monorepo layout            | pnpm workspaces + Turborepo, Next.js App Router as the only TS backend     | [ADR 0001](./adr/0001-monorepo-and-runtime-split.md)     |
| Auth library               | Better Auth + Drizzle, email + password, argon2id                          | [ADR 0002](./adr/0002-authentication.md)                 |
| Design token strategy      | Tailwind v4 `@theme`, semantic tokens, color budget, never color-only      | [ADR 0003](./adr/0003-design-tokens-and-color-budget.md) |
| Database provider coupling | Provider-neutral; one `DATABASE_URL` change to switch                      | [ADR 0004](./adr/0004-database-provider-neutrality.md)   |
| Multi-tenancy timing       | Deferred to Sprint 4+ with a documented reconsideration trigger            | [ADR 0005](./adr/0005-deferred-multi-tenancy.md)         |
