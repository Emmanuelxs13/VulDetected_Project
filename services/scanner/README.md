# VulDetected scan worker

Python + Celery consumer for the scan domain. A job published by the web app to
the Redis broker is consumed here, re-validated against the SSRF rules, executed
as a set of deterministic checks, and reported back over an authenticated
callback. **The web app is the only runtime that writes scan state**; this worker
never talks to Postgres.

## Status

Sprint 2, task 1.2: package and test-runner skeleton only. The Celery app,
`scanner.tasks.run_scan`, the hardened egress client, the checks and the callback
reporter land in task 4.4 (design D10).

## Running tests

```bash
cd services/scanner
pytest
```

`pyproject.toml` declares the runtime dependencies (Celery, Redis, httpx) and the
dev extras (`pytest`, `pytest-asyncio`). Tests import the package straight from
the source tree, so no install step is required for a local test run.
