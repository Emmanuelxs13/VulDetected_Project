# VulDetected

VulDetected es una plataforma web para comprobar la seguridad de objetivos
autorizados, convertir los resultados en hallazgos comprensibles y entregar
acciones de remediación. El repositorio contiene la aplicación Next.js, el
modelo Drizzle/PostgreSQL, los componentes de interfaz y el worker Python que
ejecuta los análisis.

Este README tiene dos objetivos:

1. explicar cómo levantar el proyecto desde una instalación limpia;
2. explicar, con evidencia concreta, de qué manera se cumple el Sprint 1 y cómo
   se valida el flujo completo de escaneo usado en la demo local.

> **Estado actual:** Sprint 1 está completado para demo local y el flujo
> ampliado de autenticación, verificación de propiedad, escaneo, progreso,
> hallazgos y exportación fue validado de extremo a extremo. La evidencia
> detallada está en [PRUEBA_SPRINT_1.md](PRUEBA_SPRINT_1.md) y
> [runtime-validation-report.md](runtime-validation-report.md).

## 1. Qué incluye el Sprint 1

El Sprint 1 establece los fundamentos sobre los que se ejecuta todo el
producto:

| Área | Qué entrega | Cómo se cumple |
| --- | --- | --- |
| Monorepo | pnpm workspaces y Turborepo para web, base de datos y UI | `pnpm install`, `pnpm lint`, `pnpm typecheck` y `pnpm build` se ejecutan desde la raíz. |
| Infraestructura local | PostgreSQL, Redis y Mailpit aislados en Docker | `infra/docker-compose.dev.yml` publica solo en loopback y define healthchecks. |
| Persistencia | Esquema Drizzle, migraciones y datos de autenticación | `packages/db` contiene el esquema y `pnpm --filter @vuldetected/db db:migrate` aplica las migraciones. |
| Autenticación | Registro, sesión, cierre de sesión y recuperación mediante Better Auth | La web usa Better Auth, argon2id y sesiones persistidas en PostgreSQL. `better-auth` está actualizado a una versión con los parches de seguridad requeridos. |
| Diseño | Tokens semánticos, componentes reutilizables y estados de severidad accesibles | `packages/ui` centraliza Button, Input, Card, Badge, Alert y la paleta semántica. |
| Seguridad | Validación de entorno, SSRF, autorización por propietario y callbacks autenticados | La aplicación rechaza configuraciones inseguras en producción y el worker revalida el destino antes de conectarse. |
| Evidencia | Pruebas automatizadas y ejecución real | El informe registra typecheck, lint, build, E2E, pruebas Python, escaneo real y exportaciones. |

El roadmap autoritativo se encuentra en
[docs/roadmap.md](docs/roadmap.md). El script
[scripts/check-sprints.js](scripts/check-sprints.js) permite comprobar los
estados que aparecen en ese roadmap.

## 2. Requisitos previos

- Node.js 22 o superior, según [.nvmrc](.nvmrc).
- pnpm 10.25.0, fijado por `packageManager` en [package.json](package.json).
- Docker Desktop con Compose v2.
- Git.
- Para ejecutar el worker fuera de Docker: Python 3.12 y las dependencias de
  [services/scanner/pyproject.toml](services/scanner/pyproject.toml).

En Windows se pueden preparar las herramientas con:

```powershell
corepack enable
corepack prepare pnpm@10.25.0 --activate
node --version
pnpm --version
docker info
```

`docker info` es la comprobación importante: confirma que el daemon está
activo, no solamente que el ejecutable de Docker existe.

## 3. Instalación y configuración local

### 3.1 Instalar dependencias

Desde la raíz del repositorio:

```powershell
pnpm install
```

### 3.2 Crear el entorno local

```powershell
Copy-Item .env.example .env
```

Completa como mínimo estas variables para desarrollo:

```dotenv
DATABASE_URL=postgresql://vuldetected:vuldetected@localhost:5432/vuldetected?schema=public
AUTH_SECRET=<secreto-local-de-32-o-mas-bytes>
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
EMAIL_FROM=VulDetected <noreply@vuldetected.local>
MAIL_DISPATCH_SECRET=<secreto-local-de-16-o-mas-caracteres>
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
SCANNER_CALLBACK_SECRET=dev-scanner-callback-secret
SCANNER_EGRESS_MODE=strict
```

Genera secretos reales para tu máquina. Por ejemplo, con OpenSSL:

```powershell
openssl rand -base64 32
```

Nunca copies una contraseña real al README, a `.env.example`, a un commit ni a
un comentario de GitHub. El archivo `.env` está ignorado por Git.

