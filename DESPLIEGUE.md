# DESPLIEGUE: Vercel, Supabase y PostgreSQL

Este documento describe cómo publicar VulDetected en Vercel y mover la base de datos de PostgreSQL administrada desde pgAdmin 4 a Supabase. Al terminar, la aplicación pública debe leer y escribir en la base remota de Supabase, no en tu PostgreSQL local.

> **Resultado esperado:** el login, el registro, los scans, los hallazgos, las sesiones, las suscripciones simuladas y los informes funcionan desde la URL de Vercel. El PostgreSQL local solo debe usarse como origen temporal o de desarrollo.

## Ruta rápida

1. Crea un proyecto PostgreSQL en Supabase.
2. Obtén la cadena de conexión del Session pooler.
3. Ejecuta las migraciones de Drizzle contra Supabase.
4. Verifica el esquema remoto.
5. Crea el proyecto en Vercel desde la rama `main`.
6. Configura las variables de entorno en Vercel.
7. Despliega una Preview y prueba `/api/health` y `/api/ready`.
8. Despliega a producción.
9. Migra las tablas o los datos desde pgAdmin 4 solo si necesitas conservar datos locales.

## 1. Cómo funciona el despliegue

Vercel ejecuta la aplicación Next.js y las rutas API de `apps/web`.

En producción se necesitan estos componentes:

| Componente | Plataforma recomendada | Obligatorio |
| --- | --- | --- |
| Next.js y API | Vercel | Sí |
| PostgreSQL | Supabase | Sí |
| Redis y cola Celery | Redis gestionado + servicio persistente | Sí para escaneos reales |
| Worker Python/Celery | Railway, Render, VPS o Docker | Sí para escaneos reales |
| SMTP | Resend, SendGrid, SES, Postmark u otro proveedor | Sí para registro y alertas |
| OAuth real | Google/GitHub | Opcional en esta etapa |
| Pagos reales | Stripe u otro proveedor | Opcional; la demo actual es simulada |

Vercel no debe ser usado como proceso permanente de Celery ni como Redis persistente para una cola. Esas partes deben publicarse fuera de Vercel.

## 2. Preparar Supabase

### 2.1 Crear el proyecto

1. Abre <https://supabase.com/dashboard>.
2. Selecciona **New project**.
3. Usa un nombre como `vuldetected`.
4. Elige una región cercana a los usuarios y al proyecto de Vercel.
5. Define una contraseña de base de datos nueva y guárdala en un gestor de contraseñas.
6. Espera a que Supabase termine de aprovisionar PostgreSQL.

No necesitas Supabase Auth: VulDetected usa Better Auth y sus propias tablas. Configura Supabase solo como PostgreSQL administrado.

### 2.2 Obtener la cadena correcta

En Supabase entra en:

```text
Project Settings → Database → Connection string → URI
```

Usa el **Session pooler**, no el Transaction pooler.

La cadena tendrá una forma similar a:

```text
postgresql://postgres.PROJECT_REF:<password>@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require
```

Notas importantes:

- Usa el puerto `5432`, no `6543`.
- Guarda la contraseña fuera del código.
- Si la contraseña contiene caracteres especiales, codifícala o genera una contraseña alfanumérica nueva.
- Vercel debe recibir la cadena completa como variable secreta `DATABASE_URL`.
- No copies una contraseña real a `.env`, Markdown, commits, capturas o mensajes.

## 3. Aplicar las migraciones a Supabase

Este método crea el esquema limpio en Supabase usando el sistema oficial de migraciones del proyecto.

### 3.1 Definir la variable temporal

En PowerShell:

```powershell
$env:DATABASE_URL="postgresql://postgres.PROJECT_REF:<password>@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
```

Reemplaza `PROJECT_REF`, `REGION` y `<password>` con los valores reales. Cuando termines:

```powershell
Remove-Item Env:DATABASE_URL
```

### 3.2 Ejecutar migraciones

Desde la raíz del repositorio:

```powershell
pnpm --filter @vuldetected/db db:migrate
pnpm --filter @vuldetected/db db:verify -- --strict
```

La primera orden aplica los archivos SQL de `packages/db/drizzle` a Supabase.

La segunda valida que existan las tablas creadas por las migraciones y que el journal de Drizzle coincida.

Si `db:migrate` falla:

1. Confirma que `DATABASE_URL` todavía existe:

   ```powershell
   Test-Path Env:DATABASE_URL
   ```

