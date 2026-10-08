# Architecture Decision Records

An ADR captures a decision that was **not** obvious, together with the context
that made it reasonable and the consequences it creates. The point is not to
document what the code does — the code does that — but to record _why a
reasonable engineer might have chosen otherwise_.

## Format

Every ADR uses the same six sections:

| Section                     | Purpose                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| **Title**                   | The decision, stated as a choice.                                     |
| **Status**                  | `Proposed`, `Accepted`, or `Superseded by ADR-NNNN`.                  |
| **Context**                 | The forces and constraints that made a decision necessary.            |
| **Decision**                | What we chose, concretely enough to act on.                           |
| **Consequences**            | What becomes easier, what becomes harder, and what we accept as cost. |
| **Alternatives considered** | What else was on the table and why it lost.                           |

## Rules

1. Write the ADR **when the decision is made**, not retroactively. A decision
   recorded after it ships is a rationalization, not a record.
2. Do not edit the substance of an accepted ADR. Supersede it with a new file
   and update the old one's Status line — the history of the reasoning is the
   entire value.
3. Keep consequences honest. If a decision is expensive, say so; a record that
   only lists benefits is marketing.
4. Every meaningful architectural choice gets one. If you are debating whether
   something qualifies, it qualifies.

## Index

| ADR                                              | Status   | One-line summary                                                                                               |
| ------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| [0001](./0001-monorepo-and-runtime-split.md)     | Accepted | pnpm + Turborepo monorepo; Next.js App Router is the only TS backend; Python exists solely to drive Nuclei/ZAP |
| [0002](./0002-authentication.md)                 | Accepted | Better Auth + Drizzle, email/password, argon2id, hashed session tokens                                         |
| [0003](./0003-design-tokens-and-color-budget.md) | Accepted | Semantic tokens defined once in Tailwind v4 `@theme`; severity colors never used alone                         |
| [0004](./0004-database-provider-neutrality.md)   | Accepted | Data layer stays provider-neutral: everything through `DATABASE_URL`                                           |
| [0005](./0005-deferred-multi-tenancy.md)         | Accepted | No `organization_id` in Sprint 1; rationale and reconsideration trigger                                        |
