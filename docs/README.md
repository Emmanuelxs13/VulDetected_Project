# Documentación

Todo lo escrito sobre VulDetected vive aquí. Este es el índice; cada archivo de
abajo es la fuente de verdad única de un tema, y así lo indica en su cabecera.

## Leer en este orden

**¿Es nuevo en el proyecto?**

1. [`roadmap.md`](./roadmap.md) — qué se está construyendo, en qué orden, y qué
   significa "terminado" para cada sprint.
2. [`codebase-map.md`](./codebase-map.md) — la estructura del repositorio, las
   reglas de importación y dónde aterrizan los próximos sprints.
3. [`architecture.md`](./architecture.md) — los tres desplegables, los flujos de
   solicitud y de escaneo, y las fronteras de confianza.
4. [`database.md`](./database.md) — el esquema y las decisiones DDL.

**¿Viene a hacer un cambio?**

5. [`adr/`](./adr/) — por qué el sistema está configurado así. Lea el ADR
   relevante antes de proponer una alternativa.
6. [`security.md`](./security.md) — las condiciones innegociables, con su estado.
7. [`decisions-pending.md`](./decisions-pending.md) — qué se sabe que está sin
   decidir, para que no lo resuelva dos veces.

## Índice

| Archivo                                                    | Qué es                                                                                                                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`roadmap.md`](./roadmap.md)                               | **El plan autoritativo.** Tabla de sprints con entregables y criterios de salida, decisiones aplazadas, leyenda de estados.                                                        |
| [`codebase-map.md`](./codebase-map.md)                     | **Estructura del repositorio y reglas de importación.** Qué va a dónde, el muro `server-only`, la tabla de decisión y los puntos de extensión para los Sprints 2–3.                |
| [`architecture.md`](./architecture.md)                     | Vista general del sistema: desplegables, flujo de registro e inicio de sesión, flujo de escaneo previsto, fronteras de confianza, diagrama ASCII.                                  |
| [`database.md`](./database.md)                             | Referencia del esquema: cada tabla, columna, índice y decisión DDL — además de los **puntos de contacto en la DB que requieren aprobación del propietario**.                       |
| [`local-postgres-setup.md`](./local-postgres-setup.md)     | **Runbook de verificación del Sprint 1 (en uso).** PostgreSQL 18 local mediante pgAdmin 4: rol, base de datos, migraciones, consultas de verificación, prueba de humo de 15 pasos. |
| [`supabase-setup.md`](./supabase-setup.md)                 | Alternativa con Supabase (no ejecutada): creación del proyecto, selección del pooler, migraciones, prueba de humo.                                                                 |
| [`security.md`](./security.md)                             | Modelo de amenazas. Las seis condiciones innegociables, cada una con `Open (planned Sprint N)` o `Done`.                                                                           |
| [`decisions-pending.md`](./decisions-pending.md)           | Preguntas abiertas de producto y de técnica a la espera del propietario.                                                                                                           |
| [`changelog.md`](./changelog.md)                           | Formato Keep a Changelog. El registro continuo de lo que realmente cambió.                                                                                                         |
| [`adr/README.md`](./adr/README.md)                         | Architecture Decision Records — índice y reglas de formato.                                                                                                                        |
| [`adr/0001`](./adr/0001-monorepo-and-runtime-split.md)     | pnpm + Turborepo; Next.js es el único backend TS; Python existe solo para impulsar Nuclei/ZAP.                                                                                     |
| [`adr/0002`](./adr/0002-authentication.md)                 | Better Auth + Drizzle, argon2id, tokens de sesión hasheados, `HttpOnly` + `SameSite=Lax`.                                                                                          |
| [`adr/0003`](./adr/0003-design-tokens-and-color-budget.md) | Tokens semánticos en `@theme` de Tailwind v4, el presupuesto de color y la regla de nunca solo color.                                                                              |
| [`adr/0004`](./adr/0004-database-provider-neutrality.md)   | Sin nombres de host fijos en el código, sin sockets, sin extensiones adicionales — todo a través de `DATABASE_URL`.                                                                |
| [`adr/0005`](./adr/0005-deferred-multi-tenancy.md)         | Sin `organization_id` en el Sprint 1, con el disparador de reconsideración.                                                                                                        |
| [`../infra/README.md`](../infra/README.md)                 | La pila de desarrollo de Docker Compose: cómo ejecutarla y por qué Postgres corre en Docker.                                                                                       |
| [`../README.md`](../README.md)                             | El README principal del proyecto — qué es, cómo se ejecuta y en qué estado se encuentra.                                                                                           |

## Dos documentos que prevalecen sobre los demás

- **Alcance:** si dos archivos discrepan sobre lo que se va a construir,
  gana [`roadmap.md`](./roadmap.md).
- **Arquitectura:** si dos archivos discrepan sobre por qué el sistema está
  configurado así, gana el [ADR](./adr/) relevante.

Todo lo demás es comentario.

## Convenciones usadas en estos documentos

- Escritos en **español**, con los identificadores, rutas y fragmentos de código
  en inglés tal como aparecen en el código base.
- El estado siempre es explícito. "Planificado" es un estado real, no un
  sinónimo de "olvidado".
- No se describe ninguna función a menos que esté planificada en algún lugar.
  Una idea sin entrada en la hoja de ruta no va en la documentación — va en
  [`decisions-pending.md`](./decisions-pending.md).
- Diagramas Mermaid y ASCII solo cuando aclaran algo que el texto no puede.