2. Confirma que Supabase no esté pausado.
3. Confirma que uses el Session pooler en el puerto `5432`.
4. Confirma que la contraseña esté codificada o usa una contraseña alfanumérica.
5. Ejecuta otra vez `db:migrate`.

No uses `drizzle-kit push` para el despliegue final si puedes usar las migraciones versionadas. El objetivo es que `drizzle.__drizzle_migrations` registre exactamente qué archivos se aplicaron.

## 4. Sembrar cuentas demo, si quieres utilizarlas

Para una base Supabase que servirá una demo pública, decide si quieres crear las cuentas demo publicadas en el repositorio.

Las cuentas existentes tienen nombres locales conocidos y una contraseña compartida publicada solo para demo local. No las uses para una instancia pública con datos reales.

Para sembrarlas en la base remota:

```powershell
$env:DATABASE_URL="postgresql://postgres.PROJECT_REF:<password>@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
pnpm seed:demo
Remove-Item Env:DATABASE_URL
```

Después del seed, las cuentas existentes son:

| Correo | Uso |
| --- | --- |
| `demo.free@vuldetected.local` | Plan Free |
| `demo.pro@vuldetected.local` | Cuenta principal de demo |
| `demo.business@vuldetected.local` | Plan Business |
| `demo.sinverificar@vuldetected.local` | Caso negativo de correo no verificado |

No publiques esa base demo como si fuera una cuenta real de producción. Para producción real, elimina las cuentas demo o usa credenciales nuevas creadas por usuarios reales.

## 5. Migrar datos reales desde pgAdmin 4

Hay dos decisiones posibles:

- **Base nueva con datos sembrados:** usa las migraciones Drizzle y no copie el servidor local.
- **Base existente con usuarios, dominios, escaneos o hallazgos:** exporta e importa solo las tablas necesarias desde pgAdmin 4.

La opción recomendada es una base nueva limpia. Si necesitas conservar datos locales, sigue primero un respaldo completo y prueba la restauración antes de borrar cualquier dato.

### 5.1 Crear respaldo desde pgAdmin 4

1. Abre pgAdmin 4.
2. Conéctate al servidor PostgreSQL local que contiene VulDetected.
3. Abre la base `vuldetected`.
4. Haz clic derecho sobre la base.
5. Selecciona **Backup...**.
6. Configura:

   | Campo | Valor recomendado |
   | --- | --- |
   | Format | Custom |
   | Filename | `vuldetected-backup.dump` |
   | Number of jobs | 1 |
   | Verbose messages | Activado |
   | No owner | Activado |
   | No ACL | Activado |

7. Ejecuta el respaldo.
8. Guarda el archivo fuera del repositorio. No lo subas a GitHub.

El archivo puede contener contraseñas cifradas, sesiones y datos personales. Trata el respaldo como información sensible.

### 5.2 Registrar Supabase como servidor en pgAdmin 4

En pgAdmin 4:

1. Haz clic derecho en **Servers → Register → Server**.
2. En **General**, usa el nombre `VulDetected Supabase`.
3. En **Connection**:

   | Campo | Valor |
   | --- | --- |
   | Host name/address | `db.PROJECT_REF.supabase.co` o el host del pooler |
   | Port | `5432` |
   | Maintenance database | `postgres` |
   | Username | `postgres` o `postgres.PROJECT_REF` |
   | Password | Contraseña de Supabase |
   | SSL mode | Require |

4. Guarda la contraseña solo si confías en el perfil local de pgAdmin 4.
5. Prueba la conexión.

Si la conexión directa IPv4 falla, usa la cadena de Session pooler del Proyecto Supabase.

### 5.3 Restaurar con pgAdmin 4

Antes de restaurar:

- Verifica que el esquema Supabase esté limpio o ya migrado.
- Haz un respaldo de Supabase si ya contenía datos.
- No marques opciones que cambien propietarios a usuarios locales.

En pgAdmin:

1. Conecta `VulDetected Supabase`.
2. Haz clic derecho en la base `postgres`.
3. Selecciona **Restore...**.
4. Selecciona `vuldetected-backup.dump`.
5. Format: Custom or tar.
6. Activa:

   ```text
   No Owner
   No ACL
   Verbose
   ```

7. Ejecuta Restore.

Si el respaldo también contiene objetos internos de PostgreSQL, usa el método de migración por tabla o termina los conflictos manualmente. Supabase no permite restaurar todos los objetos de infraestructura del servidor original.

### 5.4 Restaurar por línea de comandos, recomendada para control

Si tienes PostgreSQL instalado, abre PowerShell y usa `pg_restore`.

