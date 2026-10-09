# Configuración de Supabase y prueba de humo del Sprint 1

> **REEMPLAZADO — no es el camino en uso.** El Sprint 1 se está verificando
> contra un servidor **PostgreSQL 18 local** mediante pgAdmin 4. El runbook
> actual es [`local-postgres-setup.md`](./local-postgres-setup.md).
>
> Este archivo se conserva como la alternativa documentada para cuando el
> proyecto pase a un proveedor gestionado. Su prueba de humo (§8), su tabla de
> solución de problemas y el razonamiento sobre el pooler con `LISTEN/NOTIFY`
> siguen siendo válidos y deliberadamente no se duplicaron. Los pasos que
> difieren — creación del proyecto, selección de la cadena de conexión,
> codificación de la contraseña, pausa del plan gratuito — solo importan cuando
> se adopte Supabase.

**Estado:** Runbook de verificación del Sprint 1 (camino alternativo, no
ejecutado).

Hasta que este runbook se complete, toda afirmación sobre la autenticación en
este repositorio es una inferencia a partir del código fuente. Nada se ha
ejecutado nunca contra una base de datos.

Relacionado: [ADR 0004](./adr/0004-database-provider-neutrality.md) ·
[database.md](./database.md) · [security.md](./security.md)

---

## 0. Qué se está verificando

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

## 1. Crear el proyecto

1. Vaya a <https://supabase.com/dashboard> → **New project**.
2. **Organization** → créela si se le solicita.
3. **Name** → `vuldetected`.
4. **Database Password** → pulse _Generate a password_ y luego **guárdela en un
   lugar donde no la vaya a perder**. Supabase no la muestra de nuevo; no hay
   recuperación, solo reinicio. Un gestor de contraseñas es el lugar correcto
   para ella.
5. **Region** → elija la que geográficamente esté más cerca. La región no se
   puede cambiar después sin una restauración.
6. Espere a que termine el aprovisionamiento.

### Dos cosas del plan gratuito que debe conocer antes de construir sobre él

- **Los proyectos gratuitos se pausan tras 7 días de inactividad.** Un proyecto
  pausado no se elimina, pero rechaza conexiones, de modo que cada solicitud que
  toca la base de datos empieza a fallar — incluido su flujo de autenticación.
  Para un producto que piensa demostrar, tenga esto en cuenta y toque el proyecto
  semanalmente o pase al plan de pago (20 USD/mes) cuando deje de ser una
  demostración.
- **Dos proyectos como máximo, 500 MB.** cómodo para los Sprint 1 y 2. Los
  escaneos no almacenarán payloads crudos de herramientas en Postgres (eso
  pertenece al almacenamiento de objetos), de modo que el techo está lejos.

### No use Supabase Auth

Este producto tiene su propia autenticación (ver
[ADR 0002](./adr/0002-authentication.md)) y nuestras tablas no tienen la forma
de `auth.users` de Supabase. Usted está usando Supabase **solo para PostgreSQL
gestionado**. No agregue `supabase-js` a este repositorio.

---

## 2. Copiar la cadena de conexión

**Project Settings → Database → Connection string → la pestaña URI.**

Elija la tarjeta **Session pooler**, no la de Transaction pooler. Copie la URI y
descarte el marcador de posición de la contraseña.

Se ve así:

