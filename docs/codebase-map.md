# Mapa del código base

Dónde vive cada cosa, qué puede importar a qué, y dónde aterrizan los próximos
sprints. Léalo después de [`roadmap.md`](./roadmap.md) y antes de
[`architecture.md`](./architecture.md) — el roadmap dice qué se está construyendo,
este archivo dice a dónde va el código, y el archivo de arquitectura explica cómo
se comunican entre sí los artefactos desplegables.

## Estructura del repositorio

```
VulDetected_Project            pnpm + Turborepo monorepo (ADR 0001)
├─ apps/web                    Next.js App Router — todo el backend del producto
│  └─ src
│     ├─ app/                  SOLO rutas: page/layout/loading/error + route handlers
│     ├─ features/<dominio>/    porciones de negocio: auth y scans hoy; sites después
│     ├─ components/           componentes del shell de la aplicación, compartidos entre rutas
│     ├─ lib/                  infraestructura de servidor: auth, db, env, audit, password,
│     │                        ssrf, celery, rate-limit
│     ├─ types/                declaraciones de tipos ambientales (.d.ts)
│     └─ middleware.ts         (planificado) filtro grueso — nunca autorización
├─ packages/ui                 sistema de diseño presentacional (ADR 0003): tokens,
│                              primitivas, utilidades cn/contrast. Sin lógica, sin datos.
├─ packages/db                 capa de datos (ADR 0004): esquema Drizzle, cliente
│                              neutral respecto del proveedor, migraciones. Sin código de la app.
├─ infra/                      stack de desarrollo con Docker Compose: Postgres, Redis y scanner
├─ docs/                       roadmap, codebase-map, arquitectura, ADRs, runbooks, changelog
└─ services/scanner            worker Python + Celery del Sprint 2 — aislado, solo Docker
```

Principio clave: **`apps/web` es dueño de las reglas del producto, `packages/db`
es dueño de los datos, `packages/ui` es dueño de los píxeles.** El hogar de un
archivo lo decide la capa con la que puede hablar, no su tamaño ni la
conveniencia.

## Reglas de dependencia (qué puede importar a qué)

| Directorio                | Puede importar                                                         | NO debe importar                                |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| `apps/web/src/app`        | features, components, lib, types, `@vuldetected/ui`, `@vuldetected/db` | — (nada importa rutas)                          |
| `apps/web/src/features/*` | lib, `@vuldetected/db`, `@vuldetected/ui`, `./../enums`                | `app/*`, el interior de otras features          |
| `apps/web/src/lib`        | `@vuldetected/db`, APIs de servidor de Next                            | `features/*`, componentes de cliente, `app`     |
| `apps/web/src/components` | `@vuldetected/ui`                                                      | `features/*`, `lib` (mantenerlo presentacional) |
| `packages/ui`             | solo su propio `src/lib` (cn, contrast)                                | cualquier código de la app, `@vuldetected/db`   |
| `packages/db`             | `drizzle-orm`, `postgres`, su propio esquema                           | cualquier código de la app o de la UI           |

Reglas que son estructurales, no de estilo:

- **Las rutas son delgadas.** Los archivos de `app/` seleccionan componentes y
  llaman actions; la lógica de negocio vive en `features/` y en las server
  actions. Un `page.tsx` con una consulta a la base de datos es una señal de
  alarma.
- **Las features son privadas.** Una feature nunca entra en el interior de otra.
  La lógica de negocio compartida que deja de caber en una feature pasa a `lib/`
  o, cuando más de un runtime la necesita, a un paquete bajo `packages/`.
- **`lib/` nunca renderiza.** No contiene componentes; `components/` nunca
  consulta datos. Las dos direcciones del enredo clásico de Next.js.

## El muro servidor/cliente (`server-only`)

Cualquier cosa que toque credenciales, la base de datos, el sistema de archivos o
Better Auth debe vivir detrás de `import 'server-only';` — el compilador entonces
se niega a empaquetarlo en un componente de cliente. Protegido hoy:

- `apps/web/src/lib/env.ts`, `lib/db.ts`, `lib/audit.ts`, `lib/password.ts`,
  `lib/auth.ts`
- `apps/web/src/features/auth/sign-in.ts`, `lockout.ts`, `request.ts`

Los módulos nuevos de servidor **deben** empezar con esa importación. La única
excepción explícita es `lib/auth-client.ts`, que existe para servir al cliente.

## Qué va a dónde — la tabla de decisiones

| Está a punto de…                                    | Va en                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| agregar una ruta o un límite del shell              | `apps/web/src/app/<ruta>/`                                            |
| agregar una mutación o una lectura con reglas       | una server action en `features/<dominio>/actions.ts`                  |
| agregar lógica de negocio que usa una feature       | la carpeta de esa feature                                             |
| agregar lógica de negocio compartida entre features | `apps/web/src/lib/`                                                   |
| agregar una primitiva de UI o un token              | `packages/ui/src/` (+ tokens en `styles/tokens.css`)                  |
| agregar una tabla, columna o consulta               | `packages/db/src/schema/` + migraciones con drizzle-kit `db:generate` |
| agregar una variable de entorno                     | `.env.example` + el contrato de `lib/env.ts`                          |
| registrar una decisión estructural                  | un ADR nuevo en `docs/adr/`, y luego actualice el índice              |
| documentar un procedimiento verificado              | un runbook bajo `docs/`                                               |

## Puntos de extensión — dónde aterrizan los Sprints 2–3

El repositorio está deliberadamente al tamaño del Sprint 1. Las costuras que
absorben el crecimiento, en orden:

