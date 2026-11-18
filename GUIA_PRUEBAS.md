# Guía de pruebas local — VulDetected

Esta guía cubre lo que está implementado hoy en la rama de trabajo. Los planes,
suscripciones, identidades sociales y usuarios descritos aquí son fixtures
locales: no hay cobros reales, no hay credenciales de Google ni de GitHub y no hay
pasarela conectada.

Para la verificación formal del Sprint 2, con evidencia por criterio y mediciones,
ver [PRUEBA_SPRINT_2.md](PRUEBA_SPRINT_2.md). Esta guía es el recorrido corto para
probar a mano; aquel documento es el acta.

## 1. Preparar el entorno

Requisitos:

- Node.js 22 o superior y pnpm 10.
- PostgreSQL 18 en `127.0.0.1:5432`, base `vuldetected` (ver
  `docs/local-postgres-setup.md`).
- Python 3.12 para el worker (`pip install -r services/scanner/requirements.txt`).
- Chromium de Playwright para las pruebas de navegador:
  `pnpm exec playwright install chromium`.

Redis y Mailpit no hace falta instalarlos: `pnpm dev:all` usa los binarios locales
de `%LOCALAPPDATA%\VulDetected\tools\` y cae a Docker si no están.

```powershell
pnpm install
Copy-Item .env.example apps/web/.env.local   # y completar los valores locales
pnpm dev:all
```

`pnpm dev:all` prueba cada dependencia antes de arrancarla, así que ejecutarlo dos
veces no rompe nada. Arranca, en este orden: PostgreSQL (solo comprueba), Redis,
Mailpit, el fixture, el proveedor OAuth simulado, el worker Celery local, el
planificador, el despachador de correo y, al final, Next.js.

**El worker de Docker debe estar detenido.** En modo demo el único worker
soportado es el local: un contenedor tiene su propia red, no alcanza el fixture
del host y no puede devolver el callback a `localhost:3000`.

La aplicación falla cerradamente si Redis no está disponible: el endpoint de
autenticación responde `429` para no permitir intentos sin rate limiting. Si ves
`{"error":"Rate limit exceeded"}` con las credenciales correctas, Redis no está
arriba.

### 1.1 Dejar los datos en el punto de partida

Todos los aceleradores exigen `DEMO_MODE=true` y todos son idempotentes:

```powershell
pnpm demo:reset           # escaneos, hallazgos, programaciones, credenciales, dominios, sesiones
pnpm demo:seed-history    # seis meses de historial is_demo
pnpm demo:reset-billing   # cada cuenta demo vuelve a su plan sembrado
pnpm demo:reset-social    # borra las identidades sociales simuladas y sus vínculos
```

`pnpm demo:reset` **no borra usuarios**, así que las cuentas demo y sus contraseñas
siguen existiendo entre corridas.

### 1.2 Por qué se usa `next dev` y no una compilación de producción

`DEMO_MODE` se rechaza con `NODE_ENV=production`, a propósito: es lo que impide
que los aceleradores, el fixture y la pasarela simulada lleguen a un despliegue
real. La consecuencia práctica es que la demo corre sobre `next dev`, que compila
cada ruta la primera vez que se visita. Esas compilaciones cuestan entre 5 y 28
segundos por ruta y no forman parte del producto: recorre las pestañas una vez
antes de medir o de mostrar.

## 2. Usuarios demo y planes

Todas las cuentas comparten esta contraseña **solo para desarrollo local**:
`VulDetected-Demo-2026!`

| Usuario | Plan | Qué validar |
|---|---|---|
| `demo.free@vuldetected.local` | Free | Límite de scans; contratar Pro en el recorrido de facturación |
| `demo.pro@vuldetected.local` | Pro | Cuenta principal de la demo; dueña del dominio |
| `demo.business@vuldetected.local` | Business | Cuotas ampliadas y varias programaciones |
| `demo.sinverificar@vuldetected.local` | Free | Cuenta sin correo verificado (CA-33) |
| `demo@miapp.local` | — | Login del fixture, no de VulDetected. Contraseña `Fixture-Pass-2026!` |

El comando `pnpm seed:demo` es idempotente: actualiza esos usuarios si ya existen y
vuelve a generar hashes Argon2id. No usar estas credenciales fuera de una base de
datos local.

## 3. Flujos funcionales

### 3.1 Autenticación y cuenta

1. Abrir `/register` y comprobar el registro de un usuario nuevo.
2. Cerrar sesión y entrar por `/login`.
3. Probar cada usuario demo y verificar que `/dashboard` muestra su plan.
4. Confirmar que una sesión no puede consultar scans o dominios de otro usuario.

### 3.2 Scans y hallazgos

1. En `/domains`, registrar un dominio de pruebas y completar su verificación.
2. Crear un scan desde `/scanner`.
3. Abrir el detalle del scan y comprobar la transición `queued` → `running` →
   `completed` (o `failed`).
4. Exportar el PDF desde el detalle cuando se use Pro o Business.
5. Comprobar que un usuario Free no obtiene capacidades de un plan superior.

### 3.3 Cancelar un scan sin perder lo hallado (HU-06)

1. Activar la lentitud del fixture: `http://127-0-0-1.nip.io:8099/__demo/slow/on`.
2. Lanzar un scan y abrir su detalle.
3. Esperar a que termine al menos una comprobación y pulsar **Cancelar escaneo**.
4. El scan queda «Cancelado» con la insignia «Resultados parciales» y conserva los
   hallazgos ya encontrados.
