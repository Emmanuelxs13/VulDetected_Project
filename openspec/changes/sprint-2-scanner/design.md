# Design: Sprint 2 — dominio de escaneo (`sprint-2-scanner`)

## Enfoque técnico

El producto real llega en tres piezas con una única propiedad estructural: **la
web es el único runtime con reglas de negocio y único escritor de
`findings`/`scan_events`/estado** (TB2/TB4, ADR 0001). La web normaliza y valida
la URL, exige una fila `domains` verificada, inserta `scans (queued)` y publica
un mensaje estándar de Celery 5.x directamente en el broker Redis. El worker
(`services/scanner`, Python + Celery) consume esa tarea, re-valida el objetivo
contra SSRF (SW-1), ejecuta sus checks propios deterministas (SW-2) y reporta
progreso y resultados por un **callback HTTP autenticado** (`SCANNER_CALLBACK_SECRET`,
SW-5). El navegador consume progreso por SSE sobre polling corto de
`scan_events` (SP-3). Este diseño resuelve las 10 decisiones delegadas, fija el
protocolo de cable, el esquema y los límites de componentes; no introduce
código.

Referencias: propuesta, specs DM/DO/SS/SW/SP, `docs/architecture.md`,
`docs/security.md` (TB1–TB6), `docs/database.md` (Sprint 2), ADR 0001–0005.

## Decisiones de arquitectura

### D1 — Protocolo de cable Node→Celery (encolado)

| Opción | Tradeoff | Decisión |
|---|---|---|
| Cola mínima propia (Redis list + consumidor Python a medida) | Formato trivial, pero degrada Celery a un wrapper: pierde acks, retry, visibilidad | **Rechazada** |
| Paquete `celery-node` | Menos código propio, pero dependencia dormida (sin releases recientes) | **Rechazada** |
| **Mensaje estándar Celery 5.x publicado por `lib/celery.ts`** | ~40 líneas propias; protocolo estable y documentado; Celery completo del lado worker | **Elegida** |

