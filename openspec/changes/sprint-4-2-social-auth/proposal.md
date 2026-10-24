# Proposal: Sprint 4.2 — Social auth (Google/GitHub)

## Problem
Auth is email/password only. Adding OAuth is a natural next step and listed as the first Sprint 4 item.

## Goal
Enable Google and GitHub sign-in via Better Auth, configurable by env vars and hidden when unconfigured.

## Scope
- Server: `socialProviders` in auth config
- Client: social buttons on login/register
- i18n strings
- Env example update

## Non-goals
- Account linking UI, org-level SSO, MFA

## Acceptance
- Buttons only appear if provider credentials exist
- Existing email/password flow unchanged
- Account status hooks still apply
- Tests/checks pass
