# Tasks: Sprint 3 — severity, dashboard, remediation

## 1. Severity classification (SEV)
- [x] 1.1 `lib/severity/classify.ts`: pure `(checkName, evidence, title) → {severity, rationale}`
- [x] 1.2 Reserve `critical` with a documented reason
- [x] 1.3 `RULE_SEVERITIES` as the single reachability table
- [x] 1.4 Unit tests for every branch, determinism and reachability
- [x] 1.5 Classify at write time in `api/scans/[scanId]/callback/route.ts`

## 2. Remediation content (RM)
- [x] 2.1 `lib/remediation/registry.ts` with `RemediationEntry` (three audiences, code fixes, version)
- [x] 2.2 Entries for `security_headers`, `cookies`, `tls`, `redirects`
- [x] 2.3 `completeness.test.ts`: coverage, registry/classifier agreement, syntax verification
- [x] 2.4 Reject a DB table for remediation content (design.md D2)

## 3. Finding detail (FD)
- [x] 3.1 Ownership-scoped query (`findings → scans → domains → userId`)
- [x] 3.2 Evidence, classification rule, three remediation guides, copyable code
- [x] 3.3 Detail links from the findings list

## 4. Dashboard (DB)
- [x] 4.1 Severity counts via `GROUP BY` (bounded)
- [x] 4.2 Findings list paginated by cursor `(created_at, id)`, 50 per page
- [x] 4.3 Severity filter on the findings list
- [x] 4.4 Posture trend per domain over the newest 40 completed scans
- [x] 4.5 Recent scans table
- [x] 4.6 Shared `FindingsPagination` component

## 5. Export (EX)
- [x] 5.1 CSV/JSON export route with session + ownership checks
- [x] 5.2 CSV escaping for comma, quote and newline
- [x] 5.3 Export links on the scan detail page

## 6. i18n (INT)
- [x] 6.1 Keys for severity, remediation, evidence, pagination, filters, trend
- [x] 6.2 Remove the stale "Sprint 2 records everything as Unclassified" copy
- [x] 6.3 `messages.test.ts`: key resolution + locale parity

## 7. Verification
- [x] 7.1 `pnpm check` (lint, typecheck, format)
- [x] 7.2 `pnpm --filter @vuldetected/web test` — 104 tests
- [x] 7.3 `next build` succeeds
- [ ] 7.4 Measure the dashboard against a domain with 10 000 findings (needs owner decision on test data)