La web publica con `LPUSH` en la cola `celery` del broker un mensaje JSON con el
formato estándar de tarea (protocolo Kombu/Celery 5.6+): `body` = base64 de
`[args, kwargs, embed]` (JSON), `headers` con `task`, `id`, `root_id`,
`origin`, `argsrepr`/`kwargsrepr`, `retries: 0`, `timelimit`, `ignore_result` y
`properties` con `correlation_id`, `reply_to`, `delivery_mode: 2`,
`body_encoding: "base64"`. Detalle exacto en [Contratos](#contratos-de-interfaz).

- **Tarea**: `scanner.tasks.run_scan`; kwargs únicamente (args `[]`).
- **kwargs (payload del job)**: `scan_id`, `domain_id`, `target
  {scheme,host,port,base_url}`, `checks[]`, `callback_base_url`.
- **El secreto no viaja en el broker** (TB4): el worker lee
  `SCANNER_CALLBACK_SECRET` de su propio entorno; el mensaje solo lleva la base
  del callback. El broker queda libre de credenciales.
- **Semántica de fallo**: cola `task_acks_late=true`,
  `task_reject_on_worker_lost=true`, `autoretry_for=(ScannerError,
  CallbackError)` con `max_retries=3`, `retry_backoff=30s`, `retry_backoff_max=300s`,
  `task_ignore_result=true` (el estado vive en Postgres, no en el result backend).
  Si el encolado falla del lado web, la fila `scans` pasa a `failed` con
  `error='enqueue_failed'`, se audita y la petición responde 503 (SS-6: fila
  antes de encolar, sin tareas huérfanas).
- **Verificación obligatoria**: un test de integración recorre encolar →
  consumir → callback (hermético, ver E2E) y un test Vitest fija los bytes
  exactos del mensaje contra un fixture dorado.

### D2 — Esquema

Sigue el precedente Sprint 1: snake_case, `uuid` con `gen_random_uuid()`,
`citext` solo donde aporta, `timestamptz` con `created_at`/`updated_at`,
migración aditiva sin backfill. DDL exacto en [Contratos](#contratos-de-interfaz).

- **Enums**: `scan_status` = `queued|running|completed|failed|cancelled` (DM-2).
  `severity` = `unclassified|info|low|medium|high|critical` — vocabulario de
  ADR 0003 (que también fija `Badge unknown→unclassified`), con `unclassified`
  como primer valor y **único valor escrito en S2** (DM-3); clasificación con
  reglas/proveniencia en S3.
- **Unicidad de `normalized_hostname`: GLOBAL** (única en la tabla). La
  propiedad legal de un dominio es excluyente de hecho; dos cuentas verificadas
  sobre el mismo hostname significan una prueba falsa o coordinación, y la
  unicidad elimina el costo doble de escaneo y las carreras de doble
  verificación. El squatting exigiría prueba real de propiedad, luego no es un
  vector de abuso. La segunda cuenta recibe "dominio ya verificado por otra
  cuenta".
- **Desviación deliberada**: `scan_events.id` es `bigint GENERATED ALWAYS AS
  IDENTITY`, no `uuid`. Es un stream append-only cuyo consumo (polling SSE)
  necesita un cursor monotónico; `created_at` sigue siendo el orden
  autoritativo (SP-1) y `id` es el cursor. Se documenta en el comentario de la
  tabla.
- **Idempotencia de eventos**: `UNIQUE (scan_id, seq)` + `seq` emitido por el
  worker; reintento de callback reinserta el mismo `seq` → `ON CONFLICT DO
  NOTHING` (clave del retry sin duplicados).
- FKs: `domains.user_id → users (CASCADE)`, `scans.domain_id → domains
  (CASCADE)`, `findings.scan_id → scans (CASCADE)`, `scan_events.scan_id →
  scans (CASCADE)`. Consistente con `sessions`/`accounts`; `audit_logs` queda
  fuera (evidencia sobrevive).
- `verification_method` como `text` con `CHECK IN ('dns_txt','well_known')`
  (el alcance fija dos enums; la restricción da el mismo rechazo a nivel DB sin
  un tercer tipo).

### D3 — Dedup de findings

| Opción | Tradeoff | Decisión |
|---|---|---|
| Dedup solo intra-escaneo | Evita duplicados dentro de un scan | Base |
| Suprimir duplicados entre re-escaneos | Destruye el historial que S3 necesita para tendencia; complica la retención | **Rechazada** |
| **Key estable + unicidad intra-escaneo + retención de ocurrencias entre escaneos** | Cumple DM-5 (misma key entre re-scans) y el guardrail retain-all; S3 agrupa por `finding_key_idx` | **Elegida** |

- `finding_key` = `sha256(domain_id | check_name | affected_url)` — la calcula
  el worker (su input lleva `domain_id`), es estable entre re-escaneos y no
  incluye `scan_id`.
- Intra-escaneo: índice único parcial `UNIQUE (scan_id, finding_key)` + `ON
  CONFLICT DO NOTHING` al insertar; el segundo hallazgo igual en el mismo scan
  se descarta en DB, no en código.
- Entre escaneos: cada ocurrencia se conserva (DM-6/SP-5); el índice no único
  `findings_key_idx` sirve a S3 para agrupar sin remodelar.

### D4 — Rate limiting: limiter, no cuota

| Opción | Tradeoff | Decisión |
|---|---|---|
| Cuota de producto | La cuota espera datos de costo reales (decisions-pending #4); no hay medidor en S2 | **Rechazada** |
| **Limiter Redis de ventana fija** (`INCR` + `EXPIRE`, atómico sin Lua) | Simple, compartido entre instancias, Redis ya existe; fail-closed = 503 si Redis cae (auto-DoS acotado por diseño, se documenta) | **Elegida** |

- **Dónde vive**: `apps/web/src/lib/rate-limit.ts` (`server-only`), invocado al
  inicio de cada server action/handler protegido. **No en middleware** (TB2:
  middleware es filtro grueso; la autorización y el límite se validan donde se
  usa el dato).
- **Buckets**: `rl:{scope}:{windowSec}:{bucket}` → conteo. Por usuario
  (`user:{id}`) y por IP (`ip:{ip}`, leída como en `request.ts`, mejor esfuerzo).
- **Números** (fail-closed, respuesta 503 en escaneo; mensaje genérico en auth
  para no revelar existencia de cuenta — SS-4):

| Endpoint | Por usuario | Por IP |
|---|---|---|
| Emisión de challenge (`requestOwnershipChallenge`) | 10/h | 20/h |
| Verificación de propiedad (`verifyOwnership`) | 20/h | 40/h |
| Sumisión de scan (`submitScan`) | 5/h | 20/h |
| `login` / `register` (auth) | — (lockout por cuenta ya existe) | 30/15 min; register 10/h |

### D5 — Flujo de verificación de propiedad (DO)

1. `requestOwnershipChallenge(hostname)` → normaliza a `normalized_hostname`,
   inserta en `verification_tokens` con `purpose='domain_ownership'`,
   `identifier = normalized_hostname`, `value = randomBytes(32).hex`, `expires_at
   = now()+30min`. Escritura directa con Drizzle (nuestro código ya pone el
   purpose explícito, ver `verification-tokens.ts`); el `storeIdentifier:
   'hashed'` de Better Auth solo aplica a sus propios writes, no a los nuestros.
2. Métodos (cada uno suficiente — DO-2):
   - **DNS TXT**: el usuario publica `_vuldetected.<hostname>` con el token; la
     web consulta `resolveTxt` y compara (cualquier registro igual basta).
   - **`/.well-known/`**: la web hace `GET https://<hostname>/.well-known/vuldetected.txt`
     **a través del egress endurecido** (mismas reglas SSRF que el worker, ver
     D6) y compara el body recortado con el token.
3. Éxito → transacción: consumir el token (borrar la fila, single-use) + upsert
   de `domains` (`verified=true`, method, `verification_record` = valor TXT o
   ruta well-known, `verified_at=now()`) + audit `domain.ownership.verified`.
   Fracaso → el dominio queda sin verificar, sin borrar el token (reintento
   dentro de `expires_at`).
4. **Expiración/revocación**: el estado verificado NO expira en S2 (sin
   scheduler, guardrail retain-all); la revocación = borrar la fila `domains`
   (sin UI en S2). Re-verificación periódica diferida y anotada.
5. **Guard estructural (DO-1/DO-5/SS-3)**: el encolado usa únicamente
   `requireVerifiedDomain(userId, hostname)` — una función que hace
   `SELECT ... WHERE user_id=? AND normalized_hostname=? AND verified=true` y
   lanza si no hay fila. Todo el path de encolado pasa por ella; test Vitest
   asserts que encolar sin prueba falla y que no se crea tarea en el broker.

### D6 — Defensas SSRF

| Opción | Tradeoff | Decisión |
|---|---|---|
| Validar el hostname como string | Inútil: el string es controlado por el atacante, la dirección no (security.md §2) | **Rechazada** |
| **Resolver DNS → validar TODAS las direcciones resueltas → pin de IP + revalidación por hop** | Duplicación de reglas en Node y Python (aceptada, ver contrato de reglas único) | **Elegida** |

- **Reglas (tabla única documentada en `docs/security.md`, implementada dos
  veces**: `apps/web/src/lib/ssrf.ts` con Vitest; `services/scanner/scanner/ssrf.py`
  con pytest):
  - Rechazar tras resolver: loopback `127.0.0.0/8` y `::1`; link-local
    `169.254.0.0/16` (incluye metadata cloud) y `fe80::/10`; privados `10/8`,
    `172.16/12`, `192.168/16`, `fc00::/7`; no especificada `0.0.0.0` y `::`;
    multicast `224.0.0.0/4`. `::ffff:127.0.0.1` y otros IPv4-mapped caen por
    normalización a IPv4 y re-chequeo.
  - Literales IP no canónicos (decimal `2130706433`, octal, hex, IPv6 raros):
    si `host` es un IP literal, solo se acepta dotted-decimal IPv4 canónico o
    IPv6 canónico (`net.isIP` + validación de octetos); cualquier otra forma se
    rechaza.
  - **Pinning anti-rebinding**: se resuelve una vez, se valida el conjunto
    completo de A/AAAA, se elige la primera pública y **se conecta a esa IP**
    con `Host`/SNI = hostname; no se re-resuelve a mitad de petición.
  - **Redirects**: `follow_redirects=false` y bucle manual (máx. 5 hops):
    cada hop re-resuelve, re-valida y re-pinea antes de conectar.
  - Puertos 80/443 únicamente; timeouts: connect 5s, read 15s; total por scan
    300s (`SCANNER_SCAN_TIMEOUT_SECONDS`); concurrencia worker 2 slots.
- **Dónde**: la web valida en la sumisión (SS-2 gate) y en el fetch well-known;
  el worker **re-valida independientemente** tras recibir la tarea (SW-1) y en
  cada hop (SW-3). El gate de la web es control de costo; el del worker es la
  frontera de seguridad (TB5).
- **Escape para tests (deliberado y documentado)**: `SCANNER_EGRESS_MODE`
  ∈ `strict|test`, default `strict`; en `test` se permite una red de fixture
  interna para el loop E2E hermético. Producción fija `strict`; un test de
  seguridad asserta que el compose de producción nunca use `test`.

### D7 — Realtime: SSE sobre polling corto

- **Contrato SSE**: `GET /api/scans/{scan_id}/events` (sesión de cookie
  requerida, autorización: el scan pertenece al usuario), `text/event-stream`,
  sin librería (native `ReadableStream`).
- **Polling**: cada 1000 ms → `SELECT ... WHERE scan_id=? AND id > cursor
  ORDER BY id LIMIT 100`, emitir como eventos; heartbeat `: ping` cada 15 s;
  cierre cuando `status` es terminal y un ciclo de polling no trae eventos.
  Cursor = `scan_events.id` (monótono por construcción, D2). Cota de volumen:
  100 eventos por ciclo y 1 ciclo/s por cliente conectado.
- **`LISTEN/NOTIFY` (SP-4)**: optimización **no implementada en S2**; su puerta
  exacta queda fijada para cuando se necesite: `SCAN_EVENTS_DRIVER=notify`
  requiere una **conexión directa no-pooled** (`DATABASE_URL` local, o Supabase
  por el Session pooler 5432; el Transaction pooler 6543 de Supabase rompe
  LISTEN/NOTIFY — decisions-pending #1) y una conexión dedicada de
  `postgres.js` (`prepare:false`, fuera del pool). Correctness nunca depende de
  ello; el polling cumple ≤2 s (SP-3) y es lo único probado.

### D8 — Puerta de email verificado

**Decisión: las cuentas con email sin verificar SÍ pueden escanear en S2.**
La verificación de email está apagada en S1 (sin mailer, sin transición que
active la cuenta): una puerta sobre `email_verified` bloquearía a toda cuenta
sin ningún camino para activarse — una puerta muerta que es una caída
silenciosa. El control efectivo en S2 es doble: el gating de `status` en la
creación de sesión (suspended/deleted no entran, ya implementado) y el guard
de ownership (DO-1). Se registra en decisions-pending #3: cuando la verificación
de email exista, la puerta es una línea (`if (!user.email_verified) throw`) y
el esquema ya la soporta (`users.email_verified`).

### D9 — Ciclo de vida del scan en UI

| Estado | UI | Transición |
|---|---|---|
| `queued` | Badge "En cola" + spinner | → `running` |
| `running` | Badge "Escaneando" + feed de eventos en vivo (SSE) + barra de progreso por check | → `completed` / `failed` |
| `completed` | Badge + resumen (n hallazgos) + tabla de findings (severity Badge "Sin clasificar") | — |
| `failed` | Badge + error + últimos eventos | — |
| `cancelled` | **Reservado**: sin trigger de UI en S2 (no hay kill del worker); el valor del enum existe para el futuro | — |

- Páginas: `/scans` (lista propia + formulario de URL) y `/scans/{id}`
  (detalle con estado, feed y findings). `queued→running` lo efectúa la web al
  recibir el evento `scan.started`; `running→terminal` solo por callback final
  (o `enqueue_failed` pre-encolado).
- Severidad en S2: todo hallazgo se muestra como `unclassified` (mapa al Badge
  `unknown` de ADR 0003); sin mapeo ni remediación (S3).

### D10 — Aislamiento del worker y contrato de checks

- **Layout** `services/scanner/`: `pyproject.toml` (celery, redis, httpx,
  pytest, pytest-asyncio), `scanner/__init__.py` (app Celery),
  `scanner/tasks.py` (`run_scan`), `scanner/ssrf.py`, `scanner/egress.py`
  (cliente httpx endurecido), `scanner/checks/{headers,tls,cookies,redirects}.py`,
  `scanner/report.py` (cliente del callback), `tests/`, `Dockerfile`,
  `README.md`.
- **Aislamiento (SW-4)**: rootfs read-only, `tmpfs` en `/tmp`, `cap_drop: ALL`
  + `no-new-privileges`, sin mounts del host ni del socket Docker, límites de
  recursos, sin credenciales Postgres, sin shell (S2 no ejecuta subprocesos:
  los checks son Python puro; la regla argv queda lista para Nuclei/ZAP en S3).
- **Contrato de check**: `async def run(ctx: ScanContext) -> list[FindingDraft]`;
  `ScanContext` = scan_id, task_id, target `{scheme,host,port,base_url}`, cliente
  endurecido, presupuesto de tiempo. `FindingDraft` = `{check, title,
  description, affected_url, evidence: dict, raw: dict}`; la web persiste con
  `severity='unclassified'` y la `finding_key` que el worker calcula (D3).
- **Los cuatro checks deterministas (SW-2)**:
  - `security_headers`: GET `base_url`; evalúa HSTS, CSP, X-Content-Type-Options,
    X-Frame-Options, Referrer-Policy, Permissions-Policy; un hallazgo por header
    ausente/débil.
  - `tls`: sondea HTTPS en el host; hallazgo si TLS < 1.2, certificado expirado,
    self-signed, hostname mismatch, o HTTPS no disponible.
  - `cookies`: GET `base_url`; por cookie de `Set-Cookie`: hallazgo por flag
    faltante (`Secure`/`HttpOnly`/`SameSite`).
  - `redirects`: cadena manual acotada a 5; hallazgos por cadena > 3,
    downgrade https→http, final sin HTTPS.
- **Progreso**: el worker hace callbacks incrementales (`scan.started`,
  `check.started`, `check.completed` con `seq` correlativo) y un callback final
  con `status` + `findings`. `failed` solo en errores duros (target inalcanzable,
  SSRF-rejected, excepción, timeout); `completed` = scan ejecutado, aun con cero
  hallazgos.

## Data Flow

**Sumisión y encolado**

```
Browser ── submitScanAction ──▶ features/scans/actions.ts
  1 normalizeTargetUrl (SS-1) ── 2 lib/ssrf.ts gate (SS-2: resolve + reject)
  3 lib/rate-limit.ts (SS-4, fail-closed)
  4 requireVerifiedDomain(userId, hostname)  ← guard DO-1/SS-3 (testeado)
  5 INSERT scans (queued)  ──▶ Postgres
  6 lib/celery.ts: mensaje estándar → LPUSH cola `celery` ──▶ Redis
     fallo en 6 → UPDATE scans (failed, enqueue_failed) + audit + 503
```

**Worker → callback → web (única escritora, SP-2)**

```
Redis ──▶ scanner.tasks.run_scan (kwargs: scan_id, domain_id, target, checks, callback_base_url)
  ├─ ssrf.revalidate (SW-1) ── egress endurecido por hop (SW-3)
  ├─ POST /api/scans/{id}/events  {seq,type,payload}   (progreso, secreto Bearer)
  │    └─ web: tx → scan_events (ON CONFLICT seq) ; scan.started → status=running
  ├─ checks propios → FindingDraft[] (SW-2)
  └─ POST /api/scans/{id}/callback {status, findings, events finales}
       └─ web tx: findings (ON CONFLICT scan_id,finding_key) + eventos + status terminal
            → audit scan.completed/failed → 200 {ok} | 5xx → worker retry (backoff)
```

**Progreso en vivo (SP-3)**

```
Browser ── GET /api/scans/{id}/events (ReadableStream, session cookie)
  └─ poll 1s: scan_events WHERE scan_id=? AND id>cursor LIMIT 100 → event: scan.event
     heartbeat 15s · cierre tras status terminal y ciclo vacío
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `packages/db/src/schema/enums.ts` | Modify | + `scanStatusEnum`, `severityEnum` |
| `packages/db/src/schema/domains.ts` | Create | Tabla `domains` (+ CHECK method) |
| `packages/db/src/schema/scans.ts` | Create | Tabla `scans` |
| `packages/db/src/schema/findings.ts` | Create | Tabla `findings` + índices dedup |
| `packages/db/src/schema/scan-events.ts` | Create | Tabla `scan_events` (identity + seq) |
| `packages/db/src/schema/relations.ts` | Modify | Grafo domains/scans/findings/scanEvents |
| `packages/db/src/schema/index.ts` | Modify | Barrel + re-exports (regla: si no está aquí, no migra) |
| `packages/db/drizzle/0003_scan_domain.sql` | Create | Migración aditiva (drizzle-kit generate — requiere aviso al owner ANTES de autorarla, database.md) |
| `apps/web/src/lib/env.ts` | Modify | + `REDIS_URL`, `SCANNER_CALLBACK_SECRET`, `SCAN_EVENTS_DRIVER` |
| `apps/web/src/lib/redis.ts` | Create | Cliente Redis (`redis` v5) lazy, patrón `db.ts` |
| `apps/web/src/lib/celery.ts` | Create | Mensaje Celery 5.x + publicador LPUSH |
| `apps/web/src/lib/rate-limit.ts` | Create | Limiter ventana fija fail-closed (D4) |
| `apps/web/src/lib/ssrf.ts` | Create | Guard SSRF Node (D6) + egress endurecido para well-known |
| `apps/web/src/lib/audit.ts` | Modify | `AuditAction` + `scan.enqueued`, `scan.failed`, `domain.ownership.verified`, `domain.ownership.challenge_issued` |
| `apps/web/src/features/scans/actions.ts` | Create | normalize, challenge, verify, submitScan (patrón `features/auth`) |
| `apps/web/src/features/scans/schema.ts` | Create | Zod: URL, hostname, callbacks |
| `apps/web/src/features/scans/components/*` | Create | Formulario URL, panel de verificación, detalle, feed, tabla findings |
| `apps/web/src/app/api/scans/[scanId]/events/route.ts` | Create | SSE (D7) |
| `apps/web/src/app/api/scans/[scanId]/callback/route.ts` | Create | Callback autenticado (D1/D2/D3) |
| `apps/web/src/app/api/auth/[...all]/route.ts` | Modify | Envolver con limiter por IP (D4) |
| `apps/web/src/app/scans/page.tsx`, `apps/web/src/app/scans/[scanId]/page.tsx` | Create | Páginas (D9) |
| `apps/web/vitest.config.ts` + `apps/web/src/**/*.test.ts` | Create | Runner Vitest + tests (prerrequisito) |
| `services/scanner/**` | Create | Paquete Python + Celery (D10) + `tests/` pytest |
| `infra/docker-compose.dev.yml` | Modify | Servicio `scanner` (constraints ya documentados) |
| `.env.example` | Modify | + `REDIS_URL`, `CELERY_BROKER_URL`, `SCANNER_CALLBACK_SECRET`, `SCANNER_CALLBACK_BASE_URL`, `SCANNER_EGRESS_MODE=strict`, `SCANNER_WORKER_CONCURRENCY`, `SCANNER_SCAN_TIMEOUT_SECONDS`, `SCAN_EVENTS_DRIVER=poll`; **retirado `SCANNER_SERVICE_URL`** (SS-5) |
| `docs/` (database.md S2, security.md statuses, decisions-pending #3, codebase-map, changelog) | Modify | Reflejar decisiones; `SCANNER_SERVICE_URL` fuera del contrato |

## Contratos de interfaz

**Mensaje Celery 5.x (D1)** — publicado con `LPUSH celery <json>`:

```json
{
  "body": "<base64(json: [[], {kwargs}, {"callbacks":null,"errbacks":null,"chain":null,"chord":null}]))>",
  "content-encoding": "utf-8",
  "content-type": "application/json",
  "headers": {
    "lang": "py", "task": "scanner.tasks.run_scan", "id": "<task-uuid>",
    "root_id": "<task-uuid>", "parent_id": null, "group": null,
    "retries": 0, "timelimit": [300, 300], "shadow": null,
    "argsrepr": "()", "kwargsrepr": "{'scan_id': ...}", "origin": "web@vuldetected",
    "replaced_task_nesting": 0, "ignore_result": true,
    "stamped_headers": null, "stamps": {}
  },
  "properties": {
    "correlation_id": "<task-uuid>", "reply_to": "<task-uuid>",
    "delivery_mode": 2, "delivery_info": {"exchange": "", "routing_key": "celery"},
    "priority": 0, "body_encoding": "base64", "delivery_tag": "<task-uuid>"
  }
}
```

`kwargs` (payload del job):

```json
{
  "scan_id": "<uuid>", "domain_id": "<uuid>",
  "target": {"scheme": "https", "host": "example.com", "port": 443,
             "base_url": "https://example.com"},
  "checks": ["security_headers", "tls", "cookies", "redirects"],
  "callback_base_url": "<SCANNER_CALLBACK_BASE_URL>"
}
```

**Error/retry**: `acks_late`, `max_retries=3`, backoff 30→300 s. El secreto del
callback solo en entornos del worker y la web; nunca en el broker.

**Callback** — `POST /api/scans/{id}/events` (progreso, `seq` correlativo) y
`POST /api/scans/{id}/callback` (final). Ambos `Authorization: Bearer
<SCANNER_CALLBACK_SECRET>` (comparación en tiempo constante,
`crypto.timingSafeEqual`):

```json
// POST /api/scans/{id}/events
{"seq": 2, "type": "check.completed", "payload": {"check": "tls"}}

// POST /api/scans/{id}/callback  (final)
{
  "scan_id": "<uuid>", "task_id": "<celery-task-uuid>",
  "status": "completed", "error": null,
  "checks_run": ["security_headers", "tls", "cookies", "redirects"],
  "events": [{"seq": 5, "type": "scan.completed", "payload": {}}],
  "findings": [{
    "key": "<sha256 hex>", "check": "security_headers",
    "title": "Missing Content-Security-Policy header",
    "description": "…", "affected_url": "https://example.com/",
    "evidence": {"observed": {}}, "raw": {}
  }]
}
```

Respuestas: `200 {ok, already_applied}` | `401` sin secreto | `404` scan
desconocido | `400` malformado | `500` fallo DB (worker reintenta). Idempotente:
si `scans.status` ya es terminal, responde `200 {already_applied:true}` sin
escribir.

**Vocabulario de `scan_events.type`** (conjunto cerrado documentado en la
tabla, nada de enum adicional): `scan.started`, `scan.completed`, `scan.failed`,
`check.started`, `check.completed`, `scan.progress`.

**Esquema (DDL objetivo, migración aditiva `0003`)**

```sql
CREATE TYPE scan_status AS ENUM ('queued','running','completed','failed','cancelled');
CREATE TYPE severity AS ENUM ('unclassified','info','low','medium','high','critical');

CREATE TABLE domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  normalized_hostname text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  verification_method text CHECK (verification_method IN ('dns_txt','well_known')),
  verification_record text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domains_normalized_hostname_key UNIQUE (normalized_hostname)
);
CREATE INDEX domains_user_id_idx ON domains(user_id);

CREATE TABLE scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id uuid NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  target_url text NOT NULL,
  status scan_status NOT NULL DEFAULT 'queued',
  checks jsonb NOT NULL DEFAULT '["security_headers","tls","cookies","redirects"]',
  celery_task_id text,
  started_at timestamptz, finished_at timestamptz, error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scans_domain_created_idx ON scans(domain_id, created_at DESC);
CREATE INDEX scans_status_idx ON scans(status);

CREATE TABLE findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  finding_key text NOT NULL,
  severity severity NOT NULL DEFAULT 'unclassified',
  check_name text NOT NULL,
  title text NOT NULL, description text NOT NULL,
  affected_url text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX findings_scan_key_unique ON findings(scan_id, finding_key);
CREATE INDEX findings_key_idx ON findings(finding_key);

CREATE TABLE scan_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scan_id uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scan_events_scan_seq_unique UNIQUE (scan_id, seq)
);
CREATE INDEX scan_events_poll_idx ON scan_events(scan_id, id);
CREATE INDEX scan_events_created_at_idx ON scan_events(created_at);
```

Justificación de índices: `domains_normalized_hostname_key` = unicidad global y
lookup del guard; `domains_user_id_idx` = listado; `scans_domain_created_idx` =
feed "mis escaneos" nuevo primero; `scans_status_idx` = barridos de estado
futuros (TTL/gatekeeper); `findings_scan_key_unique` = dedup intra-escaneo (y
sirve al listado por scan por el leading column); `findings_key_idx` = agrupado
S3; `scan_events_poll_idx` = cursor SSE; `scan_events_created_at_idx` = TTL
futuro sin remodelar (DM-6/SP-5). Sin backfill (DM-1).

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (Vitest, web) | `normalizeTargetUrl` (casing, puertos default, `domainToASCII` IDN, esquema no http(s)); guard SSRF Node (127.0.0.1, 169.254.169.254, RFC1918, `::1`, `::ffff:127.0.0.1`, literales decimal/octal/hex); rate limiter (ventana, fail-closed con Redis caído); `requireVerifiedDomain` (DO-5: encolar sin prueba falla, sin tarea en broker); callback (sin secreto → 401, comparación en tiempo constante, idempotencia terminal); mensaje Celery contra fixture dorado; SSE poll (cursor, cierre terminal, autorización) | Fixtures y mocks de Redis/DB; `vitest` |
| Unit (pytest, worker) | SSRF (SW-6: bypass por redirect a metadata/127.0.0.1, IPv6, pin anti-rebinding, port allowlist, timeouts); contrato de cada check (emite `FindingDraft` con campos requeridos); cliente callback (header Bearer, retry en no-2xx) | Fixtures httpx mockeados + casos reales de red local en modo `test` |
| Integration (docker compose) | Loop completo: **encolar (Node) → consumir (Celery) → callbacks → filas en Postgres** con egress en modo `test` contra fixture interno; dedup `ON CONFLICT` (mismo `seq` y misma `finding_key` reintentados); transición `queued→running→completed/failed` | `test:e2e` script; test de seguridad: compose de producción nunca usa `SCANNER_EGRESS_MODE=test` |
| Manual/@network | Humo contra dominio público estable (p. ej. `https://example.org`) en modo `strict` | `@network` pytest opt-in |

## Threat Matrix

`N/A` — esta tabla aplica solo a límites de documentación-ejecutable, selección
de repositorios git, commit/push/PR automation. Ninguna fila aplica a este
cambio:

| Boundary | Applicability |
|---|---|
| Documentation-like paths | `N/A` — no se ejecuta Markdown/README/scripts desde documentos |
| Git repository selection | `N/A` — sin `git -C` ni selección de repositorio |
| Commit state | `N/A` — sin lógica de commit/índice |
| Push state | `N/A` — sin push/refspec |
| PR commands | `N/A` — sin comandos PR |

El cambio sí introduce un límite de **proceso/frontera HTTP** (contenedor del
worker, rutas callback/SSE), pero sus controles y RED tests viven donde
corresponde: aislamiento y SSRF en D6/D10 con sus pruebas anti-bypass, y la
autenticación del callback como test de ruta (401/tiempo constante). No se
expande la matriz de VCS.

## Migración / Rollout

Migración aditiva `0003_scan_domain` vía `db:generate` (diff puro, sin
conexión). **Requisito previo por `docs/database.md`: aviso al owner ANTES de
autorar la migración; `db:migrate` solo con sign-off.** Sin backfill; rollback
a nivel de código revirtiendo `sprint/2` a `5c0fc26`. Reintroducir
`SCANNER_SERVICE_URL` queda prohibido por contrato (SS-5). El worker se suma a
`infra/docker-compose.dev.yml` con las restricciones ya comentadas (red interna,
sin puerto host).

## Questions abiertas

- Ninguna bloqueante. Residuales registrados: (a) un worker que muere antes de
  cualquier callback deja el scan en `running` sin recuperación automática (no
  hay scheduler en S2; recuperación manual documentada); (b) la re-verificación
  periódica de propiedad queda diferida; (c) el `SCANNER_EGRESS_MODE=test` es
  un knob deliberado que el review debe custodiar.