1. **Segunda porción de features web**: `features/scans/`, `features/sites/` —
   misma forma que `features/auth/` (actions + esquema + componentes), sin
   patrones nuevos.
2. **Runtime del escáner**: `services/scanner` (Python + Celery, solo Docker).
   Es un dominio de confianza separado — ver TB4/TB5 de la arquitectura; nunca
   contiene reglas de negocio ni credenciales de la base de datos.
3. **Modelos de dominio compartidos**: cuando el worker y la aplicación web
   deban ponerse de acuerdo sobre una forma de `findings` / severidad (Sprint 3),
   ese contrato pasa a una librería de `packages/` consumida por ambos. Se crea
   cuando la necesidad es real — nunca como un marcador de posición vacío.
4. **Tablas de escaneo**: `scans`, `scan_events`, `domain_ownership` viven en
   `packages/db/src/schema/` con el mismo cuidado solo-append que `audit_logs`.

## El dominio de escaneo en el código (Sprint 2)

| Capa          | Ruta                                                                          | Responsabilidad                                                                                        |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Web — negocio | `apps/web/src/features/scans/actions.ts`                                      | Challenge de propiedad, verificación DNS/`well-known`, `submitScanAction` y auditoría.                 |
| Web — negocio | `apps/web/src/features/scans/guard.ts`                                        | `requireVerifiedDomain`: la puerta estructural que impide encolar sin propiedad probada.               |
| Web — negocio | `apps/web/src/features/scans/schema.ts`                                       | Normalización y validación Zod de hostnames y URLs de objetivo.                                        |
| Web — UI      | `apps/web/src/features/scans/components/`                                     | Formulario, challenge de propiedad, estado del escaneo, stream de progreso y lista de hallazgos.       |
| Web — infra   | `apps/web/src/lib/celery.ts`                                                  | Codifica el mensaje Celery 5.x y lo publica con `LPUSH` en la cola `celery`.                           |
| Web — infra   | `apps/web/src/lib/ssrf.ts`                                                    | Guard SSRF y `safeFetch` del lado Node: valida cada respuesta DNS y fija la IP pública.                |
| Web — infra   | `apps/web/src/lib/rate-limit.ts`                                              | Ventana fija sobre Redis, con clave explícita por dimensión (IP o usuario) y fallo cerrado.            |
| Web — rutas   | `apps/web/src/app/api/scans/[scanId]/events/route.ts`                         | `POST` de progreso del worker (Bearer) y `GET` SSE/JSON del navegador (sesión + propiedad).            |
| Web — rutas   | `apps/web/src/app/api/scans/[scanId]/callback/route.ts`                       | Callback terminal del worker (Bearer): hallazgos + estado, idempotente.                                |
| Web — páginas | `apps/web/src/app/scans/page.tsx`, `apps/web/src/app/scans/[scanId]/page.tsx` | Listado y detalle; el detalle filtra por dueño del dominio.                                            |
| Worker        | `services/scanner/scanner/tasks.py`                                           | `run_scan`: orquesta los checks, emite progreso y llama al callback; traduce errores a `failed`.       |
| Worker        | `services/scanner/scanner/{ssrf,egress}.py`                                   | Tabla de reglas SSRF compartida con Node y cliente HTTP endurecido (`follow_redirects=False`).         |
| Worker        | `services/scanner/scanner/checks/`                                            | `security_headers.py`, `tls.py`, `cookies.py`, `redirects.py`.                                         |
| Worker        | `services/scanner/scanner/report.py`                                          | Cliente del callback: `send_event` y `send_callback`, ambos con el Bearer secreto.                     |
| Datos         | `packages/db/src/schema/{domains,scans,findings,scan-events}.ts`              | Tablas, enums y constraints del dominio; migración `drizzle/0003_scan_domain.sql`.                     |
| Infra         | `infra/docker-compose.dev.yml`                                                | Servicios `postgres`, `redis` y `scanner`; red separada, sin puerto publicado y con `read_only: true`. |

La regla que ordena todo lo anterior: **el worker no importa `packages/db` ni
recibe `DATABASE_URL`**. Habla con Redis para recibir trabajo y con dos rutas
HTTP autenticadas para reportar; la web es el único escritor de las tablas de
escaneo ([TB3]/[TB4]). El detalle del flujo y del contrato está en
[`architecture.md`](./architecture.md#flujo-de-escaneo--implementado-sprint-2).

### La decisión de la insignia `unknown`

`packages/ui` expone siete variantes de `Badge`: `critical`, `high`, `medium`,
`low`, `info`, `unknown` y `neutral`. **No existe una variante `unclassified`**,
aunque el enum `severity` de PostgreSQL sí tenga ese valor y sea el único que el
Sprint 2 escribe. La lista de hallazgos usa `variant="unknown"` y la etiqueta
«Sin clasificar» (`findings-list.tsx`), que es el vocabulario que ADR 0003 define
para una severidad aún no determinada.

Es una brecha de vocabulario, no de datos: cuando el Sprint 3 clasifique
severidades reales, la insignia no cambiará de color sin mapear
`critical`/`high`/... a sus variantes. `packages/ui` es de solo lectura en este
sprint; el mapeo pertenece a la feature de escaneo, no al sistema de diseño.

## Nunca se versiona

`node_modules/`, `.next/`, `.turbo/`, `.codegraph/`, `packages/*/dist/`,
`.env*` (solo `.env.example` se rastrea) y `*.log`. El estado de las
herramientas (`.codegraph`, `.turbo`) es local de la máquina; la configuración
del proyecto (`.atl/`) se rastrea a propósito — ver `.gitignore` para las dos
excepciones deliberadas.