Ubicación habitual en Windows:

```powershell
$pgRestore = "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe"
& $pgRestore --version
```

Ejemplo:

```powershell
$env:PGPASSWORD="<password-supabase>"

& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
  --host="db.PROJECT_REF.supabase.co" `
  --port="5432" `
  --username="postgres" `
  --dbname="postgres" `
  --no-owner `
  --no-privileges `
  --clean `
  --if-exists `
  --verbose `
  "C:\ruta\segura\vuldetected-backup.dump"

Remove-Item Env:PGPASSWORD
```

Esta restauración puede fallar si el dump contiene roles locales, extensiones administradas o objetos que Supabase no permite crear. En ese caso, restaura primero el esquema y las tablas necesarios o exporta datos por tablas.

### 5.5 Verificar después de copiar datos

```powershell
$env:DATABASE_URL="postgresql://postgres.PROJECT_REF:<password>@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"

pnpm --filter @vuldetected/db db:verify -- --strict

& "C:\Program Files\PostgreSQL\18\bin\psql.exe" `
  "postgresql://postgres.PROJECT_REF:<password>@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require" `
  -c "select count(*) as users from users;"

Remove-Item Env:DATABASE_URL
Remove-Item Env:PGPASSWORD
```

No publiques el resultado de esas consultas si contiene correos reales o datos personales.

## 6. Preparar el proyecto en Vercel

### 6.1 Importar el repositorio

1. Abre <https://vercel.com/dashboard>.
2. Selecciona **Add New → Project**.
3. Importa `Emmanuelxs13/VulDetected_Project`.
4. Mantén el Root Directory vacío o configurado en la raíz.
5. Framework: Next.js.
6. Build Command: `pnpm --filter @vuldetected/web build`.
7. Install Command: `pnpm install --frozen-lockfile`.
8. Selecciona la rama `main` para producción.

El repositorio ya contiene `vercel.json` y el build puede ejecutarse desde la raíz.

### 6.2 Variables obligatorias

Configura los valores en Vercel en **Settings → Environment Variables**.

Crea cada variable para **Production** y, si hará pruebas, también para **Preview**.

| Variable | Ejemplo o significado |
| --- | --- |
| `DATABASE_URL` | Cadena PostgreSQL de Supabase con `sslmode=require` |
| `AUTH_SECRET` | Secreto aleatorio de al menos 32 bytes |
| `AUTH_URL` | `https://TU-DOMINIO.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | `https://TU-DOMINIO.vercel.app` |
| `SMTP_HOST` | Host SMTP real |
| `SMTP_PORT` | `587` normalmente |
| `SMTP_SECURE` | `false` o `true` según SMTP |
| `SMTP_USER` | Usuario o clave pública del proveedor |
| `SMTP_PASSWORD` | Contraseña secreta SMTP |
| `EMAIL_FROM` | Correo verificado por el proveedor |
| `MAIL_DISPATCH_SECRET` | Secreto aleatorio de al menos 16 caracteres |
| `CREDENTIALS_ENCRYPTION_KEY` | Base64 de 32 bytes exactos |
| `SCANNER_CALLBACK_SECRET` | Secreto compartido web/worker |
| `REDIS_URL` | URL de Redis gestionado |
| `SCAN_REQUIRE_VERIFIED_DOMAIN` | `true` |

`NODE_ENV=production` es administrado por Vercel y Next.js. No lo configures manualmente.

### 6.3 Variables que deben permanecer vacías

En Production no configures:

```text
DEMO_MODE
DEMO_ALLOW_PRIVATE_TARGETS
DEMO_PAYMENT_WEBHOOK_SECRET
OAUTH_DEMO_BASE_URL
OAUTH_DEMO_GOOGLE_CLIENT_ID
OAUTH_DEMO_GOOGLE_CLIENT_SECRET
OAUTH_DEMO_GITHUB_CLIENT_ID
OAUTH_DEMO_GITHUB_CLIENT_SECRET
```

El proyecto rechaza el arranque si recibe cualquiera de esos aceleradores demo en producción.

### 6.4 Crear secretos seguros

En PowerShell:

```powershell
openssl rand -base64 32
```

Ejecuta este comando varias veces para obtener valores independientes para:

- `AUTH_SECRET`
- `MAIL_DISPATCH_SECRET`
- `SCANNER_CALLBACK_SECRET`
- `CREDENTIALS_ENCRYPTION_KEY`

No reutilices una contraseña humana ni una contraseña de Supabase como secreto de autenticación.