5. Revisar el correo «Escaneo cancelado» en `http://localhost:8025`.
6. Desactivar la lentitud: `/__demo/slow/off`.

### 3.4 Scans programados y alertas (HU-07)

1. Con un usuario Pro o Business, crear una programación diaria o semanal en
   `/schedules`.
2. Pausarla, reanudarla y verificar que conserva su intervalo.
3. Ejecutarla sin esperar la ventana:
   `pnpm demo:run-schedule-now --domain 127-0-0-1.nip.io`
4. Activar la inyección SQL del fixture (`/__demo/sqli/on`) y comprobar que llega
   un correo «Hallazgo crítico» a Mailpit.
5. Desactivarla: `/__demo/sqli/off`.

### 3.5 Historial comparativo y PDF ejecutivo (HU-09, HU-10)

1. En `/reports`, abrir el historial del dominio pulsando su nombre.
2. Comprobar que cada instantánea muestra su conteo por severidad, que el delta se
   explica y que la pantalla dice que **no hay una nota compuesta**.
3. Descargar el informe ejecutivo desde el detalle de un scan con
   **Exportar PDF (Ejecutivo)**.
4. Comprobar que un scan parcial **no** imprime veredicto de riesgo y que un scan
   con datos demo lleva la banda de aviso dentro del documento.

### 3.6 Escaneo detrás de un login (HU-04)

1. En `/settings`, guardar una credencial de formulario para el fixture:
   - Ruta de login: `/login`
   - Campos: `email` / `password`
   - Valores: `demo@miapp.local` / `Fixture-Pass-2026!`
   - Marcador de éxito: un texto que solo aparezca tras autenticarse
2. Lanzar un scan del fixture y abrir el detalle.
3. Comprobar la insignia «Escaneo autenticado» y que hay hallazgos con `/private`
   en el `endpoint`.
4. Repetir con una contraseña incorrecta: el scan debe **fallar** con el motivo
   traducido y **no** mostrar la insignia. Degradar a anónimo en silencio sería un
   fallo de seguridad.

### 3.7 Inicio de sesión social (HU-02a)

1. En `/login`, pulsar **Continuar con Google**.
2. Comprobar que la pantalla del proveedor lleva la banda
   «PROVEEDOR DE IDENTIDAD SIMULADO». No son los servidores de Google.
3. Elegir una identidad y autorizar; la sesión vuelve a `/dashboard`.
4. Cerrar sesión y volver a entrar con el mismo proveedor: debe ser un ingreso
   normal, sin crear una cuenta nueva.

### 3.8 Suscripción con pago simulado (HU-02b)

1. Entrar como `demo.free@` y abrir `/settings/billing`.
2. Comprobar la banda «Modo demostración: no se realiza ningún cobro».
3. Pulsar **Cambiar a Pro** y pagar con la tarjeta aprobada
   `4242 4242 4242 4242`.
4. El plan cambia a Pro **solo** cuando el webhook firmado se aplica.
5. Repetir con la tarjeta rechazada `4000 0000 0000 0002`: el plan no cambia.
6. Volver al punto de partida con `pnpm demo:reset-billing`.

## 4. Validación automatizada

Desde la raíz:

```powershell
pnpm typecheck
pnpm lint
pnpm test          # vitest sobre PGlite
pnpm test:e2e      # pruebas de integración con PGlite
pnpm test:browser  # Playwright contra la aplicación en ejecución
pnpm build
```

El worker Python se prueba desde su propio directorio:

```powershell
cd services/scanner
pytest -q
```

`pnpm test:browser` necesita la pila completa arriba (`pnpm dev:all`) y el worker
local corriendo. El recorrido de demo de ocho pasos está en
`e2e/sprint2-demo.spec.ts` y escribe sus capturas en `docs/capturas/sprint-2/`.

## 5. Datos y límites conocidos

- El catálogo Free/Pro/Business está en `apps/web/src/lib/plans.ts`. El precio del
  plan Pro se muestra como `[COMPLETAR: precios definitivos]`: el equipo no lo ha
  fijado.
- La suscripción se almacena como columna de plan en `users`; no hay tabla de
  planes. No representa facturación ni renovación automática real.
- No hay credenciales reales de Google ni de GitHub: el proveedor social es un
  simulador local en el puerto 8100 que se niega a arrancar sin `DEMO_MODE=true`.
- No hay pasarela de pago conectada: `PaymentProvider` aísla el simulador para que
  conectarla sea una integración.
- El escaneo autenticado se demuestra contra un fixture local porque una intranet
  real exigiría desactivar el guard SSRF, y el guard no se desactiva.
- La barrera de correo verificado para auditoría activa, programaciones y
  exportaciones está documentada (ADR 0014) y **no implementada**. Ver
  [PRUEBA_SPRINT_2.md](PRUEBA_SPRINT_2.md) §9.1.
- Un scan cuyo callback nunca llega se queda en `queued` o `running` y bloquea las
  programaciones posteriores de ese dominio. Ver §9.2.
- No colocar secretos reales en este archivo ni en `.env.example`.
- Para reiniciar únicamente los usuarios demo, ejecutar de nuevo `pnpm seed:demo`;
  no borra dominios ni resultados de scans.
