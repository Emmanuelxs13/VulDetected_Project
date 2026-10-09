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
│     ├─ features/<dominio>/    porciones de negocio: auth hoy, scans / sites después
│     ├─ components/           componentes del shell de la aplicación, compartidos entre rutas
│     ├─ lib/                  infraestructura de servidor: auth, db, env, audit, password
│     ├─ types/                declaraciones de tipos ambientales (.d.ts)
│     └─ middleware.ts         (planificado, Sprint 2) filtro grueso — nunca autorización
├─ packages/ui                 sistema de diseño presentacional (ADR 0003): tokens,
│                              primitivas, utilidades cn/contrast. Sin lógica, sin datos.
├─ packages/db                 capa de datos (ADR 0004): esquema Drizzle, cliente
│                              neutral respecto del proveedor, migraciones. Sin código de la app.
├─ infra/                      stack de desarrollo con Docker Compose (Redis reservado para el worker del Sprint 2)
├─ docs/                       roadmap, codebase-map, arquitectura, ADRs, runbooks, changelog
└─ services/scanner            (Sprint 2) worker Python + Celery — aislado, solo Docker
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

## Nunca se versiona

`node_modules/`, `.next/`, `.turbo/`, `.codegraph/`, `packages/*/dist/`,
`.env*` (solo `.env.example` se rastrea) y `*.log`. El estado de las
herramientas (`.codegraph`, `.turbo`) es local de la máquina; la configuración
del proyecto (`.atl/`) se rastrea a propósito — ver `.gitignore` para las dos
excepciones deliberadas.
