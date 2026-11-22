# Despliegue de VulDetected en Vercel

Este documento prepara el **frontend y la API web de VulDetected** para Vercel.
No expone secretos, no activa modo demo y no afirma que el worker Celery puede
estar dentro de una función Vercel.

## Qué se despliega

- Aplicación Next.js en `apps/web`.
- API de autenticación, dominios, escaneos, hallazgos, informes y suscripciones.
- PostgreSQL externo compatible con `postgres://` o `postgresql://`.
- Redis externo opcional para cola, límites y cancelación.
- SMTP externo para correos reales.

El scanner Celery, el planificador persistente y el scheduler son procesos
long-lived. Deben correr fuera de Vercel en Railway, Render, un VPS, Azure o
Docker. Si no se despliegan, la web puede iniciar y autenticarse, pero los
escaneos reales no pueden completarse.

## Preparación del proyecto en GitHub

La rama debe quedar publicada y sin archivos `.env` o secretos. La configuración
incluye `vercel.json` en la raíz y detecta el workspace Next.js con Turborepo:

```json
{
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm --filter @vuldetected/web build"
}
```

En el panel de Vercel:

1. Importa `Emmanuelxs13/VulDetected_Project`.
2. Mantén **Root Directory** en la raíz del repositorio.
3. Marca Next.js como framework.
4. Configura las variables de entorno descritas abajo.
5. Despliega una Preview primero.

## Base de datos

Usa PostgreSQL gestionado, por ejemplo Supabase o Neon. La cadena debe quedar
como valor secreto en Vercel:

```text
DATABASE_URL=postgresql://usuario:contraseña@host:5432/base?schema=public&sslmode=require
```

Ejecuta las migraciones desde tu máquina contra esa base antes del despliegue:

```powershell
$env:DATABASE_URL="postgresql://usuario:contraseña@host:5432/base?schema=public&sslmode=require"
pnpm --filter @vuldetected/db db:migrate
pnpm --filter @vuldetected/db db:verify
Remove-Variable DATABASE_URL
```

No ejecutes las migraciones contra datos reales sin respaldo. Para verificar
que el esquema quedó correcto:

```powershell
$env:DATABASE_URL="<cadena-postgres-gestionada>"
pnpm --filter @vuldetected/db db:verify
```

## Variables obligatorias

Configura estas variables en Preview y Production:

| Variable | Tipo | Ejemplo seguro |
| --- | --- | --- |
| `DATABASE_URL` | Secret | Cadena PostgreSQL gestionada con TLS |
| `AUTH_SECRET` | Secret | Resultado de `openssl rand -base64 32` |
| `AUTH_URL` | Config | `https://tu-proyecto.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | Config | `https://tu-proyecto.vercel.app` |
| `SMTP_HOST` | Config | Host SMTP real |
| `SMTP_PORT` | Config | `587` |
| `SMTP_SECURE` | Config | `false` o `true` según el proveedor |
| `SMTP_USER` | Secret | Usuario SMTP real |
| `SMTP_PASSWORD` | Secret | Contraseña SMTP real |
| `EMAIL_FROM` | Config | `VulDetected <correo-verificado@example.com>` |
| `MAIL_DISPATCH_SECRET` | Secret | Resultado de `openssl rand -base64 32` |
| `CREDENTIALS_ENCRYPTION_KEY` | Secret | Base64 de exactamente 32 bytes |
| `SCANNER_CALLBACK_SECRET` | Secret | Resultado de `openssl rand -base64 32` |
| `REDIS_URL` | Secret | Redis gestionado con TLS si está disponible |
| `SCAN_REQUIRE_VERIFIED_DOMAIN` | Config | `true` |

`NODE_ENV=production` debe quedar administrado por Vercel/Next.js. No lo
sobreescribas manualmente.

## Variables que deben permanecer ausentes

En producción no debes configurar:

- `DEMO_MODE`
- `DEMO_ALLOW_PRIVATE_TARGETS`
- `DEMO_PAYMENT_WEBHOOK_SECRET`
- `OAUTH_DEMO_BASE_URL`
- `OAUTH_DEMO_GOOGLE_CLIENT_ID`
- `OAUTH_DEMO_GOOGLE_CLIENT_SECRET`
- `OAUTH_DEMO_GITHUB_CLIENT_ID`
- `OAUTH_DEMO_GITHUB_CLIENT_SECRET`
- `SCAN_REQUIRE_VERIFIED_DOMAIN=false`

La aplicación rechaza estas combinaciones al resolver la configuración por
primera vez. Esta negativa es deliberada: evita que un modo demo se publique
como producción.

## Redis y worker

Para pruebas web, Redis puede quedar ausente: `/api/ready` responderá
`degraded`, la autenticación seguirá funcionando y el limitador entrará en
modo por proceso. No representa una instalación completa.

Para un despliegue funcional con escaneos:

1. Crea Redis gestionado.
2. Configura `REDIS_URL` y `CELERY_BROKER_URL` en el worker.
3. Desplega `services/scanner` como servicio persistente, no como función.
4. Configura `SCANNER_CALLBACK_BASE_URL=https://tu-dominio.vercel.app`.
5. Usa el mismo `SCANNER_CALLBACK_SECRET` en Vercel y el worker.
6. Mantén `SCANNER_EGRESS_MODE=strict` salvo que haya una razón aprobada y
   documentada para otro modo.

Las direcciones privadas no deben habilitarse en la demo pública Vercel.

## SMTP y pruebas

Usa SMTP real con credenciales únicamente en Vercel. No uses Mailpit en
producción. Después del despliegue:

- crea una cuenta real de prueba;
- verifica el correo recibido;
- inicia sesión y cierra sesión;
- confirma `/api/health`;
- confirma `/api/ready`;
- prueba registros, scans y exportaciones según la base disponible.

## Cron y correo

El planificador y el despachador requieren un proceso externo o un scheduler
que haga `POST` con los secrets configurados:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://tu-dominio.vercel.app/api/internal/schedules/run" `
  -Headers @{ Authorization = "Bearer $env:SCANNER_CALLBACK_SECRET" }

Invoke-RestMethod -Method Post `
  -Uri "https://tu-dominio.vercel.app/api/mail/dispatch" `
  -Headers @{ Authorization = "Bearer $env:MAIL_DISPATCH_SECRET" }
```

No uses un cron público sin autorización.

## Comandos CLI opcionales

Instala y autentica Vercel:

```powershell
pnpm dlx vercel@latest login
pnpm dlx vercel@latest link
pnpm dlx vercel@latest
```

Para producción:

```powershell
pnpm dlx vercel@latest --prod
```

El despliegue solo debe hacerse después de:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pytest -q services/scanner/tests
pnpm build
```

## Comprobaciones posteriores al despliegue

```powershell
Invoke-WebRequest https://tu-dominio.vercel.app/api/health -UseBasicParsing
Invoke-WebRequest https://tu-dominio.vercel.app/api/ready -UseBasicParsing
```

El resultado correcto es:

- `/api/health`: HTTP 200.
- `/api/ready`: HTTP 200 con `status: "ok"` si PostgreSQL y Redis funcionan;
  `status: "degraded"` si PostgreSQL funciona y Redis no está disponible.
- `/api/ready`: HTTP 503 si PostgreSQL no está disponible.

## Resultado esperado

Una Preview o producción Vercel puede validar la web, autenticación, persistencia,
facturación simulada, PDF y navegación. Un escaneo real completo requiere Redis,
worker externo y SMTP. Sin esos componentes no se debe presentar el despliegue
como el producto Sprint 2 completo, sino como la capa web verificada.