### 6.5 Configurar Redis externo

Sin Redis, Vercel puede mostrar y autenticar datos almacenados en Supabase, pero no debe presentarse como un sistema completo de escaneo.

Crea Redis administrado fuera de Vercel y define:

```text
REDIS_URL=rediss://usuario:password@host:6380/0
CELERY_BROKER_URL=rediss://usuario:password@host:6380/0
```

Usa `rediss://` solo si el proveedor soporta TLS. Si Redis usa una dirección normal sin TLS, usa `redis://` según las instrucciones del proveedor.

## 7. Desplegar el worker fuera de Vercel

Vercel puede alojar la web, pero no el proceso Celery permanente.

En el proveedor externo:

1. Construye `services/scanner` con su Dockerfile.
2. Configura `CELERY_BROKER_URL` igual al Redis gestionado.
3. Configura `SCANNER_CALLBACK_BASE_URL=https://TU-DOMINIO.vercel.app`.
4. Configura el mismo `SCANNER_CALLBACK_SECRET` usado en Vercel.
5. Configura `SCANNER_EGRESS_MODE=strict`.
6. Mantén la capacidad de salida hacia objetivos públicos.
7. No configures `DEMO_ALLOW_PRIVATE_TARGETS=true` en producción.

El callback del worker enviará eventos a:

```text
https://TU-DOMINIO.vercel.app/api/scans/[scanId]/callback
```

Si la URL base no coincide con el dominio real de Vercel, los callbacks pueden devolver 400 o 404 y el escaneo quedará incompleto.

## 8. Desplegar con Vercel

### 8.1 Preview

No intentes producción primero.

Instala el CLI:

```powershell
pnpm dlx vercel@latest login
pnpm dlx vercel@latest link
pnpm dlx vercel@latest
```

Este comando crea o actualiza un despliegue Preview.

Comando equivalente si ya configuraste el proyecto:

```powershell
pnpm deploy:preview
```

### 8.2 Producción

Cuando la Preview y las variables sean correctas:

```powershell
pnpm deploy:prod
```

O desde GitHub:

1. Abre el repositorio.
2. Confirma que `main` contiene el último commit.
3. Despliega desde Vercel.
4. Guarda la URL de producción asignada.
5. Actualiza `AUTH_URL` y `NEXT_PUBLIC_APP_URL` si el dominio cambia.
6. Redespliega después de cambiar estas variables.

## 9. Pruebas después del despliegue

### 9.1 Health check

Reemplaza `TU-DOMINIO`:

```powershell
Invoke-WebRequest "https://TU-DOMINIO.vercel.app/api/health" -UseBasicParsing
Invoke-WebRequest "https://TU-DOMINIO.vercel.app/api/ready" -UseBasicParsing
```

Resultado esperado:

- `/api/health`: HTTP 200.
- `/api/ready` con base y Redis: HTTP 200 y `status: "ok"`.
- `/api/ready` sin Redis: HTTP 200 y `status: "degraded"`.
- `/api/ready` sin PostgreSQL: HTTP 503 y `status: "unavailable"`.

### 9.2 Registro y login

1. Abre `https://TU-DOMINIO.vercel.app/register`.
2. Crea una cuenta real de prueba.
3. Comprueba el correo recibido mediante SMTP real.
4. Confirma el correo si el flujo lo exige.
5. Abre `/login`.
6. Inicia sesión.
7. Recarga la página.
8. Abre `/dashboard`.
9. Cierra sesión y confirma que ya no funciona una ruta protegida.

No uses las cuentas demo conocidas en una base pública real.

### 9.3 Escaneo público

Para probar un escaneo público:

1. Verifica que la cuenta tenga un dominio probado o usa el flujo de propiedad disponible.
2. Abre `https://TU-DOMINIO.vercel.app/scanner/new`.
3. Escanea un sitio público propio y autorizado.
4. Comprueba que el worker recibe el trabajo desde Redis.
5. Comprueba progreso, hallazgos y exportación.

No escanees un tercero sin permiso ni un objetivo privado si no se ha diseñado y aprobado el modo privado.

### 9.4 Suscripción simulada

Si Vercel usa el modo demo, la pasarela seguirá siendo simulada y debe estar etiquetada como tal.

En producción:

- no habilites `DEMO_MODE`;
- no configures `DEMO_PAYMENT_WEBHOOK_SECRET`;
- no presentes la suscripción simulada como cobro real;
- integra Stripe u otro proveedor real antes de cobrar usuarios.

## 10. Programaciones y correo