```
postgresql://postgres.PROJECTREF:YOUR-PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

### Por qué el Session pooler y no el Transaction pooler

Supabase ofrece tres formas de entrar, y la diferencia no es cosmética:

|                                                                              | Direct | Session pooler (5432) | Transaction pooler (6543) |
| ---------------------------------------------------------------------------- | ------ | --------------------- | ------------------------- |
| Sentencias preparadas                                                        | sí     | sí                    | **no**                    |
| Cursores que abarcan sentencias                                              | sí     | sí                    | **no**                    |
| Estado de sesión (`LISTEN/NOTIFY`, bloqueos asincrónicos, tablas temporales) | sí     | sí                    | **no**                    |
| Pipelining de consultas                                                      | sí     | sí                    | **no**                    |
| Cuenta contra su cuota de conexión directa                                   | sí     | no                    | no                        |

El Transaction pooler devuelve la conexión a la pool después de cada
transacción, de modo que todo lo ligado a una sesión muere. `postgres.js`
**hace pipelining de consultas por defecto**, y la propia documentación de
Supabase advierte que esta combinación puede colgarse o devolver filas
desalineadas.

El Session pooler le da PostgreSQL gestionado **sin ninguna** de esas
advertencias. Tampoco consume su cuota de conexión directa, que es lo que
realmente le importa.

`packages/db/src/client.ts` ya establece `prepare: false`, de modo que incluso el
Transaction pooler funcionaría — pero igual estaría ejecutando con el pipelining
desactivado. Use el Session pooler y la pregunta nunca surge.

**Nota del Sprint 2:** cuando el progreso de escaneo pase a Server-Sent Events
sobre una conexión de larga duración, revise esto. `LISTEN/NOTIFY` necesita una
sesión, y es exactamente el tipo de cosa que obliga a volver a una conexión
directa.

### Codificar la contraseña en la URL — ahí es donde falla

Si la contraseña generada contiene `@ : / ? # [ ] % &`, debe codificarse con
porcentajes, o la URL se analiza hasta el lugar equivocado y usted obtiene un
error de autenticación confuso contra una contraseña de la que está seguro.

| Carácter | Codificar como |
| -------- | -------------- |
| `@`      | `%40`          |
| `:`      | `%3A`          |
| `/`      | `%2F`          |
| `?`      | `%3F`          |
| `#`      | `%23`          |
| `[` `]`  | `%5B` `%5D`    |
| `%`      | `%25`          |

Lo más fácil es generar usted mismo una contraseña solo con caracteres
alfanuméricos y evitar todo el problema.

---

## 3. Crear el archivo de entorno local

El `.env.example` de la raíz es la fuente de verdad de los **nombres**. Next.js
lee `.env*` desde **su propio directorio**, de modo que el archivo de valores va
en `apps/web/`.

```powershell
Copy-Item .env.example apps\web\.env.local
```

Luego edite `apps/web/.env.local`:

```dotenv
# --- Database ---
# Supabase SESSION pooler (port 5432) — see docs/supabase-setup.md
DATABASE_URL=postgresql://postgres.PROJECTREF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require

# --- Auth ---
AUTH_SECRET=<generated below>
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Generar `AUTH_SECRET`

Windows no tiene `openssl` por defecto. Use Node, que ya está instalado:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Eso imprime 44 caracteres en base64. Péguelos. La aplicación exige un mínimo de
32 caracteres y se negará a arrancar sin él — esto no es una formalidad: el
secreto firma las cookies de sesión, de modo que su longitud es la entropía que
un atacante debe adivinar para forjar una.

### Aún no necesita SMTP

La verificación de correo está desactivada en el Sprint 1, de modo que no se
envía nada. Deje las variables `SMTP_*` apuntando a `localhost:1025` e ignore
Mailpit hasta el Sprint 2.

### `.env.local` está en el gitignore

Confirme que nunca se versiona:

```powershell
git check-ignore apps/web/.env.local
```

Debe imprimir la regla que coincide. Si no imprime nada, deténgase y corrija
`.gitignore` antes de hacer cualquier otra cosa.

---

## 4. Ejecutar las migraciones

`drizzle-kit migrate` lee `DATABASE_URL` del entorno, y su directorio de trabajo
es `packages/db` — así que expórtela para la sesión en lugar de crear un segundo
archivo de configuración:

```powershell
$env:DATABASE_URL = "postgresql://postgres.PROJECTREF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
pnpm --filter @vuldetected/db run db:migrate
```

Esperado: tres migraciones aplicadas en orden.

```
0000_enable_citext.sql
0001_auth_and_audit_schema.sql
0002_audit_logs_append_only.sql
```

`citext` debe ser su propia migración porque `users.email` se emite como
`"citext"` y Postgres ya debe conocer el tipo en el momento de `CREATE TABLE`. Si
0000 falla alguna vez, compruebe que la extensión está disponible en su plan.

---

## 5. Verificar que el esquema se aplicó

Pegue esto en **Supabase → SQL Editor → New query → Run**:

```sql
-- 1. Every expected table exists
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 2. The append-only trigger exists
select tgname, tgtype
from pg_trigger
where tgrelid = 'audit_logs'::regclass
  and not tgisinternal;

