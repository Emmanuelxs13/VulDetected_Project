# Hoja de ruta de VulDetected

El plan autoritativo de VulDetected. Si una afirmación sobre el alcance aparece
en dos lugares, gana este archivo.

Última actualización: Sprint 1, commit de base.

## Leyenda de estados

| Estado          | Significado                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------- |
| **Planificado** | Comprometido con un sprint, no iniciado.                                                       |
| **En curso**    | Se está construyendo activamente ahora.                                                        |
| **Completado**  | Implementado y verificado; se cumplen los criterios de salida.                                 |
| **Bloqueado**   | No se puede avanzar; a la espera de una decisión del propietario o de una dependencia externa. |
| **Aplazado**    | Aplazado deliberadamente fuera del MVP; se registra aquí para que no se olvide.                |

## Mapa de sprints

| Sprint    | Enfoque                                                                                    | Estado      |
| --------- | ------------------------------------------------------------------------------------------ | ----------- |
| Sprint 1  | Monorepo, sistema de diseño, autenticación con correo y contraseña                         | En curso    |
| Sprint 2  | Entrada de URL, verificación de propiedad del dominio, worker de escaneo, progreso en vivo | Planificado |
| Sprint 3  | Clasificación de severidad, panel, remediación por vulnerabilidad                          | Planificado |
| Sprint 4+ | OAuth, facturación, exportaciones PDF ejecutivas, escaneos programados                     | Aplazado    |

---

## Sprint 1 — Fundamentos, sistema de diseño, autenticación

**Estado:** En curso

**Objetivo:** un entorno local en funcionamiento, un registro arquitectónico
defendible y un usuario que pueda registrarse e iniciar sesión.

### Entregables

- Esqueleto del monorepo: pnpm workspaces + Turborepo, Node 22, `.nvmrc`,
  configuración de formato y lint compartida entre paquetes.
- `infra/docker-compose.dev.yml`: Postgres 16, Mailpit, Redis.
- Architecture Decision Records (ADR 0001–0005) que cubren la separación de
  runtimes, la autenticación, los design tokens, la neutralidad de la base de
  datos y el multitenancy aplazado.
- Versión inicial del modelo de amenazas (`docs/security.md`) con cada
  condición innegociable marcada como `Open (planned Sprint N)` o `Done`.
- `apps/web`: aplicación Next.js App Router.
- `packages/db`: esquema Drizzle y las primeras migraciones — `users`,
  `sessions`, `verification_tokens`, `audit_logs`.
- `packages/ui`: tokens semánticos de `@theme` con enfoque CSS en Tailwind v4,
  más las primitivas base (Button, Input, Card, Badge, Alert).
- Autenticación: correo y contraseña mediante Better Auth, hash de contraseña
  con argon2id, tokens de sesión hasheados en Postgres.
- Sistema de diseño: capa de tokens semánticos, paleta de severidad, insignias
  conformes a WCAG (color + icono + texto), prueba automatizada de contraste
  contra la paleta de severidad.
- `README.md` (raíz), el conjunto `docs/` y `docs/changelog.md` como registro
  continuo.

### Criterios de salida

- [ ] `pnpm install` termina sin errores en Node 22 con pnpm 10.
- [ ] `docker compose -f infra/docker-compose.dev.yml up -d` levanta Postgres
      sano, Mailpit accesible y Redis accesible.
