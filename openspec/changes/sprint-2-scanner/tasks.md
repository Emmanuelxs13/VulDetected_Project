# Tasks: Sprint 2 — dominio de escaneo (`sprint-2-scanner`)

## Review Workload Forecast

Líneas estimadas ~3,000–4,500 · Riesgo 400: High · PRs encadenados: Yes · Entrega: ask-on-risk

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Unidades de trabajo sugeridas

| Unidad | Objetivo | PR | Prueba focal | Harness | Rollback |
|--------|----------|----|--------------|---------|----------|
| 1 | Test tooling (~120) | PR 1 | `pnpm --filter @vuldetected/web test` | Suite trivial | Configs/scripts |
| 2 | Esquema scan (~250) | PR 2 | `pnpm typecheck` (db) | `drizzle-kit check` | Schema |
| 3 | Migración `0003` owner (~120) | PR 3 | `drizzle-kit check` | N/A sin `db:migrate` | SQL `0003` |
| 4 | SSRF ambos (~350) | PR 4 | `vitest` + `pytest -k ssrf` | Red fixture | `ssrf.ts`/`.py` |
| 5 | Ownership + guard (~350) | PR 5 | `vitest ownership` | Reto DNS/well-known | `features/scans/*` |
| 6 | Envío + Celery + limiter (~450) | PR 6 | `vitest celery` | Fixture dorado + broker | `lib/*` |
| 7 | Worker Python (~900) | PR 7 | `pytest` | Compose egress | `services/scanner` |
| 8 | Callback + SSE (~400) | PR 8 | `vitest routes` | Harness HTTP | 2 rutas |
| 9 | UI scans (~500) | PR 9 | `vitest` + humo | Navegador `/scans` | Páginas |
| 10 | E2E + infra + docs (~400) | PR 10 | `pnpm test:e2e` | Compose E2E | Compose/.env/docs |

## Fase 1 — Foundation

- [x] 1.1 Vitest en `apps/web/vitest.config.ts` y `packages/db/vitest.config.ts`.
- [x] 1.2 pytest en `services/scanner/pyproject.toml`; `pnpm check` gate. (`pnpm test:e2e` queda diferido a la tarea 5.3: necesita el arnés E2E de compose, que aún no existe.)

## Fase 2 — Esquema y migración

- [x] 2.1 Enums, tablas (`domains`, `scans`, `findings`, `scan-events`), grafo y barrel en `packages/db/src/schema/`.
- [x] 2.2 **STOP owner**: avisar antes de `db:generate`; crear `packages/db/drizzle/0003_scan_domain.sql`; **no `db:migrate`**; `drizzle-kit check` verde.

## Fase 3 — Seguridad

- [x] 3.1 RED+impl SSRF Node en `apps/web/src/lib/ssrf.ts` + reglas en `docs/security.md` (loopback/metadata/RFC1918/`::1`; pin; hops; 80/443).
- [x] 3.2 RED+impl SSRF pytest en `services/scanner/scanner/ssrf.py` (redirect, IPv6, rebinding, puertos).
- [x] 3.3 `apps/web/src/features/scans/schema.ts` + `apps/web/src/features/scans/actions.ts`: ownership (`verification-tokens.ts` read-only) + guard `requireVerifiedDomain`; DO-2/DO-4/DO-5.

## Fase 4 — Envío, worker, wiring web

- [x] 4.1 `apps/web/src/lib/{redis,celery,rate-limit}.ts`; env en `apps/web/src/lib/env.ts`; fixture dorado (SS-4).
- [x] 4.2 `submitScanAction` en `apps/web/src/features/scans/actions.ts` (SS-1..SS-6): `queued` antes de encolar; fallo → 503.
- [x] 4.3 Limiter IP en `apps/web/src/app/api/auth/[...all]/route.ts`; `apps/web/src/lib/audit.ts` (`scan.enqueued`, `scan.failed`, `domain.ownership.*`).
- [x] 4.4 Worker `services/scanner/scanner/{__init__,tasks,egress,report}.py`, `checks/*`, `Dockerfile` (Bearer; read-only; cap_drop).
- [x] 4.5 RED callback `apps/web/src/app/api/scans/[scanId]/callback/route.ts`: `timingSafeEqual`, 401, idempotencia.
- [x] 4.6 RED SSE `apps/web/src/app/api/scans/[scanId]/events/route.ts`: polling 1s, cursor, autorización (SP-3).

## Fase 5 — UI, integración, docs

- [x] 5.1 Páginas `apps/web/src/app/scans/page.tsx`, `apps/web/src/app/scans/[scanId]/page.tsx` + `features/scans/components/*`; copy español.
- [x] 5.2 Servicio `scanner` en `infra/docker-compose.dev.yml`; `.env.example` (+`SCANNER_CALLBACK_SECRET`, `SCANNER_EGRESS_MODE=strict`; −`SCANNER_SERVICE_URL`).
- [x] 5.3 E2E `SCANNER_EGRESS_MODE=test`: encolar→consumir→callback→filas; dedup `ON CONFLICT`.
- [x] 5.4 Docs `docs/database.md`, `docs/architecture.md`, `docs/security.md`, `docs/codebase-map.md`, `docs/changelog.md`; citas TB1–TB6, Badge `unknown` (`packages/ui` read-only), puerto 6543.
- [x] 5.5 Gate final: `pnpm check`, `pnpm test:e2e`, `pytest`.