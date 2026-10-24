# Proposal: Sprint 4.3 — Scheduled scans

## Problem
Users need recurring scans to track posture over time. Roadmap had this in Sprint 4+ and we can implement incrementally.

## Goal
Add per-domain schedules (daily/weekly) with owner-scoped CRUD and a reliable runner.

## Scope
- DB schema: `scan_schedules` with ownership and timing
- Server actions/API to manage schedules
- UI on scan creation/detail
- Scheduler in web/worker (use existing Redis)
- i18n

## Non-goals
- Complex cron expressions UI, timezone selector beyond defaults
- Billing/quotas yet

## Acceptance
- Only verified domain owners can create schedules
- Schedules execute and create real scans
- Pausing/stopping works
- Tests pass