- [ ] Las migraciones de Drizzle se aplican sin errores a una base de datos
      vacía y pueden revalidarse con `drizzle-kit check` (después de la
      **aprobación del propietario**, ver
      [database.md](./database.md#puntos-de-contacto-en-la-db--se-requiere-decisión-del-propietario)).
- [ ] `pnpm check` (lint + typecheck + format:check) pasa.
- [ ] Un usuario puede registrarse, recibir un correo de verificación en
      Mailpit, iniciar sesión y cerrarla, con la sesión que sobrevive a una
      recarga de página.
- [ ] Los tokens de sesión se guardan hasheados; el token en crudo nunca toca
      la base de datos.
- [ ] La paleta de severidad pasa una prueba automatizada de contraste (no una
      revisión visual manual).
- [ ] No existe ninguna columna `organization_id` en todo el esquema.
- [ ] `docs/changelog.md` registra todo lo añadido en este sprint.

---

## Sprint 2 — Entrada de URL, verificación de propiedad, worker de escaneo y progreso en vivo

**Estado:** Planificado

**Objetivo:** el momento en que el producto se vuelve real — un usuario envía
una URL de su propiedad y observa un escaneo en ejecución.

### Entregables

- Entrada de URL con normalización y rechazo de todo lo que no sea una URL
  http(s) pública bien formada.
- Verificación de la propiedad del dominio, **obligatoria antes de encolar
  cualquier trabajo**:
  - desafío de token `TXT` de DNS, y/o
  - desafío de archivo `/.well-known/`,
  - la prueba se persiste con la marca de tiempo del problema, el método y el
    registro que la verificó.
- Tablas: `domains`, `scans`, `findings`, `scan_events`.
- `services/scanner`: worker Python + Celery que orquesta Nuclei y ZAP contra
  el dominio verificado.
- Endurecimiento SSRF en la ruta de salida del worker: resolución DNS, rechazo
  de rangos privados / de loopback / link-local, revalidación después de cada
  redirección, lista de permitidos de puertos restringida.
- Aislamiento de red del worker: salida filtrada, sistema de archivos raíz de
  solo lectura, capacidades retiradas.
- Progreso en tiempo real transmitido al navegador (server-sent events) mediante
  `scan_events`.
- Limitación de tasa en el envío de escaneos y en los endpoints de
  autenticación.

### Criterios de salida

- [ ] No se puede encolar un escaneo sin una prueba de propiedad verificada; la
      salvaguarda está cubierta por pruebas, no solo por convención.
- [ ] Las defensas SSRF resisten redirecciones a `127.0.0.1`,
      `169.254.169.254` (metadatos de la nube), rangos RFC1918 y loopback IPv6 —
      demostrado con pruebas.
- [ ] El worker corre con un sistema de archivos de solo lectura y no puede
      acceder a las credenciales de Postgres ni a la red privada del host.
- [ ] Un usuario ve el progreso en vivo en menos de 2 segundos desde el inicio
      del trabajo.
- [ ] Los hallazgos se almacenan con una forma normalizada e independiente de la
      herramienta que los produjo (Nuclei y ZAP se mapean al mismo registro).
- [ ] El envío de escaneos tiene limitación de tasa y el límite se aplica en el
      servidor.

---

## Sprint 3 — Severidad, panel y remediación con código

**Estado:** Planificado

**Objetivo:** convertir una lista cruda de hallazgos en algo sobre lo que cada
audiencia pueda actuar.

### Entregables

- Clasificación de severidad: Crítica / Alta / Media / Baja / Info, con un
  mapeo determinista y documentado desde los hallazgos de las herramientas —
  no un volcado crudo de CVSS.
- Modelo de contenido de remediación: orientación por vulnerabilidad dirigida a
  un desarrollador, un administrador de sistemas y un responsable de negocio,
  incluido el código de corrección concreto cuando el remedio real es un cambio
  de código.
- Almacenamiento y versionado del contenido, de modo que la orientación de
  remediación pueda corregirse sin invalidar los hallazgos históricos.
- Panel: historial de escaneos, tendencia de postura por dominio, lista de
  hallazgos filtrable, desglose de severidad.
- Vista de detalle del hallazgo: descripción, evidencia, endpoint afectado,
  pasos de remediación y código de corrección copiable.
- Exportación de hallazgos a CSV/JSON para equipos que necesitan crear tickets.

### Criterios de salida

- [ ] Cada hallazgo resuelve a exactamente una severidad, con la regla de
      mapeo visible en la interfaz (sin puntuaciones sin explicar).
- [ ] Cada hallazgo Crítico y Alto tiene contenido de remediación; la
      compilación falla si existe un registro con severidad sin ese contenido.
- [ ] Los ejemplos de código de remediación pasan verificación de sintaxis; no
      se pegan de memoria.
- [ ] El panel carga un dominio con 10 000 hallazgos sin degradarse (acceso
      paginado o por cursor, sin consultas sin límite).
- [ ] Un administrador de sistemas y un responsable de negocio pueden leer cada
      uno su propia vista sin que un desarrollador se lo traduzca.

---

## Sprint 4+ — Aplazado

**Estado:** Aplazado

Explícitamente fuera del MVP. Se registra para que "no construido" sea una
decisión y no una omisión.

| Capacidad                    | Por qué se aplaza                                                                                                                                        | Disparador para revisarlo                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| OAuth con Google / GitHub    | Correo y contraseña demuestran la tubería de autenticación; OAuth añade configuración de proveedor y superficie de redirección antes de que se necesite. | Sprint 4, o en la primera solicitud de incorporación empresarial  |
| Facturación con Stripe       | Aún no se entrega ningún valor medible — facturar antes de que los escaneos funcionen es prematuro.                                                      | Sprint 4, después de que S3 demuestre patrones de retención y uso |
| Exportaciones PDF ejecutivas | Requiere que el modelo de severidad sea estable; generar PDFs contra una clasificación en movimiento desperdicia esfuerzo.                               | Después de que pasen los criterios de salida del Sprint 3         |
| Escaneos programados         | Necesita un planificador con su propia historia de fiabilidad (reintentos, recuperación de atrasos, manejo de zonas horarias).                           | Sprint 4+ con el modelo de facturación y medición                 |

---

## Decisiones aplazadas

Estas están abiertas o aplazadas deliberadamente. Consulte
[decisions-pending.md](./decisions-pending.md) para las preguntas y
[adr/](./adr/) para el razonamiento de las que ya están resueltas.

### Supabase vs PostgreSQL local — SIN RESOLVER

No está bloqueada por una decisión técnica. Como la capa de datos es neutral
respecto del proveedor (ADR 0004), la elección es **un único cambio de
`DATABASE_URL`**: la cadena de conexión de Supabase reemplaza a la local de
Docker y nada del código de la aplicación se mueve. Lo que sigue abierto es el
lado _operativo_ — la política de copias de seguridad, el agrupamiento de
conexiones (el pooler transaccional de Supabase frente a una conexión directa),
la postura de seguridad a nivel de fila y si el plan gratuito tolera el volumen
de escaneos que generará el Sprint 2. Esas respuestas necesitan datos reales de
uso, no especulación.

La posición neutral es deliberada: apostar por un proveedor antes de que el
esquema haya sobrevivido dos sprints con cambios de esquema sería prematuro.

### Multitenancy / organizaciones — aplazado deliberadamente hasta S4+

La justificación y el disparador de reconsideración están en
[ADR 0005](./adr/0005-deferred-multi-tenancy.md). Versión corta: agregar
`organization_id` ahora implica una columna NOT NULL y un backfill en cada tabla
que crece en el Sprint 2 y el Sprint 3, antes de que un solo usuario real lo
haya pedido. El costo se aplaza, no la capacidad.

### Facturación

Aplazada junto con el resto del Sprint 4+. Stripe no es solamente una página de
pagos: obliga a decidir sobre cuotas, medición y cuánto cuesta un "escaneo", y
esa decisión debe seguir a la evidencia sobre cuánto dura un escaneo real y qué
vuelven a ejecutar los usuarios.

### Escaneo programado

Aplazado. Un planificador introduce sus propios modos de fallo — ejecuciones
perdidas, ejecuciones duplicadas, recuperación tras un tiempo de inactividad —
que merecen un sprint dedicado en lugar de una función secundaria en el MVP.

---

## Cómo evoluciona este documento

- Los estados se actualizan **a medida que avanza el trabajo**, no al final de
  un sprint.
- Las nuevas decisiones arquitectónicas reciben un ADR nuevo en `docs/adr/` y
  un enlace desde aquí.
- Los cambios de alcance se registran primero aquí, de modo que el
  razonamiento sobrevive a la persona que lo tomó.
