# Proposal: Sprint 3 - Severity classification, dashboard, per-vulnerability remediation

## Problem
Sprint 2 recorded every finding as unclassified with no remediation guidance. The product cannot communicate risk or tell developers/sysadmins/business owners how to fix issues.

## Goal
Ship deterministic severity classification, versioned remediation content, an enhanced dashboard with filtering and aggregated views, a finding detail page with remediation and copyable fix code, and CSV/JSON export.

## Scope
- Deterministic severity mapping by checkName and evidence/title (Critical/High/Medium/Low/Info/Unclassified), audited and tested.
- Static, version-controlled remediation registry with developer/sysadmin/business guides and syntax-checked code samples. Build fails if Critical/High rules lack remediation.
- Classify findings at write time in the scan callback.
- Finding detail view with rationale, remediation steps, and copyable fix code.
- Dashboard: severity breakdown, scan history, filterable findings list, posture trend placeholder.
- CSV/JSON export per scan with ownership checks.
- i18n for all new strings.

## Non-goals
- External CVE/NVD correlation, AI-generated remediation, runtime-loaded remediation from DB.

## Acceptance
- Every finding gets exactly one severity via documented rules; rationale visible in UI.
- Every Critical/High rule has remediation content for all three audiences and at least one code fix; samples pass syntax verification.
- Dashboard shows severity breakdown and filterable findings.
- Export works with ownership enforcement.
