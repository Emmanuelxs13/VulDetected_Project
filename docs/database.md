# Base de datos

Referencia del esquema de VulDetected y de las decisiones que lo respaldan.
Documentación del esquema del Sprint 1 únicamente — el Sprint 2 añade las tablas
de escaneo, y esos puntos de contacto se enumeran explícitamente en
[Puntos de contacto en la DB — se requiere decisión del propietario](#puntos-de-contacto-en-la-db--se-requiere-decisión-del-propietario).

> **Aún no se ha ejecutado ninguna migración.** Nada de lo que aparece en este
> documento se ha aplicado a ninguna base de datos. El esquema que sigue es el
> diseño de referencia, no la descripción de una base de datos en funcionamiento.

El acceso siempre se realiza a través de `DATABASE_URL`. Las migraciones se
aplican con drizzle-kit contra esa URL — ver
[ADR 0004](./adr/0004-database-provider-neutrality.md).

## Decisiones DDL ya tomadas

Están resueltas. Cambiar cualquiera de ellas implica un ADR más una decisión del
propietario.

| Decisión                                   | Valor                                                | Por qué                                                                                                                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Extensión**                              | `citext`                                             | Búsqueda de correo sin distinguir mayúsculas de minúsculas. El inicio de sesión sin distinguir mayúsculas es una propiedad de seguridad, no un adorno. Disponible en todo proveedor gestionado, sin superusuario. |
| **Valor por defecto de la clave primaria** | `gen_random_uuid()`                                  | Claves primarias UUID sin una extensión; nativo desde Postgres 13. Evita un vector de enumeración por ID secuenciales y evita conceder `CREATE SEQUENCE` por tabla.                                               |
| **Tipo enum: `account_status`**            | `pending`, `active`, `suspended`, `deleted`          | El dominio de estados de cuenta como tipo de base de datos en lugar de texto libre. Un estado incorrecto lo rechaza la base de datos en lugar de una rama `else` a tres capas de distancia.                       |
| **Tipo enum: `token_purpose`**             | `verify_email`, `reset_password`, `domain_ownership` | `domain_ownership` está reservado para el desafío DNS/`/.well-known` del Sprint 2, de modo que el vocabulario de propósitos queda fijo antes de que ese código exista.                                            |

Extensiones **no** utilizadas, y por qué: `pg_trgm` (específica del proveedor; la
búsqueda difusa debe construirse de forma portable), `uuid-ossp` (reemplazada por
`gen_random_uuid()` integrado), PostGIS, `vector` — cualquier cosa que requiera
superusuario queda fuera de alcance hasta que existan un ADR y una decisión del
propietario.

## Esquema actual (Sprint 1)

> **Esta sección documenta el esquema tal como se generó en
> `packages/db/drizzle/`, verificado leyendo `0001_auth_and_audit_schema.sql`.**
> Cuando un borrador anterior discrepaba del SQL generado, ganaba el SQL y el
> borrador se corregía. Más abajo se señalan dos correcciones concretas, porque
> un documento de diseño que se desvía en silencio de la migración es peor que
> uno que nunca se escribió.

### `users`

| Columna              | Tipo             | Null | Valor por defecto   | Notas                                                                                                                                                                                                                                                                         |
| -------------------- | ---------------- | ---- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | `uuid`           | no   | `gen_random_uuid()` | Clave primaria. La aporta la base de datos, no la aplicación.                                                                                                                                                                                                                 |
| `email`              | `citext`         | no   | —                   | `citext`: sin distinguir mayúsculas, de modo que `A@x.com` y `a@x.com` son una sola cuenta. Única.                                                                                                                                                                            |
| `email_verified`     | `boolean`        | no   | `false`             | **Corregido.** El adaptador de Better Auth requiere exactamente esta columna booleana; una marca de tiempo `email_verified_at` no es algo que vaya a escribir.                                                                                                                |
| `name`               | `text`           | no   | —                   | **Corregido a NOT NULL.** El esquema de entrada `signUpEmail` de Better Auth requiere `name: z.string()`, de modo que una columna anulable contradeciría el propio contrato de la biblioteca. El formulario sigue siendo opcional porque se deriva la parte local del correo. |
| `image`              | `text`           | sí   | `null`              | URL del avatar, reservada para OAuth en el Sprint 4+.                                                                                                                                                                                                                         |
| `status`             | `account_status` | no   | `'active'`          | Enum `pending`/`active`/`suspended`/`deleted`. Suspensión sin borrado, para que el historial de auditoría sobreviva.                                                                                                                                                          |
| `locale`             | `text`           | no   | `'es'`              | Idioma de presentación por usuario. El valor por defecto coincide con el mercado inicial del producto.                                                                                                                                                                        |
| `failed_login_count` | `integer`        | no   | `0`                 | Impulsa la escalera de bloqueo progresivo. Solo lo escribe la acción de inicio de sesión, de forma atómica.                                                                                                                                                                   |
| `locked_until`       | `timestamptz`    | sí   | `null`              | Lo fija la escalera de bloqueo; se vuelve a imponer en la creación de la sesión.                                                                                                                                                                                              |
| `deleted_at`         | `timestamptz`    | sí   | `null`              | Marcador de borrado lógico.                                                                                                                                                                                                                                                   |
| `created_at`         | `timestamptz`    | no   | `now()`             | Momento de creación de la fila.                                                                                                                                                                                                                                               |
| `updated_at`         | `timestamptz`    | no   | `now()`             | Mantenido por la capa de datos — no debe desviarse.                                                                                                                                                                                                                           |

**Por qué existe cada columna sensible**

- `email` — el identificador de inicio de sesión. `citext` es lo que hace seguro
  el cotejo sin distinguir mayúsculas; un índice único sensible a mayúsculas
  permitiría que `A@x.com` y `a@x.com` se registraran como dos cuentas. Lo impone
  la base de datos en lugar de pasar a minúsculas en el código de la aplicación,
  algo que un cliente SQL directo eludiría.
- `status` — permite suspender y revocar sin eliminar una fila de usuario.
  Por defecto es `active` y no `pending`, porque la verificación de correo está
  **desactivada** en el Sprint 1 (`docs/decisions-pending.md`). Poner por defecto
  un estado no activo mientras no existe la transición que lo activaría bloquearía
  toda cuenta.
- `failed_login_count` / `locked_until` — limitación por cuenta. La limitación
  solo por IP la derrota un botnet; la limitación por cuenta es lo que frena una
  lista de contraseñas dirigida a un solo usuario.

**El almacén de contraseñas no es una columna de `users`.** El hash argon2id
vive en `accounts.password` — ese es el esquema de Better Auth, no una
preferencia. Ver [ADR 0002](./adr/0002-authentication.md).

### `accounts`

> **La tabla más malinterpretada del esquema.** El hash argon2id vive aquí, no
> en `users`. Better Auth es dueño de esta tabla; la aplicación lee de ella pero
> no la diseña.

| Columna                    | Tipo          | Null | Valor por defecto   | Notas                                                                                                   |
| -------------------------- | ------------- | ---- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                       | `uuid`        | no   | `gen_random_uuid()` | Clave primaria sustituta, aportada por la base de datos.                                                |
| `account_id`               | `text`        | no   | —                   | El ID de la identidad **dentro** de su proveedor. Para inicios de sesión `credential` es el `users.id`. |
| `provider_id`              | `text`        | no   | —                   | `credential` hoy; `google` en el Sprint 4. Misma tabla, sin cambio de esquema.                          |
| `user_id`                  | `uuid`        | no   | —                   | FK → `users`, `ON DELETE CASCADE`.                                                                      |
| `password`                 | `text`        | sí   | `null`              | **El resumen `$argon2id$`.** Nulo para las filas de OAuth.                                              |
| `access_token`             | `text`        | sí   | `null`              | Token de acceso de OAuth, sin uso hasta el Sprint 4.                                                    |
| `refresh_token`            | `text`        | sí   | `null`              | Token de refresco de OAuth, sin uso hasta el Sprint 4.                                                  |
| `id_token`                 | `text`        | sí   | `null`              | Token ID de OIDC, sin uso hasta el Sprint 4.                                                            |
| `access_token_expires_at`  | `timestamptz` | sí   | `null`              | Caducidad de OAuth, sin uso hasta el Sprint 4.                                                          |
| `refresh_token_expires_at` | `timestamptz` | sí   | `null`              | Caducidad de OAuth, sin uso hasta el Sprint 4.                                                          |
| `scope`                    | `text`        | sí   | `null`              | Ámbitos concedidos por OAuth, sin uso hasta el Sprint 4.                                                |
| `created_at`               | `timestamptz` | no   | `now()`             | Momento de creación de la fila.                                                                         |
| `updated_at`               | `timestamptz` | no   | `now()`             | Mantenido por la capa de datos.                                                                         |

**Por qué es una tabla separada**

Dos preocupaciones se separan deliberadamente:

- `users` es el **modelo de dominio** — nombre, correo, estado de cuenta,
  contadores de bloqueo. Todo aquello sobre lo que el producto razona.
- `accounts` es la **capa de credenciales** que posee Better Auth. Almacena cómo
  se autentica un usuario, que es una pregunta distinta de quién es.

Mantenerlas separadas significa que OAuth en el Sprint 4 añade filas, no
columnas: la tabla `users` nunca llega a saber lo que es un refresh token, y el
modelo de usuario de la aplicación nunca lleva un secreto que no debería llevar.

**Por qué la credencial no debe moverse a `users`**

Este es el esquema de Better Auth, no una preferencia de estilo (ver
[ADR 0002](./adr/0002-authentication.md)). Moverla rompería el adaptador y
también difuminaría una frontera que conviene mantener: cualquier consulta que
selecciona de `users` ya está libre de secretos, de modo que un `SELECT *`
imprudente no puede filtrar un hash de contraseña.

**Por qué `ON DELETE CASCADE`**

Cerrar una cuenta debe eliminar sus credenciales y sus sesiones a la vez. Una
fila de credencial huérfana de un usuario eliminado es un secreto sin dueño.
`audit_logs` es la única tabla que deliberadamente **no** aplica en cascada — la
evidencia sobrevive a la cuenta.

**La restricción de unicidad que evita cuentas duplicadas**

`accounts_provider_account_key UNIQUE (provider_id, account_id)` garantiza una
fila de identidad por proveedor. Sin ella, un reintento durante el registro
podría insertar dos filas de credencial para la misma persona y el segundo inicio
de sesión crearía una sesión unida a la incorrecta.

### `sessions`

| Columna      | Tipo          | Null | Valor por defecto   | Notas                                                                                      |
| ------------ | ------------- | ---- | ------------------- | ------------------------------------------------------------------------------------------ |
| `id`         | `uuid`        | no   | `gen_random_uuid()` | Clave primaria.                                                                            |
| `user_id`    | `uuid`        | no   | —                   | FK → `users.id` `ON DELETE CASCADE`. Eliminar un usuario no debe dejar sesiones activas.   |
| `token`      | `text`        | no   | —                   | **Corregido.** Aquí vive el token de sesión **en crudo**, no un resumen. Ver abajo. Único. |
| `expires_at` | `timestamptz` | no   | —                   | Caducidad absoluta; las sesiones no se renuevan indefinidamente.                           |
| `ip_address` | `text`        | sí   | `null`              | Dirección desde la que se creó la sesión, para investigar abusos.                          |
| `user_agent` | `text`        | sí   | `null`              | Mismo propósito; hace posible el triaje de sesiones secuestradas.                          |
| `created_at` | `timestamptz` | no   | `now()`             | Momento de creación de la fila.                                                            |
| `updated_at` | `timestamptz` | no   | `now()`             | Se actualiza como máximo una vez al día mediante `updateAge` de Better Auth.               |

**El token de sesión se guarda en claro, y eso es una brecha conocida.**

Un borrador anterior de este documento especificaba una columna `token_hash` con
un resumen SHA-256. **Esa columna nunca se creó, y la afirmación nunca fue
cierta.** Better Auth `1.7.7` hashea el token internamente, usa el resumen para
la cláusula `RETURNING` y deriva la cookie de ese valor devuelto — de modo que
hashear de nuevo al escribir colocaría el _resumen_ en la cookie y rompería toda
solicitud posterior. El recorrido completo está documentado en
[ADR 0002](./adr/0002-authentication.md) y se registra como hallazgo abierto en
[security.md](./security.md#4-seguridad-de-la-sesión).

Aceptado para el Sprint 1 con controles compensatorios: caducidad absoluta de 7
días, `HttpOnly`, `SameSite=Lax`, `Secure` en producción, revocación inmediata en
el servidor y control de la cuenta en la creación de la sesión. Revisar antes de
cualquier lanzamiento público.

`ip_address` y `user_agent` existen porque, sin ellos, detectar una sesión
secuestrada es una suposición. Son metadatos, no identificadores, y no se usan
para decisiones de limitación de tasa que podrían bloquear a un usuario con una
IP compartida o móvil.

### `verification_tokens`

| Columna      | Tipo            | Null | Valor por defecto   | Notas                                                                                                                                                                                                             |
| ------------ | --------------- | ---- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `uuid`          | no   | `gen_random_uuid()` | Clave primaria.                                                                                                                                                                                                   |
| `identifier` | `text`          | no   | —                   | Clave de búsqueda — el correo, en la mayoría de los flujos. **Se almacena hasheado con SHA-256**, mediante `verification.storeIdentifier: 'hashed'`, que no es el valor por defecto de la biblioteca (`"plain"`). |
| `value`      | `text`          | no   | —                   | El propio token. **Se almacena en crudo** — ver abajo.                                                                                                                                                            |
| `purpose`    | `token_purpose` | sí   | `null`              | `verify_email` / `reset_password` / `domain_ownership`. Evita que los tipos de token sean intercambiables.                                                                                                        |
| `expires_at` | `timestamptz`   | no   | —                   | Caducidad absoluta.                                                                                                                                                                                               |
| `created_at` | `timestamptz`   | no   | `now()`             | Momento de creación de la fila.                                                                                                                                                                                   |
| `updated_at` | `timestamptz`   | no   | `now()`             | Momento de actualización de la fila.                                                                                                                                                                              |

**Forma corregida.** Un borrador anterior especificaba `user_id`, una columna
`email` y una columna `token_hash`. Ninguna de ellas existe. El modelo de Better
Auth es `(identifier, value)`: no hay FK de usuario, porque un token de
verificación debe poder resolverse _antes_ de que exista la fila de usuario. El
esquema se cambió para ajustarse, y no se declara ninguna relación
`verificationTokens → users`, porque no hay columna sobre la que unir.

**`value` se almacena en crudo y no puede hashearse con una opción central.**
Verificado: `createVerificationValue` aplica `processIdentifier` solo al
_identifier_ y despacha el resto del payload sin tocarlo. Existe una opción
`storeToken`, pero pertenece al _plugin_ de magic-link, no a la verificación de
correo central.

Esto está actualmente inerte — `sendOnSignUp` es `false` y el Sprint 1 no tiene
mailer, de modo que nunca se escribe ninguna fila. Se activa en cuanto llega el
correo en el Sprint 2, y debe resolverse antes de que se envíe el primer correo de
verificación.

`purpose` es lo que evita que los tipos de token sean intercambiables: sin él, un
valor filtrado de un flujo de correo sería válido en otro. `domain_ownership`
está reservado para el desafío de propiedad del Sprint 2, de modo que el
vocabulario queda fijo antes de que la función lo necesite.

### `audit_logs`

**Solo-append.** Las filas nunca se actualizan ni se eliminan mediante código de
la aplicación — según OWASP A09 (2021: Security Logging and Monitoring Failures),
un registro de auditoría que se puede reescribir no es evidencia.

| Columna         | Tipo          | Null | Valor por defecto   | Notas                                                                                                                                                          |
| --------------- | ------------- | ---- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | `uuid`        | no   | `gen_random_uuid()` | Clave primaria.                                                                                                                                                |
| `actor_user_id` | `uuid`        | sí   | `null`              | FK → `users.id`. Anulable: los eventos de autenticación (intentos de inicio de sesión, fallos) aún no tienen un actor autenticado.                             |
| `action`        | `text`        | no   | —                   | Verbo estable legible por máquina: `auth.login.succeeded`, `auth.login.failed`, `scan.enqueued`, `domain.ownership.verified`. No es un mensaje de texto libre. |
| `target_type`   | `text`        | sí   | `null`              | Tipo de entidad sobre la que se actuó, p. ej. `user`, `session`, `scan`.                                                                                       |
| `target_id`     | `uuid`        | sí   | `null`              | Identificador de la entidad afectada.                                                                                                                          |
| `metadata`      | `jsonb`       | sí   | `null`              | Contexto estructurado. Explícitamente **nunca** almacena contraseñas, tokens en crudo, cookies completas ni cabeceras de autenticación.                        |
| `ip_address`    | `text`        | sí   | `null`              | Dirección de origen del evento.                                                                                                                                |
| `user_agent`    | `text`        | sí   | `null`              | Identidad del cliente del evento.                                                                                                                              |
| `created_at`    | `timestamptz` | no   | `now()`             | Momento del evento. Solo-append implica que esta columna es el ordenamiento autoritativo.                                                                      |

Por qué existe: la respuesta a incidentes empieza con "¿cuándo pasó esto y quién
lo hizo". Sin un registro solo-append, una investigación de una brecha no tiene
nada con lo que empezar. La anulabilidad de `actor_user_id` es deliberada — los
inicios de sesión fallidos son exactamente los eventos que vale la pena registrar,
y no tienen usuario.

## Índices y por qué existe cada uno

| Índice                               | Tabla                 | Tipo          | Para qué sirve                                                                                                                                                                                 |
| ------------------------------------ | --------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users_email_unique`                 | `users`               | unique        | Impone una cuenta por dirección y hace que la búsqueda de inicio de sesión acierte en un solo índice. Con `citext`, sin distinguir mayúsculas por construcción.                                |
| `users_status_idx`                   | `users`               | btree         | "Todas las cuentas suspendidas", y el control del estado de la cuenta en la creación de la sesión.                                                                                             |
| `users_locked_until_idx`             | `users`               | partial btree | Barridos de bloqueo. Parcial sobre `locked_until IS NOT NULL`, de modo que el índice contiene solo las filas realmente bloqueadas y no a todos los usuarios.                                   |
| `sessions_token_unique`              | `sessions`            | unique        | Validación de sesión en **cada solicitud autenticada**. Debe ser único y debe existir — sin él, la verificación del token degrada a un recorrido secuencial. El índice más activo del esquema. |
| `sessions_user_id_idx`               | `sessions`            | btree         | "Listar / revocar todas las sesiones de este usuario" — lo usan el cierre de sesión en todas partes y la respuesta a incidentes.                                                               |
| `sessions_expires_at_idx`            | `sessions`            | btree         | Barridos de caducidad de sesión y revocación. También permite una limpieza barata tipo TTL.                                                                                                    |
| `accounts_provider_account_key`      | `accounts`            | unique        | Una fila por cuenta de proveedor. **Corregido a índice único** — era un índice simple, que habría permitido filas duplicadas para la misma identidad de proveedor.                             |
| `accounts_user_id_idx`               | `accounts`            | btree         | Búsqueda de credenciales por usuario; también es el destino de la FK para los borrados en cascada.                                                                                             |
| `verification_tokens_lookup_idx`     | `verification_tokens` | btree         | La búsqueda `(identifier, value)` que hace cada verificación.                                                                                                                                  |
| `verification_tokens_expires_at_idx` | `verification_tokens` | btree         | Limpieza de tokens caducados sin recorrer cada fila.                                                                                                                                           |
| `verification_tokens_purpose_idx`    | `verification_tokens` | btree         | "Tokens pendientes de este propósito" para la interfaz de reenvío / revocación.                                                                                                                |
| `audit_logs_actor_user_id_idx`       | `audit_logs`          | btree         | "Todo lo que hizo este usuario" durante una investigación.                                                                                                                                     |
| `audit_logs_created_at_idx`          | `audit_logs`          | btree, `DESC` | Consultas por rango de tiempo — el patrón de acceso dominante. Descendente, porque cada consulta de este tipo es "lo más reciente primero", que es lo que un B-tree puede servir sin ordenar.  |
| `audit_logs_target_idx`              | `audit_logs`          | btree         | "Historial de esta entidad concreta".                                                                                                                                                          |

Se espera que `audit_logs` crezca sin límite, de modo que los barridos de
retención se apoyarán en `audit_logs_created_at_idx`.

**Eliminados:** `users_active_idx` y `users_active_email_idx`, un par de índices
parciales sobre `status = 'active'`. Codificaban una suposición — que "activo" es
el fragmento interesante — que dejó de ser cierta en cuanto existió la suspensión,
y un índice parcial sobre un enum prácticamente booleano que es el caso común
indexa casi toda la tabla mientras ayuda a casi ninguna consulta. Reemplazados por
los dos índices anteriores.

---

## Puntos de contacto en la DB — se requiere decisión del propietario

> **Se debe notificar al propietario ANTES de redactar cualquier migración que
> toque los elementos que siguen.** No revisarla después — redactarla. Una
> migración escrita sin aviso es una decisión tomada por accidente.
>
> **Aún no se ha ejecutado ninguna migración.** `users`, `sessions`,
> `verification_tokens` y `audit_logs` se documentan aquí como el diseño acordado
> del Sprint 1. Las migraciones del Sprint 1 no se han ejecutado contra ninguna
> base de datos.

### Sprint 2 — dominio de escaneo

Tablas nuevas, sin backfill:

| Tabla         | Propósito                                          | Columnas clave acordar                                                                                                                                                                                                                                            |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domains`     | Un dominio cuya propiedad el usuario ha demostrado | `id`, `user_id`, `hostname`, `normalized_hostname` (**único por usuario** — decide si el mismo hostname puede ser reclamado por dos cuentas), estado de verificación, método de verificación (`dns_txt` / `well_known`), registro de verificación, `verified_at`. |
| `scans`       | Una ejecución contra un dominio                    | `id`, `domain_id`, estado (`queued`/`running`/`completed`/`failed`/`cancelled`), herramienta(s) usadas, marcas de tiempo de inicio/fin, id de tarea de Celery, estado de error.                                                                                   |
| `findings`    | Una vulnerabilidad normalizada                     | `id`, `scan_id`, clave estable de hallazgo para deduplicar entre reescaneos, severidad, título, descripción, endpoint afectado, evidencia, payload crudo de la herramienta.                                                                                       |
| `scan_events` | Flujo de progreso solo-append                      | `id`, `scan_id`, marca de tiempo, tipo de evento, payload — la fuente del progreso en tiempo real.                                                                                                                                                                |

**Decisiones del propietario necesarias antes de las migraciones del Sprint 2:**

1. ¿Puede el mismo hostname ser verificado por **dos cuentas distintas**? Esto
   decide el alcance de unicidad de `domains.normalized_hostname` y es una
   decisión de producto y de prevención de abuso, no un detalle de esquema.
2. Retención de `scan_events` — crecen más rápido que todas estas tablas y son el
   principal candidato a una retención menor que la de `findings`.
3. Retención de los payloads crudos de las herramientas. Son el campo más voluminoso
   y el más sensible (los endpoints descubiertos en el objetivo). La truncación o
   un almacenamiento separado pueden ser lo correcto.
4. Si `findings` deduplica **dentro** de un escaneo o **entre** reescaneos del
   mismo dominio. La deduplicación entre escaneos es mucho más útil y mucho más
   difícil de indexar.

### Sprint 3 — remediación

| Cambio                            | Por qué es un cambio de esquema y no solo contenido                                                                                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contenido o campos de remediación | Remediación por vulnerabilidad dirigida a desarrollador / administrador de sistemas / responsable de negocio, más código de corrección copiable. Si la remediación vive en la base de datos, versionada en el repositorio o en un modelo híbrido está **sin decidir**, y cambia el esquema sustancialmente. |
| Versionado                        | La orientación debe poder corregirse sin reescribir el historial de los hallazgos pasados, lo que implica versionado.                                                                                                                                                                                       |
| Identidad del hallazgo            | Claves estables entre reescaneos y entre revisiones de la orientación.                                                                                                                                                                                                                                      |
| Procedencia de la severidad       | Qué herramienta produjo la severidad y bajo qué versión de regla, de modo que un cambio de clasificación sea auditable.                                                                                                                                                                                     |

**Decisiones del propietario necesarias antes de las migraciones del Sprint 3:**
dónde vive el contenido de remediación (base de datos vs repositorio vs híbrido),
si la remediación se versiona por hallazgo y si las reglas de severidad se
versionan.

### Sprint 4 — multitenancy y facturación

| Cambio                        | Consecuencia                                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabla `organizations`         | Entidad nueva. Requiere decidir el modelo de membresía, las invitaciones y los roles.                                                                                                                          |
| Backfill de `organization_id` | Columna anulable añadida a `users`, `sessions`, `audit_logs`, después backfill, verificación y paso a `NOT NULL`. **No se hace en una sola migración** — ver [ADR 0005](./adr/0005-deferred-multi-tenancy.md). |
| `subscriptions`               | Mapeo de cliente/suscripción de Stripe, estado del plan y la medición que necesitan las cuotas.                                                                                                                |

El backfill de `organization_id` se ejecuta contra una base de datos **viva** y es
la migración más peligrosa del proyecto. Debe secuenciarse, respaldarse,
verificarse con una comprobación de integridad de datos y ser reversible. Ver
[ADR 0005](./adr/0005-deferred-multi-tenancy.md#disparador-de-reconsideración)
para los disparadores que obligan a hacerlo antes del Sprint 4.

---

## Cambio de proveedor

Cambie `DATABASE_URL`. Ese es todo el procedimiento:

```dotenv
# Local Docker Postgres
DATABASE_URL=postgresql://vuldetected:vuldetected@localhost:5432/vuldetected?schema=public

# Supabase
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require
```

Sin cambios de código, sin cambios en compose, sin reescritura de migraciones.
Esa garantía es estructural, y solo es verdad por tres reglas impuestas: sin
nombres de host fijos en el código, sin rutas de socket unix locales y sin
extensiones de Postgres más allá de `citext` y `gen_random_uuid()`. Ver
[ADR 0004](./adr/0004-database-provider-neutrality.md).

Dos advertencias, dichas con claridad:

- **La neutralidad es estructural, no es una prueba.** Un cambio de proveedor
  sigue necesitando una transición ensayada: volcado, restauración en el destino,
  ejecución de migraciones, verificación. Ver
  [decisions-pending.md](./decisions-pending.md#1-alojamiento-de-la-base-de-datos--resuelto-dos-veces).
- **Las funciones del servidor son una decisión aparte.** La seguridad a nivel de
  fila de Supabase está _disponible_ sin violar la neutralidad, pero _usarla_ es
  una decisión de autorización con aprobación del propietario, no un detalle de
  configuración.
