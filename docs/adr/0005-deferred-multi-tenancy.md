# ADR 0005: Deferred multi-tenancy

- **Status:** Accepted
- **Date:** Sprint 1

## Context

Every serious SaaS eventually needs organizations: users belong to an
organization, organizations own scans and findings, and access is scoped
accordingly. The question for Sprint 1 is whether to model that now.

The standard counter-pressure: building a data model without organizations is
work that gets thrown away. If `scans` has no `organization_id`, every query
becomes "all scans in the system," which is both incorrect the moment there are
two customers and expensive to retrofit.

That pressure is legitimate but easily over-applied. Sprint 1 ships
authentication only — four tables, no domain or scan data at all. The tables that
will actually need tenancy (`scans`, `findings`, `domains`) do not exist yet and
are Sprint 2 work, with Sprint 3 adding remediation content on top.

## Decision

**No `organization_id` column in Sprint 1.** Sprint 1 is scoped to single-tenant
per-user data. Organizations are deferred to Sprint 4+, recorded here with their
rationale and their reconsideration trigger.

Concretely, in Sprint 1:

- `users`, `sessions`, `verification_tokens`, `audit_logs` exist with **no**
  organization reference.
- `verification_tokens` is a global token table; it is not an ownership
  statement and needs no tenancy column.
- No `organization_id` exists anywhere in the schema.
- `audit_logs` stays append-only (OWASP A09: security logging and monitoring),
  so its shape is largely stable regardless of tenancy.

The multi-tenancy **model** is designed now even though the **column** is not
added: authorization will read through a single boundary function that resolves
"which resources may this subject see" — a seam that today resolves to "everything
this user owns" and later resolves to "everything in this user's organizations."
Authorization code goes through that seam from Sprint 1 rather than inlining
`WHERE user_id = ?` at each call site.

## Rationale

- **The cost is smaller than it looks, because the tables do not exist yet.** The
  expensive part of adding `organization_id` is a backfill across existing rows
  in existing tables. `scans`, `findings`, and `domains` have zero rows at Sprint
  1. Adding the column in Sprint 2 is a `CREATE TABLE`, not a `ALTER TABLE` plus
     a backfill plus a migration-verification exercise.
- **The expensive tables are cheap to add later.** `users`, `sessions`,
  `verification_tokens`, and `audit_logs` each gain a nullable
  `organization_id` later, followed by a backfill and a `NOT NULL` constraint —
  a bounded, well-understood operation on small tables.
- **Speculative schema is still schema.** A `organizations` table plus an
  `organization_id` on four tables forces decisions before there is evidence:
  membership model (invites? domains? seat limits?), the default organization for
  a new signup, the personal-or-team question, and billing linkage. Guessing those
  now means either building a model we will rewrite, or building nothing useful.
- **Single-tenant is a legitimate MVP.** Each user scans their own domains and sees
  their own findings. That is a coherent, shippable product.
- **Retrofitting is a normal migration, not an emergency rewrite.** Drizzle makes
  it explicit and reviewable — provided it is done as a deliberate Sprint 4 task
  rather than discovered under pressure.

## Consequences

**Accepted benefits**

- Sprint 1 stays small and honest about what it does not know.
- The first schema is simple to read, review, and reason about.
- Multi-tenancy is designed in at the **authorization seam** where it is cheap,
  instead of in the schema where it is expensive and premature.

**Accepted costs**

- **`WHERE user_id = ?` will appear in queries during Sprints 2 and 3** and will
  need revisiting. Accepting this cost is the whole point of the decision, and it
  is bounded: the rewrite is in query predicates, not in business logic, provided
  authorization goes through the seam described above.
- **No organization-level roles** (owner / admin / member) until Sprint 4+.
- **No shared scanning**, no cross-user visibility, no seat management.
- **The S4 migration is real work**, on a live database, during a sprint that will
  also carry OAuth and billing. It should be scheduled, not absorbed.

## Reconsideration trigger

Reopen this decision as soon as **any** of the following becomes true. These are
triggers, not suggestions:

1. **A user asks to share access** with a colleague, an agency client, or a
   client organization.
2. **A second user must see the same user's scans** — a single account used by a
   team is the classic precursor to tenancy.
3. **A customer requests an audit trail or export scoped to their organization**
   rather than to themselves.
4. **Billing introduces seats or per-organization quotas** — Stripe's customer,
   subscription, and seat concepts are organization concepts.
5. **An agency or managed-service model appears**, where one operator manages
   many unrelated customer domains.
6. **The S4 sprint is confirmed**, which is the earliest planned point for
   `organizations`.

**On reconsideration, the sequence is:** create `organizations`, add a nullable
`organization_id` to the tenancy-bearing tables, backfill, verify with a data
integrity check, then add `NOT NULL` — never all at once. The owner must be
notified before that migration is authored, per
[`docs/database.md`](../database.md#db-touch-points--owner-decision-required).

## Alternatives considered

### Add `organization_id` to everything now

Rejected. It makes Sprint 1's four tables speculative, forces a membership and
default-organization model before any user exists, and buys almost nothing —
because the tables that matter for tenancy (`scans`, `findings`, `domains`) do
not exist yet and can simply be _created_ with the column.

### `organizations` table now, no FKs yet

Rejected. A table with no referencing columns and no code path creates the
appearance of multi-tenancy while providing none of the guarantees. It also makes
the eventual migration harder to reason about, because the code will already
appear to handle organizations.

### Row Level Security (RLS) as a substitute for a tenancy column

Rejected as a substitute. RLS is a powerful _second_ authorization layer, but it
requires an `organization_id`-like column to key on, and it is Postgres-specific
— which conflicts with the provider-neutrality rules in
[ADR 0004](./0004-database-provider-neutrality.md). It remains an option as
defense-in-depth once tenancy exists, pending an owner decision.

### Document-only multi-tenancy (write the design, skip the schema)

Partially adopted. The authorization seam and this ADR are that design. The schema
change is deliberately not pre-applied.
