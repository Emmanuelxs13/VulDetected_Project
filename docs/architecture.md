# Arquitectura

Vista general del sistema de VulDetected: cuáles son las piezas, cómo fluye una
solicitud a través de ellas y dónde están las fronteras de confianza.

Lea esto primero, luego [`codebase-map.md`](./codebase-map.md) para la
estructura del repositorio y las reglas de importación, luego los
[ADR](./adr/) para el razonamiento, y finalmente
[`security.md`](./security.md) para el modelo de amenazas.

## Los tres desplegables

| Desplegable                     | Tecnología                       | Responsabilidad                                                                                                                                                             |
| ------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web** (`apps/web`)            | Next.js App Router sobre Node 22 | Todo el backend del producto: autenticación, validación de sesión, autorización, reglas de negocio, acceso a la base de datos, interfaz, rutas API y el stream de progreso. |
| **Worker** (`services/scanner`) | Python + Celery                  | Ejecuta escaneos. Orquesta Nuclei y OWASP ZAP contra un dominio ya verificado. No contiene reglas de negocio ni validación de sesión.                                       |
| **Base de datos**               | PostgreSQL 16                    | Registro de verdad para usuarios, sesiones, dominios, escaneos y hallazgos. Nunca se expone a internet público.                                                             |

Infraestructura de apoyo: Redis (broker de Celery y backend de resultados,
Sprint 2) y un relé SMTP para correo transaccional (Mailpit en local).

El worker es un proceso separado a propósito — ver
[ADR 0001](./adr/0001-monorepo-and-runtime-split.md). La consecuencia más
importante: **toda la lógica de autorización del producto vive en exactamente
un runtime.**

```
                            ┌───────────────────────────────────────────────┐
    Browser  ──── HTTPS ───▶ │  apps/web   Next.js App Router (Node 22)     │
    (cookie auth)           │                                               │
                            │  route handlers · server components · auth    │
                            │  session validation · business rules          │
                            └───────┬──────────────────────┬────────────────┘
                                    │                      │
                          SQL via DATABASE_URL      enqueue / progress
                                    │                      │
                    ┌───────────────▼──────────┐   ┌───────▼─────────────────┐
                    │  PostgreSQL 16           │   │  Redis 7                │
                    │  users · sessions ·      │◀──│  Celery broker          │
                    │  domains · scans ·       │   │  + result backend       │
                    │  findings · audit_logs   │   └───────▲─────────────────┘
                    └──────────────────────────┘           │ task / result
                                                           │
                                            ┌──────────────▼─────────────────┐
                                            │  services/scanner             │
                                            │  Python + Celery worker        │
                                            │  runs Nuclei + ZAP            │
                                            │  filtered egress              │
                                            │  read-only filesystem         │
                                            └──────────────┬─────────────────┘
                                                           │ outbound HTTP(S)
                                                           │ to VERIFIED targets only
                                                    ┌──────▼──────┐
                                                    │  Target     │
                                                    │  web app    │
                                                    │  (customer) │
                                                    └─────────────┘
```

Las fronteras de confianza están marcadas con `[TB]` y se detallan a
continuación.

## Flujo de una solicitud — registro e inicio de sesión

```
 [TB1] Browser  ── HTTPS ──▶ [TB2] Next.js route handler
                                   │
                    ┌──────────────▼──────────────┐
                    │ 1. Parse and validate input │
                    │ 2. Check rate limit         │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ 3. Argon2id hash password   │
                    │    (deliberately slow)      │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ 4. Open pooled connection   │──▶ Postgres
                    └──────────────┬──────────────┘      [TB3]
                                   │
                    ┌──────────────▼──────────────┐
                    │ 5. Read user by citext     │
                    │    email; verify hash       │
                    └──────────────┬──────────────┘
                        fail ──────┴──────▶ append audit_logs entry
                        │                        (auth.login.failed)
                        ▼
                    ┌────────────────────────────┐
                    │ 6. Mint raw session token  │
                    │ 7. Store SHA-256 of token  │──▶ sessions.token_hash
                    │    (raw token NOT stored)  │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ 8. Set cookie: HttpOnly,   │
                    │    SameSite=Lax, Secure    │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ 9. Send verification email │──▶ SMTP / Mailpit :1025
                    └─────────────────────────────┘
```

