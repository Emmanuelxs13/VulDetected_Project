# Configuración local de PostgreSQL y prueba de humo del Sprint 1

**Estado: EJECUTADO hasta §8.** El rol de acceso, la base de datos
`vuldetected`, las tres migraciones, la prueba de solo-append, la conexión de la
aplicación y la prueba de humo (T1–T15, 17/17) se completaron contra el servidor
local de PostgreSQL 18.3. **El Sprint 1 está versionado en el repositorio
(§11).**

Este es el camino en uso. [`supabase-setup.md`](./supabase-setup.md) se conserva
como la alternativa documentada para cuando el proyecto pase a un proveedor
gestionado.

## Progreso

- [x] §1 — entorno verificado (servidor en ejecución, `citext` de confianza, `psql` fuera del PATH)
- [x] §2 — rol de acceso `vuldetected` + base de datos `vuldetected` creados en pgAdmin 4
- [x] §3 — migraciones `0000` → `0001` → `0002` ejecutadas en orden
- [x] §4 — esquema verificado: 5 tablas, `citext` en `users.email`, trigger solo-append
- [x] §5 — prueba de solo-append: `UPDATE` y `DELETE` rechazados
- [x] §6 — `apps/web/.env.local` escrito, `AUTH_SECRET` generado
- [x] §7 — la aplicación arranca y renderiza `/dashboard`
- [x] §8 — prueba de humo T1–T15, incluidas las pruebas de oráculo de enumeración T10–T12
- [x] §11 — Sprint 1 versionado en el repositorio

Todas las casillas de arriba están marcadas: este runbook es evidencia, y el
Sprint 1 está verificado.

Relacionado: [ADR 0004](./adr/0004-database-provider-neutrality.md) ·
[database.md](./database.md) · [security.md](./security.md)

---

## 0. Qué está realmente instalado

Verificado en esta máquina en lugar de asumido:

