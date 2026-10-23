# Apply Progress — sprint-2-scanner

Progreso acumulado de la fase apply. Lotes: WU4 (tasks 3.1–3.2, SSRF), WU5
(task 3.3, ownership), WU6 (4.1–4.3 y 4.5–4.6), fixture SS-4 y WU7 (4.4,
worker). Fases 3 y 4 completas; quedan las tareas 5.1–5.5.

- **Modo**: Standard (`strict_tdd: false` en `openspec/config.yaml`). Las tasks
  3.1 y 3.2 exigían explícitamente RED-first y se ejecutaron en ese orden.
- **Almacenamiento**: hybrid (`openspec/` + Engram).
- **Estrategia de entrega**: `auto-chain` / `stacked-to-main`. WU4 y WU5 son
  commits locales en `sprint/2` (sin push); ambos superan el presupuesto de
  revisión de 400 líneas y se recomienda `size:exception` (ver abajo).

## WU4 — SSRF Node + Python (tasks 3.1, 3.2)

**Commit**: `e569949` — `feat(security): add SSRF guards for web egress and scan worker`
(6 archivos, +1.401/−9).

### Work Unit Evidence

| Evidencia | Resultado |
|---|---|
| Test focalizado | `pnpm test` → 3 archivos / 63 pruebas pass (en ese momento); ciclo RED confirmado en ambos lados antes de la implementación (Node: módulo inexistente; Python: `ModuleNotFoundError: No module named 'scanner.ssrf'`) |
| Harness de runtime | `N/A` — el guard SSRF es código puro con transporte inyectado (`deps.lookup`/`deps.request` en Node; `resolver` en Python); no hay frontera de runtime viva en este lote (E2E con red de fixture llega con la task 5.3). Sustituto ejecutado: ver evidencia viva de Python en la fila siguiente |
| Evidencia viva complementaria | `python -m pytest -q` → 42 pass; los literales IP se validan sin DNS y las reglas IPv4-mapped/`::1` están cubiertas por las suites |
| Frontera de rollback | Los 6 archivos del commit `e569949`; revert del commit elimina ambos guards sin tocar esquema, docs de otra sección ni código de auth |

### Cobertura de entregables

- `apps/web/src/lib/ssrf.ts` (445 L): `safeFetch` con pin de IP, revalidación
  por hop (máx. 5), puertos 80/443, esquemas http/https, cap de 64 KiB,
  fail-closed. 57 pruebas.
- `services/scanner/scanner/ssrf.py` (278 L): paridad de reglas (tabla única
  D6). 42 pruebas.
- `docs/security.md` §2: estado `Partially done` + tabla de reglas de 9 filas
  (contrato único) + evidencia de tests concretos.

## WU5 — Ownership: schema, actions y guard (task 3.3)

**Commit**: `feat(scans): add ownership challenge and verification actions`
(12 archivos, +926/−4). DO-1 (guard), DO-2 (métodos), DO-3 (tokens),
DO-4 (persistencia), DO-5 (guard testeado).

### Work Unit Evidence

| Evidencia | Resultado |
|---|---|
| Test focalizado | `pnpm exec vitest run apps/web/src/features/scans` → 3 archivos / 29 pruebas pass; `pnpm test` → 6 archivos / 92 pruebas pass |
| Harness de runtime | `N/A` — las actions son módulos server con `db`, DNS y egress inyectados/mokeados; no existe aún infraestructura viva para este flujo (la trae el lote E2E, task 5.3). La compila­ción real la certifican `pnpm typecheck` (tsc sobre los imports de `@vuldetected/db` y Drizzle) y `pnpm check` completo |
| Frontera de rollback | Archivos nuevos: `apps/web/src/features/scans/{schema,guard,actions}.ts` + sus 3 suites y `apps/web/test/db-mock.ts`. Archivos modificados: `packages/db/src/index.ts` (barrel), `apps/web/{tsconfig.json,vitest.config.ts}` (alias `@test`), `docs/security.md` §1, `tasks.md` 3.3 |

