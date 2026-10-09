# Decisiones abiertas

Preguntas a la espera del **propietario**. Son decisiones de producto y
operativas, no tareas de ingeniería — la ingeniería puede construir ambos lados,
así que la elección se registra aquí en lugar de tomarse implícitamente en el
código.

Relacionado: [roadmap.md](./roadmap.md) → [Decisiones aplazadas](./roadmap.md#decisiones-aplazadas).

---

## 1. Alojamiento de la base de datos — RESUELTO (dos veces)

**Estado:** Resuelto. **PostgreSQL 18 local mediante pgAdmin 4**, para la
verificación del Sprint 1.

La capa de datos es neutral respecto del proveedor (ver
[ADR 0004](./adr/0004-database-provider-neutrality.md)), de modo que esto siempre
fue una edición de `DATABASE_URL`. El propietario eligió primero **Supabase** y
luego cambió a un servidor **PostgreSQL 18 local** para el Sprint 1 porque ya
está instalado y en ejecución en la máquina de desarrollo (18.3, puerto 5432,
pgAdmin 4 a su lado).

Runbook actual: [`local-postgres-setup.md`](./local-postgres-setup.md).
Alternativa con Supabase, no ejecutada: [`supabase-setup.md`](./supabase-setup.md).

**La neutralidad del proveedor no se puso a prueba, pero aquí es determinante.**
Se eligió el `Session pooler (5432)` de Supabase frente al pooler transaccional
porque el modo transaccional destruye el estado de sesión y los pipelings de
`postgres.js` por defecto. Un servidor local no tiene pooler en absoluto, de modo
que la elección nunca surge — pero en cuanto el proyecto se mude a Supabase, esa
tabla vuelve a aplicarse, y `LISTEN/NOTIFY` en el Sprint 2 convierte la cuestión
en una decisión real y no en una preferencia.

Subpreguntas abiertas restantes:

- Copias de seguridad y política de retención.
- Si usar la seguridad a nivel de fila de Supabase como una segunda capa de
  autorización. Está _disponible_ sin violar la neutralidad, pero _usarla_ es
  una decisión de autorización, no un detalle de configuración. (No aplica a un
  servidor local; esta pregunta solo existe si se adopta Supabase.)
- Costo con tráfico de producción.

---

## 2. ¿Textos de la interfaz en español o en inglés?

**Estado:** Sin resolver.

Todo el código base, la documentación y los commits están en inglés por contrato.
Los **textos de la interfaz orientados al producto** son una pregunta aparte y no
se han decidido.

Subpreguntas abiertas:

- ¿La interfaz es solo en inglés, solo en español o bilingüe desde el inicio?
- Si es bilingüe, ¿i18n desde el primer componente, o primero inglés con los
  textos centralizados para que la traducción sea posible más adelante?
  Centralizar los textos en el Sprint 1 es un seguro barato; cablear i18n
  completo antes de que los textos existen es caro.
- ¿Las tres audiencias (desarrollador, administrador de sistemas, responsable de
  negocio) leen el mismo idioma? Un responsable de negocio y el desarrollador que
  contrató pueden diferir.

**Por qué importa ahora:** incorporar i18n después toca cada componente, de modo
que "decidir después" tiene un costo real. No hace falta decidirlo _esta_ semana,
pero la respuesta debería ser "centralizar los textos" o "ir a bilingüe" en lugar
de dejarlo implícito.

---

## 3. ¿Se exige la verificación de correo antes del primer inicio de sesión?

**Estado:** Sin resolver.

`users.email_verified` (booleano) existe para que esto pueda cambiar sin una
migración. La pregunta de producto es si una cuenta puede iniciar sesión antes de
verificarse.

- **Exigida antes del primer inicio de sesión** — mayor integridad; cuesta
  fricción y una vía de soporte para quienes nunca ven el correo.
- **Permitida antes de verificar, con limitaciones para las cuentas sin verificar**
  — menor fricción; la aplicación debe entonces imponer el límite, que es una
  ruta real de código y un lugar real para equivocarse en la comprobación.

También está abierta la pregunta de si una cuenta sin verificar puede crear un
escaneo en absoluto.

**Nota:** `account_status` tiene actualmente por defecto `active`, porque la
verificación de correo está desactivada en el Sprint 1 y ninguna ruta de código
realiza todavía la transición. Cuando se tome esta decisión, ese valor por
defecto es lo que cambia — y cambiarlo es una migración, que es exactamente por
qué necesita una decisión del propietario antes de que el Sprint 2 redacte
`scans`.

---

## 4. Cuota de escaneos del plan gratuito para el MVP

**Estado:** Sin resolver.

La cantidad de escaneos que recibe una cuenta gratuita por mes. Es una decisión
de producto con una consecuencia directa de costo, y está bloqueada por saber qué
cuesta realmente un escaneo en tiempo de reloj y en capacidad del worker — algo
que el Sprint 2 mide en lugar de predecir.

Subpreguntas abiertas:

- ¿Escaneos por mes o por día? Lo mensual es más fácil de comunicar; lo diario
  reparte mejor la carga.
- ¿Un reescaneo del mismo dominio cuenta como un escaneo nuevo?
- ¿Los escaneos concurrentes se limitan por separado del volumen total?
- ¿Qué ocurre al llegar al límite: bloqueo duro o una posición en cola?
- ¿Un escaneo fallido cuenta contra la cuota? (Recomendación: no — cobrar por
  nuestros propios fallos es indefendible).

**Postura interina:** la limitación de tasa existe en el Sprint 2 para proteger
el sistema; la _cuota_ como concepto de producto espera datos reales de costo.

---

## 5. Periodo de retención de los resultados de escaneo

**Estado:** Sin resolver.

Cuánto tiempo se conservan `scans`, `findings` y `scan_events`.

- **Costo de almacenamiento** — `scan_events` crece más rápido y es lo más
  probable que se recorte primero.
- **Exposición de seguridad** — los payloads crudos de las herramientas pueden
  contener endpoints descubiertos en el objetivo y, posiblemente, cabeceras de
  autenticación o tokens reflejados por el objetivo. Una retención más larga
  significa una ventana de exposición más larga. Depurar al escribir es la
  corrección correcta; la retención es una segunda línea de defensa.
- **Valor de producto** — una tendencia de postura de seguridad necesita
  historial; un hallazgo que desaparece socava la confianza.
- **Regulatorio** — depende de la jurisdicción del cliente y de sus propias
  obligaciones.

Subpreguntas abiertas: ¿retención por plan? ¿eliminación visible para el usuario?
¿una ruta explícita de "eliminar todos mis datos"?

**Por qué importa ahora:** la retención es mucho más barata de diseñar dentro de
las tablas del Sprint 2 que de incorporar después, porque el trabajo de
eliminación y sus cascadas deben existir desde el inicio.

---

## Resueltas desde el inicio del proyecto

Se conservan aquí para que el razonamiento no se pierda.

| Pregunta                                   | Resolución                                                                         | Dónde                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Alojamiento de la base de datos            | PostgreSQL 18 local mediante pgAdmin 4 (Supabase documentado como alternativa)     | [local-postgres-setup.md](./local-postgres-setup.md)     |
| Estructura del monorepo                    | pnpm workspaces + Turborepo, Next.js App Router como único backend TS              | [ADR 0001](./adr/0001-monorepo-and-runtime-split.md)     |
| Biblioteca de autenticación                | Better Auth + Drizzle, correo + contraseña, argon2id                               | [ADR 0002](./adr/0002-authentication.md)                 |
| Estrategia de design tokens                | `@theme` de Tailwind v4, tokens semánticos, presupuesto de color, nunca solo color | [ADR 0003](./adr/0003-design-tokens-and-color-budget.md) |
| Acoplamiento al proveedor de base de datos | Neutral respecto del proveedor; un solo cambio de `DATABASE_URL` para alternar     | [ADR 0004](./adr/0004-database-provider-neutrality.md)   |
| Momento del multitenancy                   | Aplazado hasta el Sprint 4+ con un disparador de reconsideración documentado       | [ADR 0005](./adr/0005-deferred-multi-tenancy.md)         |