| Componente          | Estado                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| Servidor PostgreSQL | **18.3**, servicio `postgresql-x64-18`, **en ejecución**                              |
| En escucha          | puerto **5432**, abierto en `127.0.0.1` y `::1`                                       |
| pgAdmin 4           | instalado en `C:\Program Files\PostgreSQL\18\pgAdmin 4\`, en ejecución                |
| `psql`              | presente en `C:\Program Files\PostgreSQL\18\bin\psql.exe` pero **no está en el PATH** |
| Autenticación       | `scram-sha-256` para `local` y TCP 127.0.0.1                                          |
| Extensión `citext`  | disponible en `share/extension/citext.control`, versión **1.8**, `trusted = true`     |
| `gen_random_uuid()` | **integrado en PostgreSQL 18** (desde PG 13 en el núcleo) — no hace falta `pgcrypto`  |

Dos de ellos merecen una nota:

- **`trusted = true` en `citext` importa.** Significa que el _propietario_ de la
  base de datos puede crear la extensión sin privilegios de superusuario, de modo
  que la aplicación no necesita conectarse como `postgres`. No es necesario
  ejecutar las migraciones como superusuario y la aplicación con un rol distinto.
- **`psql` no está en el PATH**, de modo que `psql --version` falla en cualquier
  shell. El binario está ahí; simplemente no está exportado. Por eso una
  comprobación anterior del entorno concluyó que faltaba Postgres cuando no
  faltaba. Si lo quiere, agregue `C:\Program Files\PostgreSQL\18\bin` al `PATH`,
  pero pgAdmin lo hace innecesario para este runbook.

---

## 1. Qué se está verificando

| #   | Afirmación                                                                       | Dónde se afirma                         |
| --- | -------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Las 3 migraciones redactadas se aplican sin errores a un Postgres real           | `packages/db/drizzle/`                  |
| 2   | `users.email` es genuinamente sin distinguir mayúsculas                          | `citext` en la migración 0000           |
| 3   | Las contraseñas se almacenan como resúmenes argon2id, nunca en texto plano       | `apps/web/src/lib/password.ts`          |
| 4   | Una contraseña incorrecta y un correo desconocido producen un error **idéntico** | `apps/web/src/features/auth/actions.ts` |
| 5   | Los fallos repetidos bloquean la cuenta                                          | mismo archivo, `recordFailure`          |
| 6   | `audit_logs` rechaza `UPDATE` y `DELETE`                                         | trigger de la migración 0002            |
| 7   | La cookie de sesión es `httpOnly` + `SameSite=Lax`                               | `apps/web/src/lib/auth.ts`              |
| 8   | Cada design token se renderiza en ambos temas                                    | `/dev/sprint-1`                         |

Las afirmaciones 4 y 5 son las que vale la pena hacer con cuidado. Son la
diferencia entre un formulario de inicio de sesión y un sistema de autenticación.

---

## 2. Crear el rol de acceso y la base de datos (pgAdmin 4)

Se está creando **un rol** (quién se conecta) y **una base de datos** (qué se
crea). Son objetos separados, y crear solo uno de los dos produce una confusión
más adelante.

### 2a. El rol de acceso

1. En el árbol de la izquierda, despliegue **Servers → PostgreSQL 18 → Login/Group Roles**.
2. Clic derecho → **Create → Login/Roles…** (algunas versiones lo etiquetan como _Login Role_).
3. Pestaña **General** → _Name_: `vuldetected`
4. Pestaña **Definition** → _Password_: elija una y **guárdela en un gestor de
   contraseñas**. Vuelva a escribirla en el campo de confirmación.
5. Pestaña **Privileges** → _Can login?_ = **Yes**. Deje todo lo demás en No.
6. Pulse **Save**.

Si el diálogo de pgAdmin no le permite definir una contraseña, o si prefiere no
pelearse con la interfaz gráfica, ejecute la alternativa en SQL de §2c.

### 2b. La base de datos

1. En el árbol de la izquierda, clic derecho en **Databases → Create → Database…**
2. _Database_: `vuldetected`
3. _Owner_: elija `vuldetected` en el desplegable (ésta es la razón por la que el
   rol va primero — el propietario solo aparece en esa lista una vez que el rol
   existe).
4. **Save**.

### 2c. Alternativa en SQL para ambos pasos

Si lo prefiere, abra una Query Tool contra la base de datos **`postgres`**
(crear una base de datos desde cualquier lugar fuera de un bloque de
transacción, así que ejecute esto como ejecuciones separadas):

```sql
CREATE ROLE vuldetected LOGIN PASSWORD 'CHOOSE-A-PASSWORD';
CREATE DATABASE vuldetected OWNER vuldetected;
```

Ejecute primero `CREATE ROLE` y luego `CREATE DATABASE` por separado. Para
cambiar la contraseña del rol más adelante si lo necesita:

```sql
ALTER ROLE vuldetected WITH LOGIN PASSWORD 'NEW-PASSWORD';
```

### 2d. Confirmar que se está conectado a la base de datos correcta

En el árbol de la izquierda de pgAdmin, despliegue **Databases**. La base de
datos `vuldetected` debería aparecer en la lista. Pulse sobre ella — la pestaña
_Dashboard_ de la derecha debería mostrar `vuldetected` como base de datos actual
y `vuldetected` o `postgres` como usuario conectado.

---

## 3. Crear las tablas (Query Tool)

Los tres archivos de migración ya existen. **No** los escriba a mano —
ejecútelos.

1. En el árbol de la izquierda, clic derecho en la base de datos
   **`vuldetected` → Query Tool**.
2. Confirme que el selector de base de datos en la parte superior de la Query
   Tool dice **`vuldetected`**, no `postgres`. Este es el error más común:
   ejecutar las migraciones contra la base de datos equivocada y descubrirlo
   cuando la aplicación dice que la relación no existe.
3. Abra el archivo: barra de herramientas **Open File** (icono de carpeta) →
   `C:\Programación\VulDetected_Project\packages\db\drizzle\0000_enable_citext.sql`
4. **Execute (F5)** — el botón de reproducción. Espere `Query returned successfully`.
5. Repita para `0001_auth_and_audit_schema.sql` y después para
   `0002_audit_logs_append_only.sql`.

### El orden no es opcional

| Archivo                           | Por qué debe estar en esta posición                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `0000_enable_citext.sql`          | Define el tipo `citext`. `users.email` se declara como `"citext"`, y `CREATE TABLE` falla si el tipo todavía no existe. |
| `0001_auth_and_audit_schema.sql`  | Crea `users`, `accounts`, `sessions`, `verification_tokens`, `audit_logs` + índices + FKs (83 líneas).                  |
| `0002_audit_logs_append_only.sql` | Crea el trigger solo-append. No puede ir antes que `audit_logs`.                                                        |

### Para qué sirve cada tabla

Antes de ejecutar `0001`, sepa lo que está a punto de crear — el archivo de
migración es SQL sin prosa, y dos de estas tablas son contraintuitivas.

| Tabla                 | Propósito en lenguaje llano                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`               | **Quiénes son sus clientes.** Correo, nombre, estado de cuenta y los contadores de bloqueo que sobreviven a un reinicio.                                      |
| `accounts`            | **Dónde vive la contraseña.** El hash `$argon2id$` está aquí, **no** en `users`. Better Auth es dueño de esta tabla.                                          |
| `sessions`            | **Quién tiene la sesión abierta ahora.** Una fila por inicio de sesión activo, con su caducidad para poder barrer los obsoletos.                              |
| `verification_tokens` | **Tokens de un solo uso.** Verificación de correo, restablecimiento de contraseña — y `domain_ownership`, el control del Sprint 2 antes de cualquier escaneo. |
| `audit_logs`          | **Quién hizo qué.** Evidencia solo-append; el trigger rechaza `UPDATE` y `DELETE`.                                                                            |

