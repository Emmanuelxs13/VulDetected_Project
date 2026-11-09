# Runtime Validation Report

**Generated:** 2026-11-09T13:06:00-05:00  
**Target:** `D:\Programación\VulDetected_Project`  
**Scope:** Sprint 1 end-to-end verification

## Summary

| Step           | Status     | Exit code | Details                                                                                      |
| -------------- | ---------- | --------: | -------------------------------------------------------------------------------------------- |
| Startup        | PASS       |         0 | Next.js responded on the isolated local validation port; vulnerable fixture responded on 8099. |
| Infrastructure | PASS       |         0 | Isolated PostgreSQL schema migrated and seeded; Redis and Mailpit available.                  |
| Typecheck      | PASS       |         0 | 3/3 workspace packages.                                                                        |
| E2E suite      | PASS       |         0 | 1 file, 12 tests.                                                                              |
| Scanner tests  | PASS       |         0 | 85 pytest tests.                                                                               |
| SSRF tests     | PASS       |         0 | 57 SSRF-focused tests.                                                                          |
| Build          | PASS       |         0 | Next.js production build completed.                                                            |
| Browser flow   | PASS       |         0 | Login, ownership verification, scan detail, progress events and findings verified in browser. |
| Real scan      | PASS       |         0 | 10/10 checks; 33 findings persisted (6 critical, 9 high, 14 medium, 3 low, 1 informational). |
| Exports        | PASS       |         0 | CSV 200/7,924 bytes; JSON 200/13,607 bytes; PDF 200/16,279 bytes.                             |

## Evidence verdict

```text
environment:
  docker: AVAILABLE — docker info succeeded; Docker Desktop context desktop-linux
  node: AVAILABLE — v22.14.0
  playwright: AVAILABLE — browser validation executed against the running Next.js app
  infra-tier: PRIMARY — local PostgreSQL plus Redis/Mailpit
  browser-tier: PRIMARY — browser flow executed with the integrated browser
startup: PASS — isolated Next.js server and vulnerable fixture responded
integration: PASS — exit_code: 0; schema, callbacks and persistence verified
e2e: PASS — exit_code: 0; 12 automated tests plus real browser scan flow
overall: PASS — Sprint 1 scan pipeline verified end to end
```

## Known gaps

- The validation database is the isolated local `vuldetected` database; production
  credentials and `.env.local` remain outside Git.
- The real scan used the local vulnerable fixture and the worker's explicit
  non-production demo allowance; production rejects private targets.
- Nuclei and ZAP adapters were tested with fixtures; their external binaries
  were not required for the built-in checks used by this Sprint 1 flow.
