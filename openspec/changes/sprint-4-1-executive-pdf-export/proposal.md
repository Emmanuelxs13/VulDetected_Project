# Proposal: Sprint 4.1 — Executive PDF export

## Problem
Sprint 3 stabilised severity and remediation, but teams need a shareable report for stakeholders (business/security) without copying from the web UI.

## Goal
Add a server-side PDF export (`/api/scans/[scanId]/export/pdf`) with ownership checks, showing severity breakdown, classification rules, findings and remediation guidance for critical/high findings, suitable for an executive/business audience.

## Scope
- API route generating PDF with `pdf-lib`
- Button on scan detail page
- i18n for new strings
- Tests if feasible

## Non-goals
- Charts/images, branding, email delivery, scheduled exports
- Editing/remediation tracking in PDF

## Acceptance
- Authenticated + owner only (401/404)
- Contains severity totals, classification rationale per finding shown, and remediation for critical/high
- Works for scans with zero findings
- Build/tests pass