-- 3. citext is really in use on users.email
select column_name, data_type, udt_name
from information_schema.columns
where table_name = 'users' and column_name = 'email';

-- 4. Indexes that the queries depend on
select indexname from pg_indexes where schemaname = 'public' order by indexname;
```

La consulta 1 debe listar `accounts`, `audit_logs`, `sessions`, `users`,
`verification_tokens`. La consulta 3 debe informar `udt_name = citext` — si dice
`text`, la extensión no se aplicó y la insensibilidad a mayúsculas del correo
ausente en silencio.

---

## 6. Probar que el registro de auditoría es solo-append

Esto es un control de seguridad, así que demuestre que hace algo:

```sql
insert into audit_logs (action, metadata) values ('manual.test', '{}');
update audit_logs set action = 'tampered' where action = 'manual.test';  -- must FAIL
delete from audit_logs where action = 'manual.test';                     -- must FAIL
```

Ambas mutaciones deben lanzar una excepción. Si la actualización funciona, el
trigger falta y su registro de auditoría es ficción. Limpie con:

```sql
truncate audit_logs;
```

`TRUNCATE` elude deliberadamente el trigger — es una sentencia DDL, no una
mutación de filas. Ésa es la razón por la que es la vía de mantenimiento
documentada.

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

| #   | Acción                                               | Esperado                                                                                                                                                                  |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Abrir `/dev/sprint-1`                                | Cada primitiva se renderiza: botones, las 7 insignias de severidad, tabla densa, 4 variantes de alerta, progreso, estado vacío, cuadrícula completa de muestras de tokens |
| T2  | Cambiar su sistema operativo a modo oscuro, recargar | Misma página, tokens oscuros. No existen clases `dark:` en el código fuente, de modo que esto funciona solo con CSS                                                       |
| T3  | Leer una insignia de severidad                       | Tiene una **forma** (octágono/triángulo/diamante/círculo/cuadrado) **y** una etiqueta de texto — no solo color                                                            |
| T4  | Inicio → Registro, recorrer con clics                | El anillo de foco es visible con el tabulador del teclado. No hace falta ratón para ver dónde está usted                                                                  |

### Registro y almacenamiento

| #   | Acción                                                                  | Esperado                                                                    |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| T5  | Registrar `owner@vuldetected.test` con una contraseña de 12+ caracteres | Redirección a `/dashboard`                                                  |
| T6  | SQL: `select email, status from users;`                                 | Una fila. `email` en minúsculas, `status = active`                          |
| T7  | SQL: `select left(password, 10) from accounts;`                         | Empieza con `$argon2id$`. **Si ve la contraseña en texto plano, deténgase** |
| T8  | SQL: `select action from audit_logs order by created_at;`               | Contiene `user.registered`                                                  |
| T9  | Recargar `/dashboard`                                                   | Sigue con la sesión abierta. La sesión sobrevivió a una petición nueva      |

### Las dos pruebas que importan

| #   | Acción                                                                                          | Esperado                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T10 | Cerrar la sesión. Intentar registrar de nuevo el **mismo** correo con una contraseña incorrecta | El error es idéntico byte a byte al error de contraseña incorrecta de más abajo. Si difiere, puede enumerar las cuentas registradas |
| T11 | Iniciar sesión con `owner@vuldetected.test` + una contraseña **incorrecta** 6 veces seguidas    | El mismo error genérico cada vez, y con el 6.º la cuenta queda bloqueada — la contraseña correcta deja de funcionar                 |
| T12 | Iniciar sesión con un correo **inexistente** + cualquier contraseña                             | **Exactamente** el mismo mensaje que T11. Éste es el oráculo de enumeración siendo cerrado                                          |

T10–T12 son los criterios de aceptación del trabajo de autenticación. Todo lo
demás en el Sprint 1 es andamiaje; estas tres son el producto.

### Manejo de la sesión

| #   | Acción                                                                     | Esperado                                                                                                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T13 | Herramientas de desarrollo del navegador → Application → Cookies           | La cookie de sesión tiene `HttpOnly` **y** `SameSite=Lax`                                                                                                      |
| T14 | Copiar el valor de la cookie; SQL: `select left(token, 10) from sessions;` | La cookie y el valor almacenado coinciden, y ambos son resúmenes y no el token en crudo. Ver el ADR 0002 para saber por qué aquí no se puede hashear dos veces |

### Cierre de sesión

| #   | Acción           | Esperado                                                                                        |
| --- | ---------------- | ----------------------------------------------------------------------------------------------- |
| T15 | Cerrar la sesión | Redirección a `/login`; `/dashboard` vuelve a redirigir; `auth.logged_out` está en `audit_logs` |

---

## 9. Eliminar los recursos creados

```sql
drop table if exists audit_logs cascade;
drop table if exists sessions cascade;
drop table if exists verification_tokens cascade;
drop table if exists accounts cascade;
drop table if exists users cascade;
```

La tabla `__drizzle_migrations` puede quedarse: registra que las migraciones se
ejecutaron. Elimínela también si quiere una pizarra realmente limpia.

---

## Solución de problemas

| Síntoma                                                         | Causa                                                         | Corrección                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `password authentication failed for user "postgres.PROJECTREF"` | Contraseña sin codificar en URL, o proyecto equivocado        | Vuelva a copiar la cadena; codifique con porcentajes `@ : / ? # [ ] %`                                    |
| `ENOTFOUND aws-0-...pooler.supabase.com`                        | DNS corporativo o proxy que bloquea Supavisor                 | Pruebe la conexión directa `db.PROJECTREF.supabase.co:5432`                                               |
| `error: prepared statement "s0" already exists`                 | Transaction pooler (6543)                                     | Use el Session pooler (5432)                                                                              |
| `relation "users" does not exist`                               | Las migraciones nunca se ejecutaron                           | Vuelva a ejecutar el paso 4 y confirme que imprimió tres migraciones                                      |
| `extension "citext" is not available`                           | Restricción del plan                                          | Revise el SQL Editor para la lista de extensiones; Supabase incluye `citext` en todos los planes actuales |
| `AUTH_SECRET is required` en `/dashboard`                       | Falta `.env.local` o no está en `apps/web/`                   | Confirme la ruta; reinicie `pnpm dev`                                                                     |
| Errores 500 en el inicio de sesión, funciona tras un reinicio   | Entorno validado de forma diferida en la primera solicitud    | Ver la sección 11                                                                                         |
| `Can't reach database server`                                   | Proyecto del plan gratuito pausado tras 7 días de inactividad | Reactívelo desde el panel                                                                                 |

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
`drizzle-kit` lee el `process.env` que exporte el shell. El paso 4 sortea esto
mediante `$env:DATABASE_URL`.

Existe una corrección permanente y barata en esta máquina: Node 22 admite
`--env-file-if-exists`, verificado funcionando en v22.14.0, de modo que los
scripts de desarrollo y de migración pueden cargar un único `.env.local` de la
raíz sin importar el paquete que los inicie:

```json
"dev": "cross-env NODE_OPTIONS=--env-file-if-exists=../../.env.local next dev"
```

Eso deliberadamente **no** se ha hecho todavía. Cambia la forma en que cada
paquete resuelve la configuración, y es mejor introducirlo como un cambio
propio que mezclarlo en una ejecución de verificación.