Dos reglas que vale la pena decir en voz alta:

- **La contraseña nunca va en `users`.** Cualquier consulta que selecciona de
  `users` ya está libre de secretos, de modo que un `SELECT *` imprudente no
  puede filtrar un hash.
- **`domain_ownership` es el control legal del producto.** Hasta que un dominio
  demuestre que pertenece al solicitante, VulDetected no debe escanearlo. El
  vocabulario existe hoy para que el Sprint 2 escriba en un esquema que ya lo
  espera.

El detalle columna por columna vive en [`database.md`](./database.md),
incluida una sección `accounts`. Ese archivo y estos archivos de migración son
las dos referencias; ninguno se escribió a partir del resumen del otro.

### Si pgAdmin informa una transacción sin confirmar

La Query Tool de pgAdmin tiene un interruptor de **auto-commit** en la barra de
herramientas. Si el mensaje de ejecución va seguido de una transacción pendiente
y las tablas no aparecen al refrescar, pulse el botón **Commit** (palomita). Luego
refresque el árbol.

`0000` es deliberadamente idempotente (`CREATE EXTENSION IF NOT EXISTS`), de modo
que volver a ejecutarlo es seguro. `0001` no lo es — volver a ejecutarlo fallará
por las tablas existentes, que es el comportamiento correcto y la señal de que ya
lo ejecutó.

---

## 4. Verificar que el esquema se aplicó

En la Query Tool contra la base de datos **`vuldetected`**:

```sql
-- 1. Every expected table exists
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

-- 2. citext really is on users.email  -- if this says "text", claim 2 is false
select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_name = 'users' and column_name = 'email';

-- 3. The append-only trigger exists
select tgname, tgfoid::regprocedure
from pg_trigger
where tgrelid = 'audit_logs'::regclass
  and not tgisinternal;

-- 4. Indexes the queries depend on
select tablename, indexname
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 5. Enum types landed
select t.typname, e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
order by t.typname, e.enumsortorder;

-- 6. OWNER of every object — the gotcha that bites at 500s
--    If pgAdmin was connected as `postgres` when the migrations ran, every table
--    belongs to `postgres` and the app gets `permiso denegado a la tabla users`
--    (SQLSTATE 42501) on its first query. Expected: every row says `vuldetected`.
select tablename, tableowner
from pg_tables
where schemaname = 'public'
order by tablename;
```

Esperado para (1): `accounts`, `audit_logs`, `sessions`, `users`,
`verification_tokens`.
Esperado para (2): `udt_name` = **`citext`**.
Esperado para (3): una fila, `audit_logs_append_only`.
Esperado para (5): `account_status` con `pending`, `active`,
`suspended`, `deleted`; `token_purpose` con `verify_email`, `reset_password`,
`domain_ownership`.
Esperado para (6): cada `tableowner` = **`vuldetected`**.

