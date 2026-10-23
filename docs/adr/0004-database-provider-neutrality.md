# ADR 0004: Neutralidad respecto del proveedor de base de datos

- **Estado:** Aceptada
- **Fecha:** Sprint 1

## Contexto

El propietario aún no ha elegido entre un **Postgres local** (Docker, ya
compuesto en `infra/docker-compose.dev.yml`) y **Supabase**. Esa decisión no
bloquea el Sprint 1, y no debe volverse bloqueante más adelante.

El modo de fallo que este ADR existe para prevenir es específico y común: una
base de código acumula supuestos del proveedor hasta que cambiar de proveedor
cuesta una reescritura. Esos supuestos casi siempre son invisibles en la
revisión porque cada uno es individualmente razonable:

- una cadena de conexión construida en código a partir de `PGHOST`,
- una ruta `unix_socket` o un nombre de servicio `postgres` en un DSN,
- `pg_trgm` para una funcionalidad de búsqueda,
- una llamada a `auth.uid()` desde el cliente de Supabase dentro de la lógica de
  negocio,
- migraciones que solo funcionan porque Supabase prehabilitó una extensión.

Cada uno es defendible de forma aislada. Colectivamente son un lock-in que nadie
eligió.

## Decisión

La capa de datos es **neutral respecto del proveedor**. Tres reglas duras.

### 1. Sin nombres de host fijos en el código

No aparece `postgres`, `db`, `127.0.0.1`, `localhost` ni ningún nombre de
servicio en el código de la aplicación ni en las migraciones. El destino de la
conexión viene de `DATABASE_URL`, punto. Los nombres de servicio de Compose son
un detalle de infraestructura y no deben filtrarse en la capa de datos.

### 2. Sin rutas locales de unix socket

La conexión pasa por TCP/TLS hacia el host de la URL. Las rutas de unix socket
(`/var/run/postgresql`, `/tmp/.s.PGSQL.5432`) son específicas de la máquina y no
se traducen a un proveedor gestionado.

### 3. Sin extensiones de Postgres más allá de `citext` y `gen_random_uuid()`

Ambas son del núcleo de Postgres o de primera parte, presentes en todo proveedor
gestionado — incluido Supabase — y disponibles sin privilegios de superusuario.

- **`citext`** — texto sin distinguir mayúsculas para las direcciones de correo.
  La búsqueda sin distinguir mayúsculas para el inicio de sesión es una
  propiedad de seguridad, no un detalle cosmético.
- **`gen_random_uuid()`** — valores por defecto de clave primaria sin una
  extensión. Disponible de forma nativa desde Postgres 13.

**No** se usan explícitamente: `pg_trgm` (búsqueda difusa — necesita `pg_trgm`
en el proveedor, y la búsqueda nativa habría que reconstruirla de otro modo de
todos modos), `uuid-ossp`, PostGIS, `vector` y cualquier cosa que requiera
superusuario. Si una funcionalidad necesita de verdad una extensión, eso se
convierte en un ADR más una decisión del propietario, no en un `CREATE
EXTENSION` incidental dentro de una migración.

### 4. Todo pasa por `DATABASE_URL`

El pool de conexiones, TLS y las credenciales están todos codificados en la URL.
Las migraciones se aplican con drizzle-kit contra esa misma URL — nunca contra
una URL de administración aparte, un socket o un destino fijo en el código.

### Consecuencias de las reglas

- **Cambiar entre Postgres local y Supabase es una única edición de
  `DATABASE_URL`.** Sin cambios de código, sin cambios de compose, sin
  reescritura de migraciones.
- **El pool de conexiones de Supabase funciona**, porque se direcciona puramente
  a través de la URL. Las características del proveedor como Row Level Security
  están _disponibles_ pero no se _dan por supuestas_ — usarlas significa pasar
  por `DATABASE_URL` como cualquier otra cosa.
- **Las migraciones son portables**, de modo que un cambio de proveedor no puede
  producir un corte de servicio que afecte solo a las migraciones.
- **El costo es real:** sin búsqueda difusa salvo con una extensión, y la
  búsqueda debe implementarse con SQL portable (`ILIKE`, enfoques sin trigram, o
  un servicio de búsqueda externo futuro). Ese es un costo funcional genuino,
  aceptado deliberadamente.
- **El ciclo de vida de las conexiones es nuestra responsabilidad.** Neutral
  respecto del proveedor significa que administramos el pooling explícitamente y
  no podemos dar por existente el pooler del proveedor.
- **Un cambio de proveedor no está probado hasta que se prueba.** La neutralidad
  es una garantía estructural, no una prueba de compatibilidad. El plan de
  transición — incluida una restauración de la salida de `pg_dump` y una pasada
  de verificación — es una decisión del propietario registrada en
  [decisions-pending.md](../decisions-pending.md#1-alojamiento-de-la-base-de-datos--resuelto-dos-veces).

## Lo que todavía necesita una decisión del propietario

La neutralidad responde _cómo se conecta la capa de datos_, no _qué proveedor
usar_. Sigue abierto, y deliberadamente no se decide aquí:

- política de respaldo y retención,
- topología del pool de conexiones (pooler de transacciones de Supabase vs
  conexión directa),
- postura de Row Level Security, si RLS se usa como segunda capa de autorización,
- si el plan gratuito tolera el volumen de escaneos del Sprint 2,
- costo con tráfico de producción.

Eso necesita datos de uso reales y conocimiento de precios, no especulación
arquitectónica.

## Consecuencias

**Beneficios aceptados**

- La elección del proveedor es reversible al costo de una variable de entorno.
- La capa de datos es portable y testeable: el mismo código corre contra un
  contenedor local desechable en CI y contra una base de datos gestionada en
  producción.
- Sin dependencia oculta de una extención privilegiada que falle el primer día
  con Supabase.

**Costos aceptados**

- Alguna funcionalidad propia de Postgres queda fuera de la mesa sin
  discusión (búsqueda difusa, PostGIS, búsqueda vectorial nativa).
- Se requiere disciplina en el momento de la revisión: un solo nombre de host
  fijo en el código dentro de un DSN deshace todo esto por completo, y se ve
  como una línea inofensiva.
- Algo más de abstracción en la fábrica de conexiones de la que necesitaría un
  hardcode con una sola URL. La fábrica existe justamente para que la regla sea
  aplicable en un solo lugar.

## Alternativas consideradas

### Elegir Supabase ahora y optimizar para él

Rechazada. Convierte una decisión abierta en un lock-in durante el Sprint 1,
mientras el esquema todavía no ha sobrevivido los dos sprints con mucho esquema
que vienen adelante. El costo de equivocarse (reescribir el almacenamiento de
autenticación, las migraciones y la capa de conexión) es mucho mayor que el
costo de esperar datos reales.

### Elegir solo Postgres local

Rechazada. La misma objeción en sentido inverso: presume una respuesta de
alojamiento que un MVP en etapa de dos personas todavía no necesita dar, y
quedaría horneado un supuesto de "solo compose".

### Abstraer detrás de un ORM con su propio dialecto portable

Rechazada como una indirección innecesaria. Drizzle ya tiene forma de SQL y es
explícito, y eso es lo que hace revisables las reglas de neutralidad. Una capa
de abstracción adicional agregaría un lugar donde esconder violaciones de las
reglas en lugar de quitar uno.

### Usar una base de datos embebida o en el proceso (SQLite, PGlite)

Rechazada. Las escrituras concurrentes de escaneos, la aplicación real de
restricciones y la señal genuina de "¿esto funcionaría en Postgres" argumentan
todas en contra de un motor embebido mientras el esquema todavía se está
moviendo.
