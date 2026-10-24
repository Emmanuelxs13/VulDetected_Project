# Guía de pruebas local — VulDetected

Esta guía cubre las features disponibles en la rama de trabajo. Los planes,
suscripciones y usuarios descritos aquí son fixtures locales: no hay cobros
reales, Stripe ni credenciales de producción.

## 1. Preparar el entorno

Requisitos:

- Node.js 22 o superior.
- pnpm 10.
- PostgreSQL, Redis (por defecto `localhost:6379`) y el worker del scanner disponibles.
- Variables de `.env.example` copiadas a `.env` o `apps/web/.env.local`.

Instalar y aplicar migraciones:

```powershell
pnpm install
pnpm --filter @vuldetected/db db:migrate
pnpm seed:demo
pnpm dev
```

Si la base local ya existía antes de que se añadieran las migraciones de
Sprint 4, sincroniza primero el esquema:

```powershell
pnpm --filter @vuldetected/db exec drizzle-kit push --force
pnpm seed:demo
```

La aplicación falla cerradamente si Redis no está disponible: el endpoint de
autenticación responde `429` para no permitir intentos sin rate limiting. Si
ves `{"error":"Rate limit exceeded"}` incluso con las credenciales correctas,
inicia Redis y reinicia el servidor web.

En otra terminal, iniciar el worker según las instrucciones de
`services/scanner/README.md`.

Para mantener activas las programaciones durante una sesión local, iniciar
también el reloj operativo:

```powershell
pnpm scheduler:dev
```

El reloj ejecuta el endpoint interno inmediatamente y después cada 60 segundos.
Se puede ajustar `SCHEDULER_INTERVAL_MS` sin cambiar el código.

## 2. Usuarios demo y planes

Los tres usuarios comparten esta contraseña **solo para desarrollo local**:
`VulDetected-Demo-2026!`

| Usuario | Plan | Qué validar |
|---|---|---|
| `demo.free@vuldetected.local` | Free | Límite de scans, sin programación, sin PDF ni alertas |
| `demo.pro@vuldetected.local` | Pro | Programaciones, PDF, targets privados y alertas críticas |
| `demo.business@vuldetected.local` | Business | Cuotas ampliadas y hasta 25 programaciones |

El comando `pnpm seed:demo` es idempotente: actualiza esos usuarios si ya
existen y vuelve a generar hashes Argon2id. No usar estas credenciales fuera
de una base de datos local.

## 3. Flujos funcionales

### Autenticación y cuenta

1. Abrir `/register` y comprobar el registro de un usuario nuevo.
2. Cerrar sesión y entrar por `/login`.
3. Probar cada usuario demo y verificar que `/dashboard` muestra su plan.
4. Confirmar que una sesión no puede consultar scans o dominios de otro usuario.

### Scans y findings

1. En `/domains`, registrar un dominio de pruebas y completar su verificación.
2. Crear un scan desde `/scans`.
3. Abrir el detalle del scan y comprobar la transición `queued` → `running` →
   `completed` (o `failed`).
4. Exportar el PDF desde el detalle cuando se use Pro o Business.
5. Comprobar que un usuario Free no obtiene capacidades de un plan superior.

### Scans programados

1. Con el usuario Pro o Business, crear una programación diaria o semanal.
2. Pausarla, reanudarla y verificar que conserva su intervalo.
3. Ejecutar el endpoint interno con el secreto configurado:

```powershell
curl.exe -X POST http://localhost:3000/api/internal/schedules/run `
  -H "x-scanner-secret: $env:SCANNER_CALLBACK_SECRET"
```

4. Confirmar que cada ejecución crea un scan y que una programación vencida se
   procesa en orden.

### Seguridad visual y reporting

1. En el dashboard, validar el semáforo de riesgo y el historial.
2. Filtrar por severidad y revisar que los conteos coincidan con la tabla.
3. Descargar el PDF y comprobar el resumen ejecutivo y el breakdown de severidad.

## 4. Validación automatizada

```powershell
pnpm --filter @vuldetected/db typecheck
pnpm --filter @vuldetected/web typecheck
pnpm --filter @vuldetected/web lint
pnpm --filter @vuldetected/web test
pnpm --filter @vuldetected/web build
```

Si se ejecutan tests desde la raíz, el test de mensajes puede necesitar
ejecutarse desde `apps/web` por su resolución de rutas de fixtures.

## 5. Datos y límites conocidos

- El catálogo Free/Pro/Business está quemado en
  `apps/web/src/lib/plans.ts`.
- La suscripción se almacena como metadata de usuario para esta etapa; no
  representa facturación ni renovación automática.
- No colocar secretos reales en este archivo ni en `.env.example`.
- Para reiniciar únicamente los usuarios demo, ejecutar de nuevo
  `pnpm seed:demo`; no borra dominios ni resultados de scans.
