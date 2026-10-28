# Despliegue de VulDetected

Este documento es el runbook para desplegar VulDetected en un único host con Docker Compose. Es un despliegue de referencia, no una plataforma gestionada. TLS, backups, rotación de secretos, log shipping y protección DDoS quedan fuera de alcance deliberadamente.

## 1. Requisitos

| Componente | Requisito | Notas |
|---|---|---|
| Sistema operativo | Linux (recomendado) o VM con Docker Engine | En local con Windows Docker puede no estar disponible; ver [6. Desarrollo local sin Docker](#6-desarrollo-local-sin-docker). |
| Docker | Engine + Compose v2 | `docker compose` (plugin). |
| Recursos | Mínimo 4 vCPU / 6 GB RAM / 40 GB disco | Ajustar según carga. El worker está limitado a 2 CPU / 1 GB en `infra/docker-compose.prod.yml`. |
| Red | Salida a Internet desde el servicio `scanner` | Necesaria para escanear objetivos arbitrarios. El worker **no** está en una red `internal`. |
| Dominio / DNS | Apuntar al host con TLS terminado por un reverse proxy | El contenedor `web` solo escucha HTTP en loopback por defecto (`127.0.0.1:3000`). |

## 2. Preparación

### 2.1 Clonar y preparar entorno
```bash
git clone <repo-url>
cd VulDetected_Project
cp infra/.env.prod.example infra/.env.prod
```

### 2.2 Generar secretos obligatorios
Los siguientes valores son **requeridos** por `infra/docker-compose.prod.yml` (`${VAR:?}`).

| Variable | Cómo generar | Uso |
|---|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` | Firmado de sesiones Better Auth (>= 32 bytes) |
| `SCANNER_CALLBACK_SECRET` | `openssl rand -base64 32` | Autenticación compartida web ↔ worker/scheduler (Bearer). Nunca viaja por el broker. |
| `MAIL_DISPATCH_SECRET` | `openssl rand -base64 32` | Protección de `POST /api/mail/dispatch` (outbox). |
| `CREDENTIALS_ENCRYPTION_KEY` | `openssl rand -base64 32` \| `base64 -d \| wc -c` debe ser 32 bytes crudos, o usar valor 32-byte base64 | Cifrado de credenciales almacenadas para escaneos autenticados. |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` | Contraseña de Postgres. Cambiar **antes** del primer arranque (el volumen se inicializa una vez). |

Rellenar también: `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`, `SMTP_HOST/PORT/USER/PASSWORD/SECURE` (SMTP real obligatorio en producción).

Ver `infra/.env.prod.example` para la lista completa y comentarios.

### 2.3 Configurar reverse proxy (TLS)
Bind por defecto: `127.0.0.1:${WEB_PORT:-3000}:3000`. Terminar TLS en Nginx/Caddy/Traefik delante de `web`. Forzar HTTPS, redirigir HTTP→HTTPS y reenviar cabeceras `X-Forwarded-For`/`X-Forwarded-Proto` coherentes con la configuración de la app.

## 3. Despliegue con Docker Compose

Desde la raíz del repo:

```bash
# Construir y levantar stack
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d --build

# Comprobar estado
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml ps

# Ver logs
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml logs -f web
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml logs -f scanner
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml logs -f migrate
```

### Orden de arranque
1. `postgres` y `redis` con healthchecks.
2. `migrate` (target `migrator`): ejecuta `db:migrate && db:verify`. Usa `service_completed_successfully`.
3. `web` (target `runtime`), `scheduler` arrancan tras migraciones OK.
4. `scanner` (Celery worker) se conecta a Redis por la red aislada `scanner`.

### Migraciones
El servicio `migrate` aplica migraciones de `packages/db/drizzle` y verifica el esquema con `packages/db/scripts/verify-schema.mjs`. En `NODE_ENV=production` o con `--strict` el `journal` debe coincidir (modo estricto). En local con `drizzle-kit push` el journal puede estar vacío y el verificador es permisivo fuera de producción.

Comandos equivalentes manuales:

```bash
pnpm --filter @vuldetected/db db:migrate
pnpm --filter @vuldetected/db db:verify
```

## 4. Comprobaciones post-despliegue

### 4.1 Probes
| Endpoint | Tipo | Comportamiento |
|---|---|---|
| `GET /api/health` | Liveness | Siempre 200 si el proceso está vivo. **No** comprueba dependencias (evita restart-loops). |
| `GET /api/ready` | Readiness | 200 con `status: "ok"` si DB y Redis OK. 200 con `status: "degraded"` si DB OK pero Redis caído (rate-limiter/cancelación en modo degradado). 503 con `status: "unavailable"` si **DB** no responde. |

Ejemplo:
```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/ready
```

El healthcheck de `web` en Compose usa `GET /api/ready`.

### 4.2 Verificaciones rápidas
- [ ] Login accesible por HTTPS
- [ ] Envío de escaneo requiere dominio verificado (guard estructural)
- [ ] Worker registra callbacks con `SCANNER_CALLBACK_SECRET`
- [ ] Correos se envían vía SMTP configurado (o Mailpit solo con `--profile mail` para demo)
- [ ] Scheduler ejecuta con `node scripts/run-scheduler.mjs`

### 4.3 Mailpit (opcional para demo)
Nunca habilitar con usuarios reales. Solo para pruebas locales/demostración:

```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml --profile mail up -d mailpit
```
Configurar `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_SECURE=false`. UI en `http://127.0.0.1:8025`.

## 5. Seguridad operativa

- **Red aislada**: `scanner` solo comparte red con `redis` y `web`. Postgres **no** es alcanzable desde el worker.
- **Hardening del worker**: `user: '1000:1000'`, `read_only: true`, `tmpfs: /tmp`, `cap_drop: ALL`, `no-new-privileges:true`. Sin volúmenes del host.
- **Secretos**: Solo vía `.env.prod` (git-ignorado). `NEXT_PUBLIC_*` son públicas. Nunca loggear secretos/cabeceras/tokens.
- **SSRF**: Modo `strict` por defecto. Ver reglas en `docs/security.md` §2.
- **Callbacks**: Autenticación Bearer + `crypto.timingSafeEqual`. Idempotencia por `(scan_id, seq)` / `(scan_id, finding_key)`.
- **Sesiones**: `HttpOnly`, `SameSite=Lax`, `Secure` según esquema. Caducidad absoluta 7 días con renovación limitada. Ver `docs/security.md` §4 (riesgo residual documentado sobre almacenamiento de token).

Ver `docs/security.md` para modelo de amenazas completo.

## 6. Desarrollo local sin Docker

Docker puede no estar disponible localmente. El desarrollo **no debe depender** de él:

```bash
pnpm install
pnpm db:migrate  # o db:push según flujo
pnpm dev         # web + servicios según scripts
```

- **Redis**: Si no corre en `localhost:6379`, `/api/ready` responderá `degraded` (esperado localmente). El rate-limiter degrada a ventana por proceso con fallo cerrado.
- **Postgres**: Requerido para la app. Usar instancia local o remota.
- **Worker**: Opcional localmente. Para probar callbacks usar mocks/Mailpit si aplica.
- **Build standalone**: `pnpm build` genera `.next/standalone`. Para arrancarlo localmente copiar estáticos:
  ```bash
  cp -r apps/web/.next/static apps/web/.next/standalone/.next/static
  node apps/web/.next/standalone/server.js
  ```

## 7. CI/CD

El pipeline `.github/workflows/ci.yml` ejecuta: `static` (lint+typecheck), `test` (unit+E2E sin servicios), `python` (pytest worker), `smoke` (Postgres+Redis reales, migraciones + verify, build, ensamblado standalone, boot, probes `health`/`ready`, assets estáticos, i18n), `audit` (`pnpm audit --audit-level=high`), `docker` (build targets `runtime` y `migrator`).

`format:check` no es gate por archivos preexistentes.

## 8. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `migrate` falla / `web` no arranca | Migraciones pendientes o `db:verify` estricto falla | Revisar logs `migrate`. Comprobar `packages/db/drizzle/journal.json`. Asegurar `DATABASE_URL` correcto. |
| `/api/ready` → 503 `unavailable` | Postgres inaccesible | Comprobar `postgres` healthy. Ver `DATABASE_URL` (host `postgres` en red Docker). |
| `/api/ready` → 200 `degraded` | Redis inaccesible | Comprobar `redis` healthy. En dev es aceptable si no se usan colas/rate-limit crítico. |
| Worker no procesa scans | Redis/`CELERY_BROKER_URL` o `SCANNER_CALLBACK_SECRET` mal | Comprobar red `scanner`. Ver logs `scanner`. Validar secreto compartido. |
| Errores SMTP en auth | SMTP no configurado/incorrecto | Configurar SMTP real o usar Mailpit con profile `mail`. Revisar `EMAIL_FROM` verificado por proveedor. |
| Imagen falla al arrancar standalone | Faltan `.next/static` copiados | Seguir paso de ensamblado: `cp -r .next/static .next/standalone/.next/static`. Ver `outputFileTracingIncludes` en `next.config.ts`. |

## 9. Fuera de alcance
- TLS automático (usar reverse proxy)
- Backups automáticos de Postgres/Redis
- Rotación de secretos automatizada
- Escalado horizontal / load balancing avanzado
- WAF / DDoS
- Penetración formal
- Aislamiento multi-tenant completo (ver `docs/adr/0005-deferred-multi-tenancy.md`)

## Referencias
- `infra/docker-compose.prod.yml`
- `infra/.env.prod.example`
- `Dockerfile`
- `.github/workflows/ci.yml`
- `docs/security.md`
- `docs/architecture.md`
