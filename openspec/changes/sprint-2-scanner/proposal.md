# Proposal: Sprint 2 — dominio de escaneo (`sprint-2-scanner`)

## Intent

Producto real: el usuario prueba propiedad de un dominio, lanza un escaneo y ve
progreso en vivo. No hay código de escaneo ni runner de pruebas
(`docs/roadmap.md`, Sprint 2).

## Scope

### In Scope

- URL normalizada; rechazo de http(s) no público.
- Ownership obligatorio antes del encolado (DNS `TXT` y `/.well-known`), con
  método, registro y `verified_at`.
- Tablas `domains`, `scans`, `findings`, `scan_events` + enums `scan_status`,
  `severity`.
- Worker `services/scanner` (Python + Celery) anti-SSRF y aislado.
- SSE en vivo sobre `scan_events`.
- Rate limiting en escaneos y auth.
- Runners: Vitest (web/packages) y pytest (worker).

### Out of Scope (non-goals)

- Nuclei/ZAP real, clasificación de severidad, retención/TTL, escaneos
  programados, dashboards, exportaciones.

## Capabilities

### New

- `scan-domain-model`: tablas, enums, finding normalizado.
- `domain-ownership`: prueba de propiedad y guard de encolado.
- `scan-submission`: URL, anti-SSRF, rate limit, ciclo de vida.
- `scan-worker`: Celery, egress SSRF-endurecido, aislamiento, callback.
- `scan-progress`: `scan_events` append-only y SSE.

### Modified

- None.

## Approach

1. **Python + Celery + Redis** (ADR 0001); TS/BullMQ solo como disparador de
   reconsideración.
2. **La web es la única escritora** de findings/eventos/estado; el worker
   devuelve por canal autenticado (`SCANNER_CALLBACK_SECRET`).
3. Despacho: **broker Redis/Celery**, no HTTP; `SCANNER_SERVICE_URL` se retira
   (contradicción resuelta).
4. Ownership reutiliza `verification_tokens` (`purpose='domain_ownership'`) + fila
   en `domains`; guard con tests.
5. SSE sobre polling corto de `scan_events`; `LISTEN/NOTIFY` solo hosting-gated
   (ADR 0004).
6. Enum `severity` + columna ahora; clasificación en S3.

## Owner decisions for design

- Unicidad de `normalized_hostname` entre cuentas.
- Dedup: intra-escaneo vs entre re-escaneos.
- Limiter vs cuota de producto.
- ¿Cuenta sin email verificado puede escanear?
- Puerta de hosting para `LISTEN/NOTIFY`.
- Ciclo de vida en la UI.

## Affected Areas

`packages/db/src/schema/` (tablas/enums/migración);
`apps/web/src/features/scans/`; `apps/web/src/app/scans/` + handlers callback/SSE;
`apps/web/src/lib/` (`env`/`redis`/`audit`/`middleware`); `services/scanner/`;
`infra/docker-compose.dev.yml`; `.env.example`; `docs/`.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Protocolo Node→Celery frágil | Med | El diseño lo fija; alternativa: cola Redis mínima |
| SSRF (redirects, IPv6, metadata) | High | Tests obligatorios; egress real |
| Sin runner de pruebas | High | Prerrequisito: Vitest + pytest |
| `LISTEN/NOTIFY` bajo pooler transaccional | Med | SSE sobre polling |
| Retención sin scheduler | Med | Compatible con TTL futuro |

## Rollback Plan

Revertir `sprint/2` a `5c0fc26`. Migraciones aditivas: rollback de código. Sin
`db:migrate`; `db:generate` y migración requieren aviso al owner.

## Dependencies

- Runner de pruebas en web, packages y worker (prerrequisito).
- Redis 7 en `infra/docker-compose.dev.yml`.

## Success Criteria

- [ ] Encolado sin ownership verificado falla; guard con tests.
- [ ] SSRF resiste `127.0.0.1`, `169.254.169.254`, RFC1918 e IPv6 loopback.
- [ ] Worker con rootfs solo lectura, sin credenciales de Postgres.
- [ ] Progreso en vivo en ≤2 s; findings normalizados; envío limitado en servidor.