### Cobertura de entregables (DO-1..DO-5)

| Requisito | Estado | Dónde |
|---|---|---|
| DO-1 guard estructural | `requireVerifiedDomain(userId, hostname)` lanza `DomainNotVerifiedError` sin fila verificada; `submitScanAction` (4.2) será su único consumidor | `features/scans/guard.ts` |
| DO-2 DNS TXT + well-known | Cada método basta por sí solo; el proof se compara contra **cualquier** token sin expirar del hostname; el fetch well-known pasa por `safeFetch` (mismas reglas SSRF, D6) | `features/scans/actions.ts` (`requestOwnershipChallengeAction`, `verifyOwnershipAction`) |
| DO-3 reutiliza `verification_tokens` | Insert con `purpose='domain_ownership'`, `identifier=normalized_hostname`, `value` hex crudo de 32 bytes, `expires_at=+30 min`; token consumido (borrado) en la misma transacción del éxito | `actions.ts` + `actions.test.ts` |
| DO-4 persiste método y registro | Upsert de `domains` con `verified=true`, método, `verification_record` (valor TXT o ruta well-known) y `verified_at`; conflicto con otra cuenta nunca reasigna (`setWhere: user_id = actual`) | `actions.ts` |
| DO-5 guard testeado | 3 pruebas del guard (fila verificada / sin fila / host inválido sin consultar) | `guard.test.ts` |

### Desviaciones del diseño (documentadas, no silenciosas)

1. **`requireVerifiedDomain` y `DomainNotVerifiedError` viven en
   `features/scans/guard.ts`, no en `actions.ts`.** Un archivo `'use server'`
   solo puede exportar funciones async: cada export en tiempo de ejecución se
   vuelve una acción invocable desde el cliente, lo que convertiría el guard
   en un oráculo "¿el usuario X posee el dominio Y?". La task 4.2 importa el
   guard desde el módulo interno; el comportamiento es el que exige D5.
2. **El barrel raíz `packages/db/src/index.ts` no exportaba las tablas de
   Sprint 2** (`domains`, `scans`, `findings`, `scanEvents` ni sus enums y
   tipos), pese a que `schema/index.ts` sí lo hacía y el paquete declara que
   "las apps importan desde aquí". Completado en este lote: sin ello la task
   3.3 (y la futura 4.2) no podía importar `domains`.
3. **Alias `@test/*`** añadido a `apps/web/tsconfig.json` y
   `vitest.config.ts` para el helper compartido `test/db-mock.ts` (fuera de
   `src/`, al que `@/*` no llega).
4. **Auditoría y rate limiting ausentes por diseño de lote**: D5 menciona el
   evento `domain.ownership.verified` y las cuotas 10/h–20/h;ambos llegan con
   la task 4.3 (frontera de tareas de `tasks.md`), anotado en el código.
5. **Re-request de challenge no invalida tokens previos**: la verificación
   acepta cualquier token sin expirar del hostname; acota la acumulación con
   el rate limit de 4.3 (máx. ~10 filas/dominio por TTL de 30 min).

## Verificación final (fase 3 completa)

| Comando | Resultado |
|---|---|
| `pnpm exec vitest run apps/web/src/features/scans` | 3 archivos / 29 pruebas pass |
| `pnpm test` (raíz, vitest run) | 6 archivos / 92 pruebas pass |
| `pnpm check` (lint + typecheck + format:check) | pass (exit 0) |
| `python -m pytest -q` (services/scanner) | 42 pass |

## Fase 4 — Envío, worker, wiring web (tasks 4.1–4.6)

### WU6 — wiring web (4.1, 4.2, 4.3, 4.5, 4.6)

**Commit**: `776e8ed` — `feat(scans): add submission wiring, celery publisher, rate limit and callback/sse routes`

