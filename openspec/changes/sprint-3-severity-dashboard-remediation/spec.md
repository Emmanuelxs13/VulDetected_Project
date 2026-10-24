# Delta spec: Sprint 3 — severity, dashboard, remediation

## ADDED Requirements

### Requirement: Deterministic severity classification
Every finding SHALL resolve to exactly one severity from `critical | high | medium | low | info | unclassified` through a documented rule, and the rule that produced it SHALL be observable in the interface.

#### Scenario: Missing HSTS header
- **WHEN** a `security_headers` finding reports `strict-transport-security`
- **THEN** its severity is `high` and its rationale is `missingHsts`
- **AND** the finding detail page names that rule next to the evidence

#### Scenario: Unknown check
- **WHEN** a finding comes from a check the classifier does not know
- **THEN** its severity is `unclassified` with rationale `unknownCheck`
- **AND** no severity is guessed from the title

### Requirement: Remediation content completeness
Every rule capable of producing `critical` or `high` SHALL have remediation guidance for developer, system administrator and business audiences, plus at least one code fix. The build SHALL fail when this is violated.

#### Scenario: Rule gains a higher severity
- **WHEN** `RULE_SEVERITIES` declares a severity for a rule and the registry declares a different set
- **THEN** `completeness.test.ts` fails

#### Scenario: Code sample is broken
- **WHEN** a code fix fails to parse in its declared language
- **THEN** `completeness.test.ts` fails

### Requirement: Bounded dashboard reads
The dashboard SHALL NOT issue an unbounded query over findings. Severity counts SHALL come from an aggregate, and the findings list SHALL be cursor-paginated.

#### Scenario: Domain with 10 000 findings
- **WHEN** a user opens the dashboard
- **THEN** the severity breakdown is computed by `GROUP BY` returning at most six rows
- **AND** the findings list returns at most 50 rows plus a cursor
- **AND** the posture trend reads at most the newest 40 completed scans

### Requirement: Posture trend per domain
The dashboard SHALL show, per domain, the high+critical count of the newest completed scan compared with the scan before it.

#### Scenario: First completed scan of a domain
- **WHEN** a domain has only one completed scan
- **THEN** the trend shows "first scan" instead of a delta

### Requirement: Ownership-scoped finding access and export
Reading one finding or exporting a scan SHALL require the same ownership chain the write used (`findings → scans → domains → userId`).

#### Scenario: Another account's scan id
- **WHEN** an authenticated user requests an export for a scan they do not own
- **THEN** the response is `404`

#### Scenario: Unauthenticated export
- **WHEN** a request reaches the export route without a session
- **THEN** the response is `401`

### Requirement: i18n key integrity
Every statically referenced translation key SHALL exist, and every locale SHALL declare the same key set.

#### Scenario: Key referenced but missing
- **WHEN** a component calls `t('some.key')` and the dictionaries lack it
- **THEN** `messages.test.ts` fails