**Cada solicitud autenticada posterior repite los pasos 5–7 en forma de
consulta:** el token en crudo de la cookie se hashea y el resumen se busca en
`sessions.token_hash`. Un resumen vencido o desconocido significa una solicitud
no autenticada — no existe un camino de "confiar solo en la firma". Por eso la
base de datos puede ser robada sin entregar sesiones activas.

## Flujo de escaneo — planificado, llega en el Sprint 2

```
 [TB1] Browser ──▶ [TB2] Next.js
                     │
        ┌────────────▼─────────────────────────────────────┐
        │ 1. User submits a URL                          │
        └────────────┬────────────────────────────────────┘
                     │
        ┌────────────▼────────────────────────────────────┐
        │ 2. Reject anything malformed, non-http(s), or  │
        │    resolving to a private / loopback / link-    │
        │    local address                                │
        └────────────┬────────────────────────────────────┘
                     │  NOT verified → STOP HERE. No job is enqueued.
                     ▼
        ┌─────────────────────────────────────────────────┐
        │ 3. DOMAIN OWNERSHIP PROOF (legal requirement)   │
        │    • DNS TXT token, and/or                      │
        │    • /.well-known/ file                         │
        │    Persist method + record + verified_at         │
        └────────────┬────────────────────────────────────┘
                     │
        ┌────────────▼────────────────────────────────────┐
        │ 4. Rate limit, then insert `scans` (queued)     │──▶ Postgres
        └────────────┬────────────────────────────────────┘
                     │ Celery task
        ┌────────────▼─────────────┐        ┌──────────────▼────────────┐
        │ 5. Redis (broker)        │───────▶│ 6. Worker picks up task   │
        └──────────────────────────┘        └──────────────┬─────────────┘
                                                        │
        ┌───────────────────────────────────────────────────▼────────────┐
        │ 7. SSRF-hardened egress                                         │
        │    resolve DNS · reject private/link-local/loopback/IPv6 loopback│
        │    restricted port allowlist                                    │
        │    RE-VALIDATE after every redirect                             │
        └───────────────────────────┬────────────────────────────────────┘
                                    │
        ┌───────────────────────────▼────────────────────────────────────┐
        │ 8. Run Nuclei and ZAP against the verified domain              │
        │    emit progress events                                       │
        └───────────────────────────┬────────────────────────────────────┘
                                    │
        ┌───────────────────────────▼────────────────────────────────────┐
        │ 9. Normalize tool output → one `findings` shape                 │──▶ Postgres
        │    (Nuclei and ZAP must both map to the same record)            │
        └───────────────────────────┬────────────────────────────────────┘
                                    │
        ┌───────────────────────────▼────────────────────────────────────┐
        │ 10. Append `scan_events` for live progress                      │──▶ Postgres
        └───────────────────────────┬────────────────────────────────────┘
                                    │
        ┌───────────────────────────▼────────────────────────────────────┐
        │ 11. Worker posts result; browser stream updates live           │──▶ Browser
        └───────────────────────────────────────────────────────────────┘
```

Dos propiedades de este flujo son determinantes:

- **El paso 3 es un control, no una función.** La verificación de la propiedad
  del dominio existe porque escanear un sistema que no se posee es ilegal en la
  mayoría de las jurisdicciones. No se puede encolar ningún escaneo sin ella, y
  esa salvaguarda está cubierta por pruebas — no por convención.
- **El paso 7 se reaplica en cada salto.** Validar la URL inicial no basta: una
  redirección a `169.254.169.254` o `127.0.0.1` derrota una verificación única.
  Cada destino de redirección se resuelve y se revalida.

## Fronteras de confianza

### [TB1] Navegador ↔ servidor

No confiable. El navegador está totalmente bajo el control de un atacante en un
escenario de cliente comprometido u hostil. Todo lo que llega desde él es una
entrada no confiable.

Controles: validación en el servidor de cada campo, ninguna decisión de
autorización en el navegador, cookies de sesión `HttpOnly` + `SameSite=Lax` +
`Secure`, nunca se envían secretos al cliente y las variables `NEXT_PUBLIC_*`
se tratan como públicas.

### [TB2] Navegador ↔ servidor Next.js