- `lib/redis.ts`, `lib/celery.ts` (wire protocol Kombu/Celery 5.x que el
  worker python consume), `lib/rate-limit.ts`, `lib/audit.ts`
  (`scan.enqueued`, `scan.failed`, `domain.ownership.*`); env en `lib/env.ts`.
- `submitScanAction` (SS-1..SS-6): estado `queued` persistido **antes** de
  encolar; fallo del broker → 503.
- Limiter IP en `api/auth/[...all]/route.ts`.
- Callback `api/scans/[scanId]/callback/route.ts`: Bearer +
  `timingSafeEqual` (401), idempotencia en estados terminales y
  `onConflictDoNothing` para findings/eventos.
- SSE `api/scans/[scanId]/events/route.ts`: polling con cursor y
  autorización (SP-3).
- Fixture dorado SS-4 en `apps/web/test/fixtures/ss-4.json` (`1dcec8c`).

### WU7 — worker Python (4.4)

**Commit**: `311f3b4` (12 archivos, +389/−18). El writer del lote se
interrumpió a mitad de ejecución; el trabajo quedó en disco y el orquestador
verificó y cerró el lote (no se relanzó un segundo writer).

- `scanner/tasks.py`: consume `scanner.tasks.run_scan`, revalida el target
  con `ssrf.resolve_url` (SW-1) y emite `scan.started` / `check.*` /
  `scan.completed` / `scan.failed`.
- `scanner/egress.py`: todo el tráfico saliente pasa por el guard SSRF con
  revalidación por hop; `follow_redirects=False`.
- `scanner/report.py`: callback con Bearer; reintenta solo en 5xx.
- `scanner/checks/{security_headers,cookies,redirects,tls}.py` (tabla D6).
- `scanner/celery_app.py` + `Dockerfile` (usuario no root, secretos solo vía
  env).

### Verificación (Fase 4 completa)

| Comando | Resultado |
|---|---|
| `pnpm test` (raíz) | 7 archivos / 93 pruebas pass |
| `pnpm check` | exit 0 |
| `python -m pytest -q` | 42 pass |
| Verificador independiente vs `design.md` + `scan-worker/spec.md` | PASS, sin gaps bloqueantes (SW-1..SW-6) |

### Huecos de cobertura (no bloqueantes, follow-up)

Sin pruebas unitarias para SW-1 (consumo/revalidación de la tarea), SW-2
(los 4 checks) y SW-5 (cliente de callback). La task 5.3 (E2E) recorre el
camino completo encolar→consumir→callback→filas; si se quiere cobertura de
unidad antes del E2E, requiere lote propio.

### Cierre del ledger SDD

El intento de "Fase 4 completa" se registró `failed` (798 líneas; 4.4 sin
implementar). Se cerró con `rescope` a solo la 4.4 (objetivo generación 3) y
settle `passed` con `--remediates-evidence-revision sha256:893afed0…` y
evidencia distinta. RDD quedó `off` a nivel clone (consentimiento v3 del
review no representable en este runtime); la revisión pasa a la política
ordinaria del repo.

## Presupuesto de revisión

| Lote | Líneas autorizadas (add+del) | Recomendación |
|---|---|---|
| WU4 (`e569949`) | 1.410 | `size:exception` — implementación honesta del contrato de reglas D6 en dos lenguajes con sus suites; no se puede partir sin perder la paridad nodo/python en un solo review |
| WU5 (este lote) | 930 | `size:exception` — 426 son pruebas y helper de test; producción ~500 (schema+actions+guard con su documentación) |
| WU6 (`776e8ed`) | 798 | `size:exception` — un solo contrato de envío partido en 5 tareas de la misma frontera; no se puede cortar sin desacoplar callback/SSE del productor |
| Fixture + 4.4 (`1dcec8c`, `311f3b4`) | ~422 | Sin excepción: worker acotado (~350 L de producción) más fixture |

## Bloqueos

Ninguno. Las tasks pendientes son 5.1–5.5 (dependen de las fases 3 y 4, ya
completadas).
