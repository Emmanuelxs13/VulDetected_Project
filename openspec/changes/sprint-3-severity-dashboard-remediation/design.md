# Design: Sprint 3

## Decisions

### D1. Severity is a pure, auditable function, not a stored score
`apps/web/src/lib/severity/classify.ts` maps `(checkName, evidence, title)` to exactly one severity plus a rationale key. It is pure and deterministic; the same finding always yields the same severity, and the UI can show *why* from the rationale key. The roadmap rejects a CVSS-style number because a reader must be able to audit the rule.

`critical` is deliberately unreachable today: none of the four checks can prove remote code execution. Reserving it keeps the colour meaningful (ADR 0003 §5).

### D2. Remediation content is a typed static module, not a database table
The roadmap requires two build-time guarantees: a failure when a Critical/High rule has no guidance, and a syntax check for every code sample. Neither can be produced by a database row. `apps/web/src/lib/remediation/registry.ts` is therefore a typed array; `completeness.test.ts` asserts coverage and parses each sample (TypeScript compiler for TS/JS, structural brace/quote checks for nginx).

`version` fields let guidance be corrected without touching stored finding severity: historical findings keep their classification, the detail view renders the current guidance.

### D3. Classification happens at write time, in the web app
The callback route is the single writer of scan state (Sprint 2 invariant). It calls `classifyFinding` per finding inside the same transaction that inserts rows, so a stored finding always has a final severity. The worker stays ignorant of severity: it reports observations, the web app decides.

### D4. Detail and export are ownership-scoped the same way as the scan page
Both join `findings -> scans -> domains` and filter on `domains.userId = session.user.id`. A scan id or finding id is not a secret; the read proves the same ownership link the write did.

### D5. Dashboard reads are bounded
Each query has a hard `limit` (20 scans, 100 findings). Filtering by severity is applied after the bounded read so a single user cannot force an unbounded table scan from the dashboard.

## Data flow
worker -> callback (classify) -> findings.severity
findings -> classify.rationale + remediationRegistry[checkName] -> detail view
findings -> dashboard aggregates / CSV / JSON -> export route