La superficie autenticada de la aplicación. Las cookies de sesión son la única
credencial y se verifican contra la base de datos en cada solicitud.

Cruzar esta frontera en la dirección equivocada es el error clásico de Next.js:
colocar la autorización solo en el middleware. **El acceso a datos en el servidor
debe validar la sesión en sí.** El middleware es un filtro grueso, no la
frontera de autorización; un route handler o una server action que confía en el
middleware no tiene autorización.

### [TB3] Servidor web ↔ PostgreSQL

El servidor web es de confianza; la base de datos contiene el estado más
sensible del sistema (contraseñas hasheadas, resúmenes de tokens, rastro de
auditoría). Nunca se expone a internet público — solo es accesible desde la red
de la aplicación.

Controles: conexiones solo mediante `DATABASE_URL`, TLS fuera del desarrollo
local, credenciales solo desde el entorno, rol de mínimo privilegio, conexiones
agrupadas con tamaño acotado y las consultas parametrizadas que emite Drizzle.

### [TB4] Servidor web ↔ worker (mediante Redis)

El worker es un **dominio de confianza separado** de la aplicación web, no una
extensión de confianza de la misma. Cualquiera que pueda escribir en el broker
puede pedirle al worker que escanee un host — lo que convierte al broker en un
canal privilegiado.

Controles: Redis no expuesto públicamente, credenciales desde el entorno, el
broker no es un bus de mensajes de propósito general, y el worker revalida de
forma independiente cada objetivo contra las reglas SSRF. El worker confía en la
cola para _qué hacer_ y **nunca** para _si un objetivo es seguro_.

### [TB5] Worker ↔ red de destino

La frontera más peligrosa, porque el destino es una entrada influenciada por el
atacante.

Controles: salida filtrada (solo los puertos y protocolos que el escaneo
necesita), rechazo de rangos privados / de loopback / link-local / de loopback
IPv6 después de la resolución DNS, restricción de puertos, tiempos de espera de
solicitud y límites de concurrencia, un sistema de archivos raíz de solo lectura
con `tmpfs` en `/tmp`, capacidades retiradas y ningún montaje del sistema de
archivos ni de la base de datos del host en el contenedor del worker. Detalle
completo en [`security.md`](./security.md).

### [TB6] Servicio ↔ proveedores externos (Supabase, SMTP, Stripe)

Procesadores de terceros que poseen datos reales. Las credenciales provienen del
entorno, nunca de git; el tráfico salente es específico del proveedor y no
debería llevar credenciales a hosts sin relación.

## Flujo de componentes de un vistazo

```
apps/web
  ├─ routes            /, /login, /register, /dashboard, /scans/*, /settings
  ├─ auth              Better Auth (email+password), argon2id, hashed sessions
  ├─ server-only data  drizzle queries in packages/db, session-validated
  └─ streams           SSE endpoint backed by scan_events

services/scanner (Sprint 2)
  ├─ celery app        consumes CELERY_BROKER_URL
  ├─ tasks             run_nuclei, run_zap
  ├─ guard             SSRF validation on the initial URL and every redirect
  └─ normalizer        tool output → findings shape
```

## Restricciones de diseño que se derivan de esta arquitectura

- **Un solo runtime de autorización.** Cada decisión de permiso ocurre en
  Next.js. El worker nunca decide quién puede ver qué.
- **El worker no tiene lógica de negocio.** Mantenerlo acotado es lo que hace
  alcanzables sus requisitos de aislamiento. Si se cuela lógica de negocio, el
  modelo de aislamiento empieza a erosionarse.
- **El worker no posee credenciales de la base de datos.** Recibe un trabajo de
  escaneo y publica un resultado de vuelta por un canal estrecho. Si el worker
  puede escribir directamente en `users` o `sessions`, su radio de impacto tras
  una brecha es todo el producto.
- **Los hallazgos normalizados son independientes de la herramienta.** Nuclei y
  ZAP deben mapearse a una única forma `findings`; de lo contrario, la
  clasificación de severidad del Sprint 3 se vuelve un caso especial por
  herramienta.
- **El progreso es solo-append.** `scan_events` lo escribe el worker y lo lee el
  stream del navegador. Nada reescribe el historial a mitad de un escaneo.