### 4b. Ejecuté las migraciones como `postgres` — corrección

A cualquiera le puede pasar; pgAdmin usa por defecto el superusuario para las
Query Tool nuevas. La corrección limpia es hacer de la aplicación el propietario,
lo que concede todos los privilegios de una vez
(select/insert/update/delete/truncate/references/trigger y creación de índices).
Ejecute esto **conectado como `postgres`**, contra la base de datos
`vuldetected`:

```sql
ALTER TABLE public.accounts OWNER TO vuldetected;
ALTER TABLE public.audit_logs OWNER TO vuldetected;
ALTER TABLE public.sessions OWNER TO vuldetected;
ALTER TABLE public.users OWNER TO vuldetected;
ALTER TABLE public.verification_tokens OWNER TO vuldetected;
ALTER TYPE public.account_status OWNER TO vuldetected;
ALTER TYPE public.token_purpose OWNER TO vuldetected;
ALTER SEQUENCE public.audit_logs_id_seq OWNER TO vuldetected;
ALTER FUNCTION public.audit_logs_append_only() OWNER TO vuldetected;
```

Luego vuelva a ejecutar la consulta de verificación 6 y confirme que todo
propietario es `vuldetected`:

En adelante: conecte la Query Tool **como `vuldetected`** (o reasigne después de
cada ejecución de migraciones hecha como `postgres`). La discrepancia es
invisible hasta que la primera solicitud HTTP toca la tabla, que es el lugar más
caro para descubrirla.

---

## 5. Probar que el registro de auditoría es solo-append

Esto es un control de seguridad, así que demuestre que hace algo:

```sql
insert into audit_logs (action, metadata) values ('manual.test', '{}');

update audit_logs set action = 'tampered' where action = 'manual.test';  -- must FAIL
delete from audit_logs where action = 'manual.test';                     -- must FAIL

truncate audit_logs;  -- the documented escape hatch, if you want it clean
```

Ambas mutaciones deben lanzar una excepción. Si la actualización funciona, el
trigger falta y su registro de auditoría es ficción.

`TRUNCATE` elude el trigger a propósito — es una sentencia DDL, no una mutación
de filas. Ésa es exactamente la razón por la que es la vía de mantenimiento.

---

## 6. Proporcionar a la aplicación una cadena de conexión

Next.js lee `.env*` desde **su propio directorio**, de modo que el archivo de
valores va en `apps/web/`:

```powershell
Copy-Item .env.example apps\web\.env.local
```

Edite `apps/web/.env.local`:

```dotenv
# --- Database ---  local PostgreSQL 18 on 127.0.0.1
DATABASE_URL=postgresql://vuldetected:CHOOSE-A-PASSWORD@127.0.0.1:5432/vuldetected

# --- Auth ---
AUTH_SECRET=<generate below>
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Notas:

- **Sin `sslmode`.** El TCP local no tiene TLS y `postgres.js` informa
  `ssl: false` aquí. Agregar `sslmode=require` rompería la conexión.
- **`?schema=public` es inofensivo** si está presente — se verificó que
  `postgres.js` analiza la URL correctamente con y sin él. Es propio de Supabase
  y puede eliminarse.
- **No aplica ningún razonamiento sobre el puerto 6543 / pooler.** Eso es
  específico de Supabase; un servidor local es un solo backend y la discusión
  sobre el pooler en [`supabase-setup.md`](./supabase-setup.md) es irrelevante
  aquí. `prepare: false` en `client.ts` es un costo nulo (un análisis extra por
  consulta) que compra neutralidad respecto del proveedor para más adelante.

### Generar `AUTH_SECRET`

Windows no tiene `openssl` por defecto. Use Node:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Pegue los 44 caracteres. La aplicación exige ≥32 caracteres y se niega a arrancar
sin él — el secreto firma las cookies de sesión, de modo que su longitud es la
entropía que un atacante debe adivinar para forjar una.

### Confirmar que no va a git

```powershell
git check-ignore apps/web/.env.local
```

Debe imprimir la regla que coincide. Si no imprime nada, deténgase y corrija
`.gitignore` primero.

### No ejecute `db:migrate`

```powershell
pnpm --filter @vuldetected/db run db:migrate   # DO NOT RUN THIS
```

`drizzle-kit migrate` aplica SQL a través de su propia tabla de registro, que no
tiene noticia de las migraciones que usted ejecutó a mano en pgAdmin. Ejecutarlo
ahora intentaría aplicar `0000` de nuevo y fallaría por `citext` — y peor: si
alguna vez tocó las tablas a mano, podría parecer que aplica algo que ya existe.

**pgAdmin es la autoridad de la aplicación por ahora.** Si alguna vez quiere que
`drizzle-kit` se haga cargo del historial de migraciones, dígalo primero: los dos
deben reconciliarse explícitamente, no dejar que se descubran mutuamente mediante
errores.

`pnpm --filter @vuldetected/db run db:generate` (redactar SQL nuevo a partir de
cambios en el esquema) **sí** es seguro — no abre ninguna conexión.

---

## 7. Iniciar la aplicación

```powershell
pnpm dev
```

Espere `ready` y abra <http://localhost:3000>.

---

## 8. Prueba de humo del Sprint 1

Haga estas en orden. Cada una prueba una afirmación concreta.

### Sistema de diseño

| #   | Acción                                                     | Esperado                                                                                                                                                                  |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Abrir `/dev/sprint-1`                                      | Cada primitiva se renderiza: botones, las 7 insignias de severidad, tabla densa, 4 variantes de alerta, progreso, estado vacío, cuadrícula completa de muestras de tokens |
| T2  | Cambiar el sistema operativo a modo oscuro, recargar       | Misma página, tokens oscuros. No existen clases `dark:` en el código fuente, de modo que esto funciona solo con CSS                                                       |
| T3  | Leer una insignia de severidad                             | Tiene una **forma** (octágono/triángulo/diamante/círculo/cuadrado) **y** una etiqueta de texto — no solo color                                                            |
| T4  | Inicio → Registro, recorrer el formulario con el tabulador | Anillo de foco visible solo con el teclado. No hace falta ratón para ver dónde está usted                                                                                 |

### Registro y almacenamiento

| #   | Acción                                                                  | Esperado                                                                    |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| T5  | Registrar `owner@vuldetected.test` con una contraseña de 12+ caracteres | Redirección a `/dashboard`                                                  |
| T6  | SQL: `select email, status from users;`                                 | Una fila, `email` en minúsculas, `status = active`                          |
| T7  | SQL: `select left(password, 10) from accounts;`                         | Empieza con `$argon2id$`. **Si ve la contraseña en texto plano, deténgase** |
| T8  | SQL: `select action from audit_logs order by created_at;`               | Contiene `user.registered`                                                  |
| T9  | Recargar `/dashboard`                                                   | Sigue con la sesión abierta — la sesión sobrevivió a una petición nueva     |

### Las dos pruebas que importan

| #   | Acción                                                                                          | Esperado                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| T10 | Cerrar la sesión. Intentar registrar de nuevo el **mismo** correo con una contraseña incorrecta | El error es idéntico byte a byte al error de contraseña incorrecta de T11. Si difiere, las cuentas registradas son enumerables |
| T11 | Iniciar sesión con `owner@vuldetected.test` + una contraseña **incorrecta** 6 veces             | El mismo error genérico cada vez; con el 6.º la cuenta queda bloqueada y la contraseña correcta deja de funcionar              |
| T12 | Iniciar sesión con un correo **inexistente** + cualquier contraseña                             | **Exactamente** el mismo mensaje que T11                                                                                       |

T10–T12 son los criterios de aceptación del trabajo de autenticación. Todo lo
demás en el Sprint 1 es andamiaje; estas tres son el producto.

### Manejo de la sesión

| #   | Acción                                                                     | Esperado                                                                                                                                                     |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T13 | Devtools → Application → Cookies                                           | La cookie de sesión tiene `HttpOnly` **y** `SameSite=Lax`                                                                                                    |
| T14 | Copiar el valor de la cookie; SQL: `select left(token, 10) from sessions;` | La cookie y el valor almacenado coinciden, ambos son resúmenes y no el token en crudo. Ver el ADR 0002 para saber por qué aquí no se puede hashear dos veces |

### Cierre de sesión

| #   | Acción           | Esperado                                                                                                                                                                           |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T15 | Cerrar la sesión | Se le envía a `/login`; `/dashboard` renderiza **"No active session"** (200 — esta aplicación deliberadamente no redirige, ADR 0002 §4); `auth.logged_out` aparece en `audit_logs` |

---

## 9. Reinicio si quiere partir de cero

```sql
drop table if exists audit_logs cascade;
drop table if exists sessions cascade;
drop table if exists verification_tokens cascade;
drop table if exists accounts cascade;
drop table if exists users cascade;
-- then re-run 0000, 0001, 0002 in order
```

Dejar `citext` en su lugar está bien — `0000` es idempotente. Eliminar la base
de datos completa también funciona:

```sql
-- run from the postgres database
drop database if exists vuldetected;
```

---

## Solución de problemas

| Síntoma                                                           | Causa                                                                                                                                      | Corrección                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `type "citext" does not exist`                                    | `0000` nunca se ejecutó, o se ejecutó contra otra base de datos                                                                            | Verifique la consulta 2 de §4. Vuelva a ejecutar `0000`                    |
| `relation "users" does not exist`                                 | Las migraciones fueron a `postgres`, o nunca se ejecutaron                                                                                 | Revise el selector de base de datos de la Query Tool; vuelva a ejecutar §3 |
| `password authentication failed`                                  | Contraseña incorrecta, o el rol no tiene contraseña                                                                                        | `ALTER ROLE vuldetected WITH LOGIN PASSWORD '...'` en §2c                  |
| `database "vuldetected" does not exist`                           | Se omitió el paso 2b, o el `DATABASE_URL` de la aplicación apunta a otro sitio                                                             | Confirme con la consulta 1 de §4 contra el mismo nombre que puso en la URL |
| `relation "users" already exists` al ejecutar `0001`              | Volvió a ejecutarlo                                                                                                                        | Inofensivo — ya existe. Pase a `0002`                                      |
| `permiso denegado a la tabla users` (SQLSTATE 42501)              | Las migraciones se ejecutaron como `postgres`; las tablas son propiedad del superusuario, pero la aplicación se conecta como `vuldetected` | §4b — reasigne la propiedad a `vuldetected`                                |
| `AUTH_SECRET is required` en `/dashboard`                         | Falta `.env.local` o no está dentro de `apps/web/`                                                                                         | Confirme la ruta; reinicie `pnpm dev`                                      |
| Errores 500 en el inicio de sesión pero funciona tras un reinicio | El entorno se valida de forma diferida en la primera solicitud                                                                             | Ver §10                                                                    |
| Puerto ya en uso en 5432                                          | Hay otro Postgres en ejecución                                                                                                             | `Get-Service *postgres*` muestra las instancias                            |

---

## 10. Lo que este runbook NO prueba

El Sprint 1 no contiene ningún escáner, de modo que nada de lo siguiente se prueba
aquí. Son del Sprint 2:

- Verificación de la propiedad del dominio — el control legal antes de cualquier
  escaneo.
- Endurecimiento SSRF en el worker.
- Transmisión de progreso en tiempo real.
- Clasificación de severidad.

No describa el Sprint 1 como "el escáner funciona". Es gestión de cuentas más un
sistema de diseño.

---

## 11. Brecha conocida: el archivo de entorno existe en dos lugares

El `.env.example` de la raíz es dueño de los **nombres**, pero el archivo de
valores debe estar en `apps/web/` porque ahí es donde lee Next.js — y
`drizzle-kit` lee el `process.env` que exporte el shell.

Existe una corrección permanente y barata en esta máquina: Node 22 admite
`--env-file-if-exists`, verificado funcionando en v22.14.0, de modo que los
scripts de desarrollo y de migración podrían cargar un único `.env.local` de la
raíz sin importar el paquete que los inicie:

```json
"dev": "cross-env NODE_OPTIONS=--env-file-if-exists=../../.env.local next dev"
```

Eso deliberadamente **no** se ha hecho todavía. Cambia la forma en que cada
paquete resuelve la configuración, y es mejor introducirlo como un cambio
propio que mezclarlo en una ejecución de verificación.