Las rutas que disparan trabajos deben quedar protegidas por secretos:

```text
POST /api/internal/schedules/run
POST /api/mail/dispatch
```

Ejecuta una comprobación manual solo después de configurar las variables:

```powershell
$headers = @{ Authorization = "Bearer $env:SCANNER_CALLBACK_SECRET" }
Invoke-RestMethod `
  -Method Post `
  -Uri "https://TU-DOMINIO.vercel.app/api/internal/schedules/run" `
  -Headers $headers

$headers = @{ Authorization = "Bearer $env:MAIL_DISPATCH_SECRET" }
Invoke-RestMethod `
  -Method Post `
  -Uri "https://TU-DOMINIO.vercel.app/api/mail/dispatch" `
  -Headers $headers
```

No publiques los secrets en scripts versionados ni en una URL de consulta.

## 11. Limpieza y separación local/remota

Para evitar que Vercel siga usando datos locales:

1. Comprueba que `DATABASE_URL` de Vercel apunte a Supabase.
2. No uses localhost, `127.0.0.1` o `postgres` como host del proyecto público.
3. Cambia `AUTH_URL` y `NEXT_PUBLIC_APP_URL` al dominio real.
4. Ejecuta `db:verify` contra Supabase antes de declarar el despliegue válido.
5. Ejecútalo otra vez después de migraciones futuras.

Puedes seguir usando PostgreSQL local para desarrollo, pero Vercel no debe leerlo.

## 12. Solución de problemas

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| `AUTH_SECRET is required` | Falta variable o se cambió después de iniciar | Configura el secreto en Vercel y redespliega |
| `DATABASE_URL must not be empty` | Falta conexión de base | Añade Supabase Database URL y redespliega |
| `password authentication failed` | Contraseña mal codificada o proyecto incorrecto | Copia otra vez la URI y verifica el usuario del pooler |
| `relation users does not exist` | Migraciones no ejecutadas | Ejecuta `db:migrate` contra Supabase |
| `journal mismatch` | Supabase tiene push sin journal completo | Revisa migraciones y ejecuta una migración limpia o restaura el estado esperado |
| `/api/ready` devuelve 503 | PostgreSQL no disponible | Revisa Supabase, TLS y `DATABASE_URL` |
| `/api/ready` devuelve `degraded` | Redis no disponible | Configura Redis externo |
| El escaneo no avanza | Worker no está activo | Desplega Celery fuera de Vercel y revisa Redis |
| El callback falla | URL o secreto incorrecto | Verifica `SCANNER_CALLBACK_BASE_URL` y `SCANNER_CALLBACK_SECRET` |
| Las sesiones desaparecen | `AUTH_SECRET` cambia entre despliegues | Usa el mismo secreto estable |
| Supabase no acepta conexión | Proyecto pausado o IP/restricciones | Reactiva el proyecto y prueba pooler/directo |
| El registro no envía correo | SMTP incompleto o desde no verificado | Configura SMTP real y el remitente verificable |

## 13. Checklist final

- [ ] Supabase creado y activo.
- [ ] Contraseña de base guardada fuera del código.
- [ ] Migraciones aplicadas en Supabase.
- [ ] `db:verify -- --strict` pasa.
- [ ] Respaldo local realizado si existen datos reales.
- [ ] Datos restaurados o base limpia sembrada deliberadamente.
- [ ] Variables de Vercel configuradas.
- [ ] Sin variables de modo demo en producción.
- [ ] Redis externo configurado si se necesitan colas.
- [ ] Worker Celery desplegado fuera de Vercel.
- [ ] SMTP real configurado.
- [ ] `/api/health` responde 200.
- [ ] `/api/ready` informa el estado real.
- [ ] Registro y login probados.
- [ ] Escaneo probado con un objetivo propio y autorizado.
- [ ] PDF, exportaciones y alertas probadas si los componentes externos existen.
- [ ] No hay `.env`, dump PostgreSQL, secretos ni contraseñas en Git.

## Referencias del repositorio

- [README.md](./README.md)
- [docs/vercel-deployment.md](./docs/vercel-deployment.md)
- [docs/supabase-setup.md](./docs/supabase-setup.md)
- [docs/local-postgres-setup.md](./docs/local-postgres-setup.md)
- [docs/database.md](./docs/database.md)
- [docs/deployment.md](./docs/deployment.md)
- [packages/db/drizzle.config.ts](./packages/db/drizzle.config.ts)
- [packages/db/scripts/verify-schema.mjs](./packages/db/scripts/verify-schema.mjs)