### 3.3 Levantar la infraestructura

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
docker compose -f infra/docker-compose.dev.yml ps
```

La pila local incluye:

- **PostgreSQL:** `localhost:5432`, base `vuldetected`.
- **Redis:** `localhost:6379`, broker del worker Celery.
- **Mailpit SMTP:** `localhost:1025`.
- **Mailpit UI:** <http://localhost:8025>.
- **Scanner:** worker aislado, sin puerto HTTP público, con filesystem de solo
  lectura, usuario no root y capacidades Linux retiradas.

Si `5432` ya está ocupado, no borres bases ajenas. Usa una base PostgreSQL
aislada o cambia el puerto publicado en Compose y actualiza `DATABASE_URL`.

## 4. Aplicar migraciones y preparar usuarios demo

Con PostgreSQL sano:

```powershell
pnpm --filter @vuldetected/db db:migrate
pnpm --filter @vuldetected/db db:verify
pnpm seed:demo
```

`db:verify` confirma que el esquema esperado existe. `seed:demo` crea usuarios
locales para demostrar el producto sin depender de un correo externo. Las
credenciales demo se muestran únicamente en la salida local del script y no
deben documentarse ni reutilizarse en producción.

Para validar la autenticación real con correo:

1. abre <http://localhost:3000/register>;
2. registra una cuenta de prueba;
3. abre <http://localhost:8025> y localiza el correo de verificación;
4. confirma el correo;
5. inicia sesión, recarga la página y cierra la sesión.

La validación de cierre de Sprint 1 utilizó usuarios demo sembrados para hacer
reproducible el flujo de escaneo. El registro y la confirmación de correo están
implementados y se pueden ejecutar con los pasos anteriores; no se deben
confundir con la evidencia específica del escaneo real.

## 5. Ejecutar la aplicación

En una terminal:

```powershell
pnpm dev
```

La aplicación queda disponible en <http://localhost:3000>. Para comprobar
rápidamente que responde:

```powershell
Invoke-WebRequest http://localhost:3000/api/health -UseBasicParsing
```

Debe devolver HTTP 200 y un JSON similar a:

```json
{"status":"ok","service":"vuldetected-web"}
```

Para detener la infraestructura sin eliminar sus datos:

```powershell
docker compose -f infra/docker-compose.dev.yml down
```

Para eliminar también los volúmenes locales, únicamente cuando estés seguro de
que no contienen datos que quieras conservar:

```powershell
docker compose -f infra/docker-compose.dev.yml down -v
```

## 6. Validar el Sprint 1 automáticamente

Ejecuta estos comandos desde la raíz:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pytest -q services/scanner/tests
node scripts/check-sprints.js
```

Resultados esperados de la validación registrada:

| Validación | Resultado esperado |
| --- | --- |
| Lint | PASS, sin errores ESLint. |
| Typecheck | PASS en los paquetes del workspace. |
| Unit tests | PASS en la suite Vitest. |
| E2E | 12/12 pruebas; usa PGlite para no depender de servicios externos. |
| Scanner | 85 pruebas Python aprobadas. |
| Sprint checker | Sprint 1, 2, 3 y 4 aparecen como `Completado`. |

También puedes ejecutar las comprobaciones de construcción:

```powershell
pnpm build
pnpm --filter @vuldetected/web build
pnpm audit --audit-level=high
```

El audit con nivel `high` debe terminar correctamente. Puede quedar un aviso
`moderate` transitorio en una dependencia indirecta de ESLint; se documenta
como riesgo separado y no oculta avisos críticos o altos.

## 7. Demostración completa: propiedad, escaneo y hallazgos

Esta sección prueba el flujo que convierte los fundamentos del Sprint 1 en una
experiencia verificable:

```text
sesión autenticada
  -> registrar objetivo
  -> publicar token de propiedad
  -> verificar por HTTP
  -> encolar scan en Redis
  -> ejecutar worker Celery
  -> recibir eventos de progreso
  -> persistir hallazgos
  -> mostrar severidad y remediación
  -> exportar CSV, JSON y PDF
```

### 7.1 Levantar la fixture vulnerable

En otra terminal:

```powershell
node e2e/fixtures/vulnerable-site/server.mjs
```

La fixture escucha en `127.0.0.1:8099` y solo existe para la demo. Es
intencionalmente vulnerable y no debe desplegarse ni copiarse a la aplicación.
El archivo de token se genera localmente y está excluido por
`.gitignore`.

### 7.2 Publicar el token de propiedad

Desde la pantalla de nuevo escaneo, copia el token mostrado por la aplicación y
escríbelo en la fixture:

```powershell
node scripts/demo/write-token.mjs <token-local-de-la-interfaz>
```

El script no recibe ni guarda credenciales de PostgreSQL. La fixture vuelve a
leer el archivo en cada solicitud, por lo que no necesita reiniciarse.

### 7.3 Permitir el objetivo privado solo en demo

El objetivo de la fixture es loopback. Para esta demostración local, inicia el
worker en modo desarrollo con `DEMO_ALLOW_PRIVATE_TARGETS=true`. Esta opción
debe estar desactivada en producción: las validaciones de entorno la rechazan
cuando `NODE_ENV=production`.

El flujo real validado produjo:

- 10/10 comprobaciones completadas;
- 33 hallazgos persistidos;
- 6 críticos, 9 altos, 14 medios, 3 bajos y 1 informativo;
- eventos de progreso visibles hasta 100%;
- exportaciones CSV, JSON y PDF con HTTP 200.

Los adaptadores de Nuclei y ZAP tienen normalización y fixtures probados, pero
la ejecución de esta demo usa los checks internos deterministas. Los binarios
externos solo se incorporan cuando `NUCLEI_BIN` o `ZAP_API_URL` están
configurados.

## 8. Cómo se cumple cada parte del Sprint 1

### Autenticación y sesiones

Better Auth integra las rutas de autenticación con las tablas de PostgreSQL.
Las contraseñas se procesan con argon2id y la aplicación usa cookies de sesión
para conservar la identidad entre solicitudes. Las acciones de servidor
validan entradas y los endpoints protegidos recuperan la sesión antes de
consultar datos privados.

La autorización no se basa solo en ocultar botones: las consultas de scans,
hallazgos y exportaciones filtran por el usuario propietario. Así, una sesión
autenticada no puede leer automáticamente los recursos de otra cuenta.

### Base de datos y migraciones

Drizzle mantiene el esquema en `packages/db/src/schema` y las migraciones en
`packages/db/drizzle`. La aplicación solo usa la base después de validar la
configuración de entorno; el proceso de build no necesita conectarse a
PostgreSQL. Esto permite que CI compile el proyecto sin exponer secretos.

### Sistema de diseño

Los componentes de `packages/ui` consumen tokens semánticos en vez de repetir
colores o espaciados en cada pantalla. Los estados de riesgo comunican color,
texto e icono para no depender únicamente del color. La interfaz de escaneo
reutiliza los mismos componentes para estados en cola, ejecución, completado,
fallo y cancelación.

### Seguridad del objetivo

Antes de encolar un análisis, la aplicación exige una prueba de propiedad.
Después, el worker vuelve a validar el destino: limita protocolos y puertos,
resuelve DNS, rechaza loopback, rangos privados y link-local, y revalida
redirecciones. El callback del worker exige un token Bearer compartido y no
permite que el worker escriba directamente en PostgreSQL.

### Progreso, hallazgos y exportación

El worker informa eventos al endpoint autenticado. La aplicación los persiste
en `scan_events` y la página de detalle los consume para mostrar progreso. Los
hallazgos se normalizan a una forma común, independientemente de que procedan
de un check interno, Nuclei o ZAP. Las rutas de exportación aplican la misma
autorización por propietario antes de generar CSV, JSON o PDF.

## 9. Arranque de producción

El build y el arranque de producción son validaciones separadas:

```powershell
pnpm --filter @vuldetected/web build
```

En producción son obligatorios `AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`,
`SCANNER_CALLBACK_SECRET`, `MAIL_DISPATCH_SECRET`, SMTP y una configuración
segura del worker. No uses `DEMO_ALLOW_PRIVATE_TARGETS=true`.

El proyecto genera un artefacto standalone. En despliegues directos, usa el
servidor generado por Next.js y copia `.next/static` al artefacto standalone
como hace el job `smoke` de [.github/workflows/ci.yml](.github/workflows/ci.yml).
No uses secretos de desarrollo como valores de producción.

## 10. Evidencia y límites

La evidencia oficial está separada en dos documentos:

- [PRUEBA_SPRINT_1.md](PRUEBA_SPRINT_1.md): matriz descriptiva de historias,
  criterios, pasos de demo, riesgos y límites.
- [runtime-validation-report.md](runtime-validation-report.md): comandos,
  códigos de salida, conteos y veredicto `overall: PASS`.

La validación no afirma que los binarios externos de Nuclei y ZAP se hayan
ejecutado en esa sesión. Tampoco convierte la existencia de una prueba unitaria
en prueba de navegador. Las brechas adicionales —por ejemplo, ejecutar el
registro desde estado limpio varias veces, probar IDOR con dos cuentas y
archivar capturas o video— están descritas en
[PRUEBA_SPRINT_1.md](PRUEBA_SPRINT_1.md).

## 11. Referencias

| Documento | Propósito |
| --- | --- |
| [docs/roadmap.md](docs/roadmap.md) | Alcance y estado oficial de cada sprint. |
| [docs/architecture.md](docs/architecture.md) | Componentes, flujos y fronteras de confianza. |
| [docs/database.md](docs/database.md) | Tablas, migraciones y decisiones de persistencia. |
| [docs/security.md](docs/security.md) | Modelo de amenazas y controles de seguridad. |
| [docs/changelog.md](docs/changelog.md) | Registro de cambios del producto. |
| [docs/adr/](docs/adr/) | Decisiones arquitectónicas y sus motivos. |
| [infra/README.md](infra/README.md) | Detalle de la infraestructura Docker local. |
| [services/scanner/README.md](services/scanner/README.md) | Pruebas y ejecución del worker Python. |
