# Prueba de Sprint 2 — VulDetected

> **Estado del documento:** verificación cerrada el 18 de noviembre de 2026.
> **Fuente de alcance:** la especificación oficial del Sprint 2 —«Operación
> continua, reportes y monetización»—, siete historias y 50 story points sobre
> SCRUM-19, SCRUM-25, SCRUM-26, SCRUM-27, SCRUM-28, SCRUM-29 y SCRUM-30.
> **Fuente de evidencia:** las pruebas nombradas por criterio, las capturas de
> `docs/capturas/sprint-2/`, el video `docs/demo/sprint2-demo.webm` y las
> mediciones registradas en este documento.
>
> Este documento no convierte una prueba unitaria en evidencia de navegador ni
> una compilación en evidencia de tiempo de ejecución. Cuando algo no se pudo
> verificar, lo dice.

## 0. Cómo usar este documento

| Audiencia      | Leer primero        |
| -------------- | ------------------- |
| Equipo y QA    | Secciones 2, 6 y 7. |
| Presentador    | Secciones 3, 4 y 5. |
| Inversionistas | Secciones 1 y 8.    |
| Evaluador      | Secciones 2, 9 y 11. |

### 0.1 Qué significa cada veredicto

Este documento usa exactamente cinco veredictos, y ninguno se usa como sinónimo
de otro (ADR 0026):

| Veredicto                    | Significa                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Listo**                    | Hay una prueba con el identificador del criterio en el nombre que pasa, **y** el comportamiento se reprodujo a mano en la aplicación en ejecución. |
| **Listo con observaciones**  | Se cumple, pero con una salvedad que el lector debe conocer antes de firmar. La salvedad está escrita.                          |
| **Cumple en modo simulado**  | El criterio se cumple de extremo a extremo, pero contra un proveedor simulado (identidad o pagos). La lógica de negocio es real; el tercero no. |
| **Parcial**                  | No se cumple todavía. Se dice qué falta, con qué plan y con qué estimación.                                                      |
| **No listo**                 | No se empezó o no funciona.                                                                                                      |

### 0.2 Qué es demostración y qué no

El Sprint 2 tiene cuatro piezas que se demuestran con un sustituto deliberado.
Se etiquetan así en la pantalla, en el acta y en este manual:

| Pieza                             | Sustituto                                                       | Por qué                                                                                    |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Inicio de sesión social (HU-02a)  | Proveedor OAuth 2.0 local que imita a Google y GitHub           | No hay credenciales reales de Google ni de GitHub en el equipo (ADR 0016, ADR 0017).        |
| Suscripciones (HU-02b)            | Pasarela de pago simulada detrás de la interfaz `PaymentProvider` | No se puede cobrar de verdad en una demo académica ni publicar credenciales (ADR 0019).     |
| Escaneo autenticado (HU-04)       | Fixture local con una ruta `/private` protegida por login        | Una intranet real exigiría desactivar el guard SSRF (ADR 0020).                            |
| Historial comparativo (HU-10)     | Seis meses de historial marcado `is_demo`                        | Un tablero con dos puntos no demuestra nada (ADR 0021).                                    |

Ninguna de esas cuatro piezas se presenta como si fuera el sistema real. La
pantalla lo dice, el dato lo dice y este documento lo dice.

### 0.3 Recorrido rápido para la demo

Para mostrar el Sprint 2 en cinco minutos, sin leer el resto:

1. Levanta la pila completa con `pnpm dev:all` (§3.2).
2. Deja los datos en el punto de partida: `pnpm demo:reset`, `pnpm
   demo:seed-history`, `pnpm demo:reset-billing`, `pnpm demo:reset-social`.
3. Abre <http://localhost:3000/login> y entra con
   `demo.pro@vuldetected.local` / `VulDetected-Demo-2026!`.
4. Sigue los pasos 1 a 8 de §5. Cada paso dura entre 3 y 40 segundos.
5. Si algo falla en vivo, cada paso tiene su **Plan B** escrito en §5.1–§5.8.

## 1. Resumen del Sprint 2

- **Objetivo:** que el producto deje de ser una herramienta que se usa una vez y
  pase a ser un servicio que se opera solo, se reporta y se cobra.
- **Alcance:** siete historias, 50 SP. Operación continua (cancelación,
  programación, alertas), reportes (PDF ejecutivo, historial comparativo),
  monetización (suscripciones) y las dos capacidades que las hacen usables
  (inicio de sesión social y escaneo detrás de un login).
- **Estado verificado:** las siete historias se ejecutaron contra PostgreSQL
  real, Redis real, el worker Celery real y un navegador real. Dos de ellas
  —suscripciones e inicio de sesión social— se verifican contra un proveedor
  simulado y se reportan como **Cumple en modo simulado**.

### 1.1 Demostrable hoy

Comandos ejecutados en esta verificación, con su resultado:

- `pnpm typecheck`: **PASS**, 3/3 paquetes.
- `pnpm lint`: **PASS**.
- `pnpm build`: **PASS**, la aplicación compila para producción (y aun así se
  niega a arrancar en producción con `DEMO_MODE=true`, que es lo correcto).
- `pnpm test`: **PASS**, 44 archivos y 437 pruebas.
- `pnpm test:e2e`: **PASS**, 2 archivos y 15 pruebas (vitest sobre PGlite).
- `pytest -q` en `services/scanner`: **PASS**, 95 pruebas.
- `pnpm test:browser`: **PASS**, 10 archivos de especificación Playwright y 24
  pruebas de navegador contra la aplicación en ejecución.
- Escaneo real contra el fixture: 33 hallazgos en la pasada pública y 40 en la
  autenticada, 7 de ellos en la página detrás del login.
- Cancelación de un escaneo en curso: el worker se detuvo en 2.654 ms y los 7
  hallazgos ya encontrados se conservaron.
- Alerta de vulnerabilidad nueva: 5.535 ms desde que el escaneo cerró hasta que
  el correo estuvo disponible.
- Informe ejecutivo: PDF válido de 2.457 bytes, descargado por el dueño del
  escaneo.

### 1.2 Lo que este sprint no incluye

- Cobro real: no hay pasarela conectada. La interfaz `PaymentProvider` existe
  para que conectarla sea una integración y no una reescritura.
- Credenciales reales de Google y GitHub: el proveedor simulado imita su forma
  exacta, pero no son ellos.
- Intranet real: se demuestra con un fixture local por decisión de seguridad
  (ADR 0020).
- Precios definitivos: el plan Pro muestra `[COMPLETAR: precios definitivos]`
  porque el equipo no los ha fijado.

### 1.3 Límites conocidos

Están enumerados, con impacto y plan, en §9. Los tres que un lector debe saber
antes de cualquier otra cosa:

1. La barrera de correo verificado para auditoría activa, escaneos programados y
   exportaciones está **documentada** en el ADR 0014 y **no implementada** en el
   Sprint 2.
2. Un escaneo cuyo callback nunca llega se queda en `queued` o `running` para
   siempre y, por el guard de solapamiento, bloquea las ejecuciones programadas
   posteriores de ese dominio.
3. Ningún usuario se puede borrar: el trigger de solo-append sobre `audit_logs`
   es de nivel sentencia y se dispara con el `SET NULL` de la clave foránea
   aunque no afecte ninguna fila.

## 2. Veredicto de verificación

### 2.1 Historias

| HU                                     | Jira     | Veredicto                  | Evidencia                                                                                                                                        |
| -------------------------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| HU-02a · Inicio de sesión social       | SCRUM-28 | **Cumple en modo simulado** | `e2e/sprint2-hu02a.spec.ts` 7/7 y `lib/auth/social.test.ts` 14/14 contra el proveedor OAuth local. Google y GitHub reales no se probaron.        |
| HU-02b · Gestión de suscripción        | SCRUM-29 | **Cumple en modo simulado** | `e2e/sprint2-hu02b.spec.ts` 4/4, `lib/payments/apply.test.ts` 12/12 y `simulator.test.ts` 25/25. Webhook firmado verificado por HTTP real.        |
| HU-04 · Escaneo autenticado            | SCRUM-30 | **Listo con observaciones** | `e2e/sprint2-hu04.spec.ts` 2/2: 33 hallazgos anónimos frente a 40 autenticados, 7 detrás del login. La observación es el fixture (ADR 0020).     |
| HU-06 · Cancelación de escaneo         | SCRUM-19 | **Listo**                  | `e2e/sprint2-hu06.spec.ts` 1/1 y `features/scans/sprint2-hu06.test.ts` 10/10. Worker detenido en 2.654 ms con 7 hallazgos conservados.          |
| HU-07 · Programación y alertas         | SCRUM-25 | **Listo**                  | `e2e/sprint2-hu07.spec.ts` 1/1, `sprint2-hu07-alert.spec.ts` 1/1, `lib/scheduled-scans.test.ts` 9/9. Cuatro escaneos programados reales.        |
| HU-09 · Informe ejecutivo en PDF       | SCRUM-26 | **Listo**                  | `e2e/sprint2-hu09.spec.ts` 1/1 y `lib/reports/sprint2-hu09.test.ts` 4/4. PDF de 2.457 bytes descargado por el dueño.                            |
| HU-10 · Historial comparativo          | SCRUM-27 | **Listo**                  | `e2e/sprint2-hu10.spec.ts` 1/1 y `lib/history/sprint2-hu10.test.ts` 9/9. 13 instantáneas etiquetadas como demo, sin puntaje compuesto.           |

**Veredicto del Sprint 2:** **Listo para demo, con dos historias en modo
simulado y una observación de alcance en HU-04.** Las siete historias se
ejecutan de extremo a extremo; dos dependen de un proveedor simulado por
decisión registrada, y una se demuestra contra un fixture por no debilitar el
guard SSRF. Ninguna se reporta como lista sin evidencia reproducida.

### 2.2 Criterios de aceptación

Los 21 criterios que la especificación oficial asigna al Sprint 2 (ADR 0015).
La columna «Criterio» es un resumen para poder leer la tabla de corrido: si el
resumen y la especificación difieren, manda la especificación.

| Criterio | HU     | Criterio (resumen)                                                          | Evidencia                                                                                       | Resultado                  |
| -------- | ------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| CA-09    | HU-09  | Exportar el informe ejecutivo de un escaneo en PDF                          | `lib/reports/sprint2-hu09.test.ts` (CA-09), `e2e/sprint2-hu09.spec.ts`                            | **Listo**                  |
| CA-10    | HU-10  | Comparar el histórico de un dominio entre escaneos                          | `lib/history/sprint2-hu10.test.ts` (CA-10), `e2e/sprint2-hu10.spec.ts`                            | **Listo**                  |
| CA-12    | HU-07  | Avisar cuando aparece una vulnerabilidad nueva                              | `lib/findings/newness.test.ts`, `lib/severity/alert-threshold.test.ts`, `lib/mail/notify.test.ts`, `e2e/sprint2-hu07-alert.spec.ts` | **Listo**                  |
| CA-20    | HU-06  | Poder cancelar un escaneo                                                   | `features/scans/sprint2-hu06.test.ts` (CA-20), `e2e/sprint2-hu06.spec.ts`                         | **Listo**                  |
| CA-21    | HU-06  | El worker se detiene al cancelar                                            | `sprint2-hu06.test.ts` (CA-21), medición de 2.654 ms en `e2e/sprint2-hu06.spec.ts`                | **Listo**                  |
| CA-22    | HU-06  | El usuario recibe aviso de la cancelación                                   | `sprint2-hu06.test.ts` (CA-22), correo recibido en Mailpit durante la corrida de navegador         | **Listo**                  |
| CA-23    | HU-07  | Programar escaneos automáticos (diaria o semanal)                           | `lib/scheduled-scans.test.ts` (CA-23), `lib/format/datetime.test.ts` (CA-23), `e2e/sprint2-hu07.spec.ts` | **Listo**                  |
| CA-24    | HU-07  | La programación se ejecuta sola en su ventana                               | `e2e/sprint2-hu07.spec.ts`: cuatro escaneos con `source='schedule'`                              | **Listo**                  |
| CA-25    | HU-04  | Configurar credenciales para escanear páginas tras un login                 | `lib/credentials/secret.test.ts` 14/14, `e2e/sprint2-hu04.spec.ts` (CA-25/26)                     | **Listo con observaciones** |
| CA-26    | HU-04  | El escaneo alcanza las páginas privadas y reporta sus hallazgos             | `e2e/sprint2-hu04.spec.ts`: 7 hallazgos en `/private`, 0 en la pasada anónima                     | **Listo con observaciones** |
| CA-27    | HU-04  | Si el login falla, el escaneo falla y lo dice; no degrada a anónimo         | `e2e/sprint2-hu04.spec.ts` (CA-27), `lib/scans/login-failure.test.ts` 3/3                          | **Listo**                  |
| CA-28    | HU-09  | El informe no afirma lo que no puede sostener y etiqueta los datos demo     | `lib/reports/sprint2-hu09.test.ts` (CA-28)                                                        | **Listo**                  |
| CA-29    | HU-10  | La comparación es honesta: excluye lo no comparable y no inventa un puntaje | `lib/history/sprint2-hu10.test.ts` (CA-10/ADR 0021), `e2e/sprint2-hu10.spec.ts` (CA-10/CA-29)      | **Listo**                  |
| CA-30    | HU-02a | Crear una cuenta e iniciar sesión con Google                                | `lib/auth/social.test.ts` (CA-30), `e2e/sprint2-hu02a.spec.ts` (CA-30) contra el proveedor simulado | **Cumple en modo simulado** |
| CA-31    | HU-02a | Si ya existe una cuenta local con ese correo, vincularla sin duplicar       | `social.test.ts` (CA-31/ADR 0016), `e2e/sprint2-hu02a.spec.ts` (CA-31)                             | **Cumple en modo simulado** |
| CA-32    | HU-02a | Cerrar sesión y volver a entrar con el proveedor                            | `e2e/sprint2-hu02a.spec.ts` (CA-32)                                                               | **Cumple en modo simulado** |
| CA-33    | HU-02a | Una cuenta con contraseña que llega por primera vez debe verificar el correo | `social.test.ts` (CA-31/CA-33/ADR 0016), `e2e/sprint2-hu02a.spec.ts` (CA-33/ADR 0016)             | **Cumple en modo simulado** |
| CA-34    | HU-02b | Contratar un plan y activarlo con un pago aprobado                          | `lib/payments/apply.test.ts`, `e2e/sprint2-hu02b.spec.ts` (CA-34 a CA-37)                          | **Cumple en modo simulado** |
| CA-35    | HU-02b | Un pago rechazado no cambia el plan                                         | `e2e/sprint2-hu02b.spec.ts` (CA-35)                                                               | **Cumple en modo simulado** |
| CA-36    | HU-02b | La suscripción muestra su estado y su periodo                               | `e2e/sprint2-hu02b.spec.ts` (CA-36/CA-37), pantalla `/settings/billing`                            | **Cumple en modo simulado** |
| CA-37    | HU-02b | Cancelar la suscripción                                                     | `e2e/sprint2-hu02b.spec.ts` (CA-36/CA-37)                                                          | **Cumple en modo simulado** |

Los cuatro criterios de GitHub (`CA-30-GH` a `CA-33-GH`) son **propuestas del
equipo**, no criterios oficiales: están en el ADR 0018 y esperan aprobación. Se
prueba `CA-30-GH` (cuenta nueva de GitHub) y no se reporta como criterio del
acta.

### 2.3 Criterios propuestos que no se usan

Los criterios que el repositorio había escrito durante el Sprint 1 y que no
coinciden con la especificación oficial se renombraron a `CA-P01`, `CA-P02`, …
(ADR 0015). Ninguna prueba, ningún commit y ninguna fila de este documento los
cita como si fueran oficiales.

### 2.4 Brechas abiertas

| #   | Brecha                                                                 | Impacto | Plan                                          |
| --- | ---------------------------------------------------------------------- | ------- | --------------------------------------------- |
| 1   | Barrera de correo verificado (ADR 0014) documentada y no implementada   | Medio   | §9.1                                          |
| 2   | Un escaneo sin callback queda colgado y bloquea su dominio              | Alto    | §9.2                                          |
| 3   | Ningún usuario se puede borrar                                          | Bajo    | §9.3                                          |
| 4   | `getClientIp` confía en `X-Forwarded-For` y comparte un cubo `unknown`  | Medio   | §9.4                                          |
| 5   | El login por formulario no soporta CSRF ni flujos de varios pasos       | Bajo    | §9.5                                          |
| 6   | `CREDENTIALS_ENCRYPTION_KEY` es opcional en desarrollo                  | Medio   | §9.6                                          |
| 7   | Los precios de los planes no están fijados                              | Alto (negocio) | §9.7                                   |
| 8   | La demo exige `next dev` y no corre sobre una compilación de producción | Bajo    | §9.8                                          |
| 9   | No hay credenciales reales de Google ni de GitHub                       | Alto (HU-02a) | §9.9                                   |

## 3. Preparación del entorno

### 3.1 Requisitos

- Node.js 22 y pnpm 10.25.
- PostgreSQL 18 en `127.0.0.1:5432` (instalación nativa; ver
  `docs/local-postgres-setup.md`).
- Redis en 6379 y Mailpit en 1025/8025. `pnpm dev:all` usa los binarios locales
  de `%LOCALAPPDATA%\VulDetected\tools\` y cae a Docker si no están.
- Python 3.12 para el worker (`pip install -r services/scanner/requirements.txt`).
- Chromium de Playwright (`pnpm exec playwright install chromium`).

### 3.2 Arranque

```powershell
pnpm install
Copy-Item .env.example apps/web/.env.local   # y completar los valores locales
pnpm dev:all
```

`pnpm dev:all` prueba cada dependencia antes de arrancarla, así que ejecutarlo
dos veces no rompe nada. Arranca, en este orden: PostgreSQL (solo comprueba),
Redis, Mailpit, el fixture, el proveedor OAuth simulado, el worker Celery local,
el planificador, el despachador de correo y, al final, Next.js en primer plano.

**El worker de Docker debe estar detenido.** En modo demo el único worker
soportado es el local: un contenedor tiene su propia red, no alcanza el fixture
del host y no puede devolver el callback a `localhost:3000`. `dev:all` lo avisa.

### 3.3 Variables que importan

| Variable                        | Para qué                                                                    |
| ------------------------------- | --------------------------------------------------------------------------- |
| `DEMO_MODE`                     | Interruptor maestro de todos los aceleradores de demo. Se rechaza en producción. |
| `DEMO_PAYMENT_WEBHOOK_SECRET`   | Firma HMAC del webhook simulado. Mínimo 16 caracteres. Se rechaza en producción por sí sola. |
| `CREDENTIALS_ENCRYPTION_KEY`    | Cifra los secretos de credenciales de escaneo (HU-04).                      |
| `SCANNER_CALLBACK_SECRET`       | Autoriza los callbacks del worker hacia la aplicación.                      |
| `MAIL_DISPATCH_SECRET`          | Autoriza el despachador de correo.                                          |

`apps/web/src/lib/env.ts` se niega a arrancar si `DEMO_MODE`,
`DEMO_ALLOW_PRIVATE_TARGETS`, `DEMO_PAYMENT_WEBHOOK_SECRET` o la desactivación de
la verificación de propiedad aparecen con `NODE_ENV=production`. Hay una prueba
por cada negativa (`lib/env.test.ts`).

### 3.4 Servicios locales

| Servicio                 | URL / puerto                        | Estado en esta verificación          |
| ------------------------ | ----------------------------------- | ------------------------------------ |
| Web                      | `http://localhost:3000`             | En ejecución (`next dev`).           |
| PostgreSQL               | `127.0.0.1:5432`, base `vuldetected` | 16 migraciones aplicadas, 15 tablas. |
| Redis                    | 6379                                | En ejecución (broker, límites, flags). |
| Mailpit                  | `http://localhost:8025`, SMTP 1025  | En ejecución; captura todo el correo. |
| Fixture vulnerable       | `http://127-0-0-1.nip.io:8099`      | En ejecución.                        |
| Proveedor OAuth simulado | `http://127.0.0.1:8100`             | En ejecución; se niega a arrancar sin `DEMO_MODE=true`. |

### 3.5 Credenciales

| Correo                            | Contraseña               | Uso                                            |
| --------------------------------- | ------------------------ | ---------------------------------------------- |
| `demo.free@vuldetected.local`     | `VulDetected-Demo-2026!` | Plan Free; contratar Pro en el paso 7.         |
| `demo.pro@vuldetected.local`      | `VulDetected-Demo-2026!` | Cuenta principal de la demo; dueña del dominio. |
| `demo.business@vuldetected.local` | `VulDetected-Demo-2026!` | Plan Business.                                 |
| `demo.sinverificar@vuldetected.local` | `VulDetected-Demo-2026!` | Cuenta sin correo verificado (CA-33).      |
| `demo@miapp.local`                | `Fixture-Pass-2026!`     | Login del fixture, no de VulDetected.          |

Son deliberadamente conocidas y solo existen en el entorno local creado por
`seed:demo`. No son la contraseña de PostgreSQL y no se usan en producción.

### 3.6 Aceleradores de demo

Todos exigen `DEMO_MODE=true` y todos son idempotentes:

| Comando                     | Qué deja listo                                                     |
| --------------------------- | ------------------------------------------------------------------ |
| `pnpm demo:reset`           | Borra escaneos, hallazgos, programaciones, credenciales, dominios, sesiones y contadores de límite. No borra usuarios. |
| `pnpm demo:seed-history`    | Seis meses de historial `is_demo` para el dominio de la demo.       |
| `pnpm demo:reset-billing`   | Devuelve cada cuenta demo a su plan sembrado y borra sus checkouts. |
| `pnpm demo:reset-social`    | Borra las identidades simuladas, sus vínculos y sus sesiones.       |
| `pnpm demo:run-schedule-now`| Ejecuta ya la próxima programación de un dominio, sin esperar la ventana. |

### 3.7 Por qué la demo corre en `next dev` y no en producción

`DEMO_MODE` se rechaza en producción a propósito: es lo que impide que los
aceleradores, el fixture y la pasarela simulada lleguen a un despliegue real. La
consecuencia práctica es que la demo corre sobre `next dev`, que compila cada
ruta la primera vez que se visita. Esas compilaciones cuestan entre 5 y 28
segundos por ruta y no forman parte del producto.

Por eso el guion de demo **calienta las rutas antes del paso 1** (§5.0). Los
tiempos de §5 y §7.3 son tiempos en caliente, que es lo que ve el público cuando
el presentador ensaya una vez antes de grabar. Un servidor recién arrancado
tardará más la primera vez, y eso también está medido: §7.3 lo dice.

## 4. Mapa de la aplicación

### 4.1 Operación del acta frente a ruta real

La especificación describe operaciones de negocio; el código tiene acciones de
servidor, endpoints y páginas. Esta tabla es el puente (ADR 0025), y toda fila
apunta a algo que existe en el repositorio.

| Operación del acta                    | Ruta o acción real                                                        | Cómo se comprueba                                                        |
| ------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Iniciar sesión con Google o GitHub    | Botón en `/login` → `/api/auth/sign-in/social` → proveedor en `:8100`     | `e2e/sprint2-hu02a.spec.ts`                                              |
| Ver el estado de la suscripción       | `/settings/billing`                                                       | Captura `12-facturacion-demo.png`                                        |
| Cambiar de plan                       | Botón «Cambiar a Pro» → `startCheckoutAction` → `/demo/checkout/[id]`     | `e2e/sprint2-hu02b.spec.ts`                                              |
| Pagar                                 | `POST /api/payments/webhook` (firmado, deduplicado)                       | `lib/payments/apply.test.ts`                                             |
| Cancelar la suscripción               | Botón «Cancelar al final del periodo» → `cancelSubscriptionAction`        | `e2e/sprint2-hu02b.spec.ts`                                              |
| Programar un escaneo                  | `/schedules` → `createScheduleAction`                                     | `e2e/sprint2-hu07.spec.ts`                                               |
| Ejecutar la programación              | `POST /api/internal/schedules/run` (lo llama el planificador)             | `lib/scheduled-scans.test.ts`                                            |
| Cancelar un escaneo                   | `/scans/[scanId]` → `cancelScanAction`                                    | `e2e/sprint2-hu06.spec.ts`                                               |
| Recibir alerta de hallazgo nuevo      | `lib/mail/notify.ts` → `mail_outbox` → `POST /api/mail/dispatch`           | `e2e/sprint2-hu07-alert.spec.ts`                                         |
| Descargar el informe ejecutivo        | `/scans/[scanId]` → `GET /api/scans/[scanId]/export/pdf?format=executive` | `e2e/sprint2-hu09.spec.ts`                                               |
| Consultar el historial de un dominio  | `/reports` → `/reports/domains/[domainId]`                                | `e2e/sprint2-hu10.spec.ts`                                               |
| Escanear una página detrás de un login| `/settings` (credencial) → `/scanner` (escaneo)                            | `e2e/sprint2-hu04.spec.ts`                                               |
| Exportar hallazgos                    | `GET /api/scans/[scanId]/export?format=json\|csv`                          | `e2e/sprint2-demo.spec.ts` (paso 8)                                      |

### 4.2 Rutas nuevas del Sprint 2

| Ruta                                | Qué es                                                        |
| ----------------------------------- | ------------------------------------------------------------- |
| `/schedules`                        | Programaciones: crear, pausar, reanudar, eliminar.            |
| `/reports`                          | Informes y acceso al historial por dominio.                   |
| `/reports/domains/[domainId]`       | Historial comparativo de un dominio.                          |
| `/settings/billing`                 | Estado de la suscripción y cambio de plan.                    |
| `/demo/checkout/[checkoutId]`       | Pasarela simulada. Devuelve 404 sin `DEMO_MODE`.              |
| `POST /api/payments/webhook`        | Webhook firmado de la pasarela.                               |
| `POST /api/internal/schedules/run`  | Ejecuta las programaciones vencidas.                          |
| `GET /api/scans/[scanId]/export/pdf?format=executive` | Informe ejecutivo en PDF.                   |

### 4.3 Cómo se reconoce un dato de demostración

- En la base de datos: `scans.is_demo`, `findings.is_demo`.
- En la pantalla: la insignia «Datos de demostración» en el historial y la banda
  dentro del PDF ejecutivo.
- En el correo: el asunto y el cuerpo no afirman nada sobre datos reales.
- En el historial: una fila demo nunca se compara con una fila real; el delta se
  retiene y se explica (`demo_mixed`).

## 5. El recorrido de ocho pasos

El guion completo está automatizado en `e2e/sprint2-demo.spec.ts`. Que esté
automatizado importa por una razón concreta: **si el guion se rompe, la prueba
falla**. Un guion en un documento se desactualiza en silencio; un guion en una
prueba que corre en cada verificación, no.

Cada paso tiene su tabla con seis columnas:

- **Acción** — qué hace el presentador.
- **Qué se ve** — qué aparece en pantalla, sin adornos.
- **Qué decir** — una frase corta para el público.
- **HU-CA** — qué historia y qué criterio se están mostrando.
- **Tiempo** — duración medida en caliente, mediana de tres corridas (§7.3).
- **Plan B** — qué hacer si ese paso falla en vivo.

### 5.0 Calentamiento (no se muestra)

Antes del paso 1, la prueba firma sesión como `demo.pro@` y visita cada ruta que
la demo toca. Eso paga la compilación de `next dev` fuera del cronómetro, y es la
razón por la que los tiempos de §5 son tiempos en caliente.

En una demo en vivo el equivalente es: **abrir la aplicación y recorrer las
pestañas una vez antes de que entre el público**. Medido en tres corridas
seguidas sobre el mismo servidor: 59, 105 y 130 segundos. Sube porque `next dev`
acumula estado; si la tercera corrida tarda el doble que la primera, reiniciar el
servidor antes de presentar es la decisión correcta.

### 5.1 Paso 1 — El panel: el riesgo de un vistazo

| Columna     | Contenido                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Acción**  | Entrar con `demo.pro@vuldetected.local` / `VulDetected-Demo-2026!` y quedarse en el panel.                                  |
| **Qué se ve** | El panel con «Riesgo actual», el semáforo y el resumen de hallazgos por severidad del dominio de la demo.                  |
| **Qué decir** | «Esto no es un escaneo suelto: es el estado de seguridad de un dominio, siempre a la vista.»                              |
| **HU-CA**   | Punto de partida. No demuestra un criterio por sí solo; sitúa al público.                                                   |
| **Tiempo**  | **4,4 s**                                                                                                                     |
| **Plan B**  | Si el panel aparece vacío, correr `pnpm demo:reset` y `pnpm demo:seed-history`, recargar. El historial sembrado vuelve en segundos. |

### 5.2 Paso 2 — Cancelar un escaneo sin perder lo hallado (HU-06)

| Columna     | Contenido                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acción**  | Poner el fixture en lento (`/__demo/slow/on`), lanzar un escaneo, esperar a que termine al menos una comprobación y pulsar **Cancelar escaneo**.                      |
| **Qué se ve** | El escaneo pasa a «Cancelado» con la insignia «Resultados parciales», conserva los hallazgos ya encontrados y aparece un correo «Escaneo cancelado» en Mailpit.        |
| **Qué decir** | «Cancelar no es tirar el trabajo: lo que ya se encontró se queda, marcado como parcial, y el usuario recibe aviso.»                                                  |
| **HU-CA**   | HU-06 · CA-20 (cancelar), CA-21 (el worker se detiene), CA-22 (aviso al usuario).                                                                                    |
| **Tiempo**  | **52,0 s**                                                                                                                                                               |
| **Plan B**  | Si la insignia «Resultados parciales» no aparece de inmediato, recargar: el worker publica la cancelación antes del callback terminal. Si el correo no llega, mostrarlo en `http://localhost:8025`. |

### 5.3 Paso 3 — Programación automática y alerta de hallazgo nuevo (HU-07)

| Columna     | Contenido                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acción**  | Lanzar un escaneo de referencia sin SQL injection, crear una programación semanal en `/schedules`, activar la SQL injection en el fixture y ejecutar la programación con `pnpm demo:run-schedule-now`. |
| **Qué se ve** | La programación con su «Próxima ejecución» en hora local, el escaneo programado completado con `source='schedule'` y un correo «Hallazgo crítico en …» en Mailpit.            |
| **Qué decir** | «El producto no espera a que alguien lo abra: escanea solo, compara contra la vez anterior y avisa solo cuando hay algo nuevo.»                                                |
| **HU-CA**   | HU-07 · CA-12 (aviso de vulnerabilidad nueva), CA-23 (programar diaria o semanal), CA-24 (se ejecuta sola en su ventana).                                                       |
| **Tiempo**  | **60,6 s**                                                                                                                                                                        |
| **Plan B**  | Si la programación no dispara, correr `pnpm demo:run-schedule-now --domain 127-0-0-1.nip.io` a mano. Si el correo no llega, la alerta se puede mostrar en `/scans/[id]` y en Mailpit. |

### 5.4 Paso 4 — Informe ejecutivo descargable (HU-09)

| Columna     | Contenido                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acción**  | Ir a `/reports`, abrir el escaneo programado y pulsar **Exportar PDF (Ejecutivo)**.                                                            |
| **Qué se ve** | Se descarga `sprint2-informe-ejecutivo.pdf`: A4 paginado, semáforo, desglose por severidad, hallazgos ordenados y remediación solo para los que exigen acción. |
| **Qué decir** | «Esto es lo que se le entrega a un gerente que no va a leer un panel: una hoja con el veredicto y qué hacer primero.»                          |
| **HU-CA**   | HU-09 · CA-09 (exportar el informe ejecutivo en PDF), CA-28 (no afirma lo que no puede sostener y etiqueta los datos demo).                    |
| **Tiempo**  | **23,4 s**                                                                                                                                        |
| **Plan B**  | El PDF de la última corrida está versionado en `docs/demo/sprint2-informe-ejecutivo.pdf`; abrirlo directamente y decir que es el mismo documento. |

### 5.5 Paso 5 — Historial comparativo entre escaneos (HU-10)

| Columna     | Contenido                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acción**  | En `/reports`, pulsar el nombre del dominio para abrir `/reports/domains/[domainId]`.                                                                            |
| **Qué se ve** | Trece instantáneas quincenales con conteo por severidad, el delta contra la anterior y una nota explícita de que **no hay una nota compuesta**.                  |
| **Qué decir** | «Seis meses de evolución, y una decisión de diseño: no inventamos un número único de "seguridad". Mostramos los conteos y el cambio, que es lo que se puede sostener.» |
| **HU-CA**   | HU-10 · CA-10 (comparar el histórico de un dominio), CA-29 (la comparación es honesta: excluye lo no comparable y no inventa un puntaje).                        |
| **Tiempo**  | **16,5 s**                                                                                                                                                          |
| **Plan B**  | Si el historial está vacío, `pnpm demo:seed-history` y recargar. Los datos sembrados están marcados `is_demo` y la pantalla lo dice.                            |

### 5.6 Paso 6 — Acceso con Google, proveedor simulado (HU-02a)

| Columna     | Contenido                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Acción**  | Cerrar sesión, ir a `/login`, pulsar **Continuar con Google** y elegir la identidad «nueva-verificada».                                                 |
| **Qué se ve** | La pantalla del proveedor con la banda **«PROVEEDOR DE IDENTIDAD SIMULADO»**, el consentimiento y la vuelta al panel con la sesión iniciada.             |
| **Qué decir** | «El flujo es OAuth 2.0 de verdad —PKCE, código de un solo uso, callback—; lo único simulado es quién emite la identidad, porque no tenemos credenciales de Google en el equipo.» |
| **HU-CA**   | HU-02a · CA-30 (crear cuenta e iniciar sesión), CA-31 (vincular a una cuenta local sin duplicar), CA-32 (cerrar sesión y volver a entrar), CA-33 (cuenta con contraseña debe verificar el correo). |
| **Tiempo**  | **73,0 s**                                                                                                                                                 |
| **Plan B**  | Si el proveedor simulado no responde, `pnpm dev:all` lo arranca en `:8100` y se niega a arrancar sin `DEMO_MODE=true`. La captura `10-proveedor-simulado.png` muestra la banda. |

### 5.7 Paso 7 — Suscripción con pago simulado (HU-02b)

| Columna     | Contenido                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acción**  | Entrar como `demo.free@`, abrir `/settings/billing`, pulsar **Cambiar a Pro**, elegir la tarjeta aprobada y pagar.                                                     |
| **Qué se ve** | La banda «Modo demostración: no se realiza ningún cobro», la pasarela simulada, «Aplicado: el estado de la suscripción cambió» y el plan ya en **Pro**.                |
| **Qué decir** | «El cobro es simulado; el contrato no. Checkout, webhook firmado con HMAC, deduplicación por id de evento y solo entonces cambia el plan. Cambiar el simulador por Stripe es una integración, no una reescritura.» |
| **HU-CA**   | HU-02b · CA-34 (contratar y activar con pago aprobado), CA-35 (un pago rechazado no cambia el plan), CA-36 (estado y periodo), CA-37 (cancelar).                     |
| **Tiempo**  | **53,2 s**                                                                                                                                                                |
| **Plan B**  | Si el plan no cambia, `pnpm demo:reset-billing` devuelve cada cuenta a su plan sembrado y se repite. La tarjeta rechazada (`4000 0000 0000 0002`) demuestra CA-35 en el mismo minuto. |

### 5.8 Paso 8 — Escanear detrás de un login (HU-04)

| Columna     | Contenido                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acción**  | Como `demo.pro@`, guardar en `/settings` una credencial de formulario para el fixture, lanzar un escaneo y abrir el detalle.                                     |
| **Qué se ve** | La insignia «Escaneo autenticado», el contador de hallazgos más alto que en la pasada anónima y hallazgos con `endpoint` que contiene `/private`.               |
| **Qué decir** | «La página que solo se ve con sesión también se escanea. El guard SSRF sigue activo: no abrimos la red del servidor, autenticamos el escaneo contra un objetivo autorizado.» |
| **HU-CA**   | HU-04 · CA-25 (configurar credenciales), CA-26 (alcanza las páginas privadas y reporta sus hallazgos), CA-27 (si el login falla, el escaneo falla y lo dice).     |
| **Tiempo**  | **101,9 s**                                                                                                                                                         |
| **Plan B**  | Si el escaneo sale anónimo, revisar que la credencial esté guardada y que el fixture tenga la ruta `/private` activa. Si el login falla, la pantalla muestra el motivo traducido: es CA-27 funcionando, no un error de la demo. |

### 5.9 Qué hacer si algo falla en vivo

1. **No improvisar una explicación.** Cada paso tiene su Plan B escrito arriba;
   usarlo y seguir.
2. **Las capturas están versionadas** en `docs/capturas/sprint-2/`. Si una
   pantalla no carga, la captura es la evidencia y el video muestra el flujo
   completo.
3. **Si el servidor se degradó**, reiniciarlo y volver a calentar (§5.0). El
   servidor de desarrollo acumula memoria y responde lento tras veinte minutos de
   uso intenso; es una propiedad de `next dev`, no del producto.
4. **Nunca decir que algo funciona sin mostrarlo.** Si un paso no se puede
   mostrar, se dice «este paso no lo puedo mostrar ahora» y se pasa al siguiente.

## 6. Verificación criterio por criterio

Cada bloque dice qué se comprobó, con qué, y qué matiz tiene. «Se reproduce con»
es el comando exacto: si un lector corre ese comando y no obtiene el resultado,
este documento está mal.

### CA-09 · Exportar el informe ejecutivo de un escaneo en PDF

- **Qué se comprobó:** que el dueño de un escaneo descarga un PDF real (no un
  HTML con extensión `.pdf`), con el veredicto, los números y los hallazgos, y
  que el documento en inglés sale en inglés.
- **Se reproduce con:** `pnpm test -- lib/reports/sprint2-hu09.test.ts` y
  `pnpm test:browser -- e2e/sprint2-hu09.spec.ts`.
- **Resultado:** **Listo**. PDF de 2.457 bytes descargado con la sesión del
  dueño; la prueba verifica la firma `%PDF-` del archivo.
- **Matiz:** un escaneo parcial no recibe veredicto de riesgo (CA-28), así que
  el documento de un escaneo parcial es deliberadamente distinto.

### CA-10 · Comparar el histórico de un dominio entre escaneos

- **Qué se comprobó:** que la pantalla de historial muestra una instantánea por
  escaneo con su conteo por severidad, y que **no existe un puntaje compuesto**.
- **Se reproduce con:** `pnpm test -- lib/history/sprint2-hu10.test.ts` y
  `pnpm test:browser -- e2e/sprint2-hu10.spec.ts`.
- **Resultado:** **Listo**. 13 instantáneas, todas marcadas como demo.
- **Matiz:** un dominio ajeno devuelve 404; la prueba lo verifica con un
  identificador de otro usuario.

### CA-12 · Avisar cuando aparece una vulnerabilidad nueva

- **Qué se comprobó:** que el aviso sale solo cuando el hallazgo es **nuevo** y
  su severidad alcanza el umbral (por defecto `critical`), y que un hallazgo
  repetido no vuelve a avisar.
- **Se reproduce con:** `pnpm test -- lib/findings/newness.test.ts
  lib/severity/alert-threshold.test.ts lib/mail/notify.test.ts` y
  `pnpm test:browser -- e2e/sprint2-hu07-alert.spec.ts`.
- **Resultado:** **Listo**. Medido: **5.535 ms** desde que el escaneo cerró hasta
  que el correo estuvo disponible (§7.2).
- **Matiz:** el escaneo manual siempre avisa; una programación puede desactivar
  el aviso con `alert_on_new_critical`.

### CA-20 · Poder cancelar un escaneo

- **Qué se comprobó:** que se cancela un escaneo en cola y uno en ejecución, que
  un escaneo ya terminal se rechaza, y que una sesión ausente se rechaza antes de
  cualquier escritura.
- **Se reproduce con:** `pnpm test -- features/scans/sprint2-hu06.test.ts` y
  `pnpm test:browser -- e2e/sprint2-hu06.spec.ts`.
- **Resultado:** **Listo**. Diez pruebas, una por caso límite.

### CA-21 · El worker se detiene al cancelar

- **Qué se comprobó:** que el worker consulta la bandera de cancelación entre
  comprobaciones y se detiene, y que una caída de Redis no convierte una
  cancelación ya confirmada en un error para el usuario.
- **Se reproduce con:** la misma prueba que CA-20, más la medición de §7.1.
- **Resultado:** **Listo**. Detención medida en **2.654 ms** frente a un
  presupuesto de 10.000 ms.
- **Matiz:** la bandera se publica en Redis; sin Redis la cancelación no llega al
  worker en vuelo, y eso está documentado como dependencia, no oculto.

### CA-22 · El usuario recibe aviso de la cancelación

- **Qué se comprobó:** que el correo se encola **una sola vez** para ese escaneo,
  que un fallo de correo no deshace la cancelación, y que el texto dice que los
  resultados se conservan y se marcan como parciales.
- **Se reproduce con:** la misma prueba que CA-20 y el correo recibido en Mailpit
  durante `e2e/sprint2-demo.spec.ts` (paso 2).
- **Resultado:** **Listo**.

### CA-23 · Programar escaneos automáticos (diaria o semanal)

- **Qué se comprobó:** que se crea una cadencia diaria o semanal, que la hora se
  guarda como instante y se muestra en `America/Bogota`, y que reanudar conserva
  la cadencia semanal.
- **Se reproduce con:** `pnpm test -- lib/scheduled-scans.test.ts
  lib/format/datetime.test.ts`.
- **Resultado:** **Listo**.
- **Matiz:** solo dominios verificados pueden programar; el índice único permite
  una programación por dominio.

### CA-24 · La programación se ejecuta sola en su ventana

- **Qué se comprobó:** que el planificador real reclama las ejecuciones vencidas y
  que el escaneo resultante queda con `source='schedule'`.
- **Se reproduce con:** `pnpm test:browser -- e2e/sprint2-hu07.spec.ts`.
- **Resultado:** **Listo**. Cuatro escaneos programados reales completados, 33
  hallazgos cada uno.
- **Matiz:** el reclamo es compare-and-set sobre `next_run_at`; dos instancias del
  planificador no ejecutan dos veces el mismo vencimiento.

### CA-25 · Configurar credenciales para escanear páginas tras un login

- **Qué se comprobó:** que se guarda una credencial de formulario (ruta, campos,
  marcador de éxito), que el secreto se cifra en reposo y que la validación
  rechaza rutas no relativas a la raíz y saltos de línea en los nombres de campo.
- **Se reproduce con:** `pnpm test -- lib/credentials/secret.test.ts
  features/credentials/actions.test.ts`.
- **Resultado:** **Listo con observaciones**. La observación es de alcance, no de
  función: el login por formulario no soporta CSRF ni flujos de varios pasos
  (§9.5).

### CA-26 · El escaneo alcanza las páginas privadas y reporta sus hallazgos

- **Qué se comprobó:** que la pasada autenticada encuentra hallazgos en la página
  detrás del login, y que la pasada anónima no los ve.
- **Se reproduce con:** `pnpm test:browser -- e2e/sprint2-hu04.spec.ts`.
- **Resultado:** **Listo con observaciones**. Medido: **33 hallazgos** en la
  pasada anónima frente a **40** en la autenticada, **7 de ellos en `/private`**.
- **Matiz:** el objetivo es un fixture local por decisión de seguridad (ADR 0020):
  una intranet real exigiría desactivar el guard SSRF, y el guard no se desactiva.

### CA-27 · Si el login falla, el escaneo falla y lo dice; no degrada a anónimo

- **Qué se comprobó:** que una contraseña incorrecta hace fallar el escaneo con
  un motivo (`login_failed: <motivo>`), que la pantalla lo traduce y que **no**
  hay insignia de «Escaneo autenticado».
- **Se reproduce con:** `pnpm test:browser -- e2e/sprint2-hu04.spec.ts` (segundo
  caso) y `pnpm test -- lib/scans/login-failure.test.ts`.
- **Resultado:** **Listo**. La degradación silenciosa a anónimo sería un fallo de
  seguridad: un usuario creería que escaneó su intranet cuando escaneó la portada.

### CA-28 · El informe no afirma lo que no puede sostener y etiqueta los datos demo

- **Qué se comprobó:** que un escaneo parcial no imprime veredicto de riesgo y
  dice por qué, y que un escaneo con datos demo lleva la banda de aviso **dentro
  del documento**, no solo en la aplicación.
- **Se reproduce con:** `pnpm test -- lib/reports/sprint2-hu09.test.ts`.
- **Resultado:** **Listo**.
- **Matiz:** el aviso va dentro del PDF porque un PDF circula fuera de la
  aplicación y la etiqueta de la pantalla no lo acompaña.

### CA-29 · La comparación es honesta: excluye lo no comparable y no inventa un puntaje

- **Qué se comprobó:** que la comparabilidad es un módulo puro, que excluye los
  escaneos no completados y los parciales, y que retiene el delta —explicando el
  motivo— cuando cambió el modo de escaneo, cambió el catálogo de severidad, es la
  primera instantánea o se mezclan datos demo con reales.
- **Se reproduce con:** `pnpm test -- lib/history/sprint2-hu10.test.ts` y
  `pnpm test:browser -- e2e/sprint2-hu10.spec.ts`.
- **Resultado:** **Listo**. No hay puntaje compuesto por construcción: el tipo de
  retorno no tiene un campo donde ponerlo.

### CA-30 · Crear una cuenta e iniciar sesión con Google

- **Qué se comprobó:** que una identidad nueva crea la cuenta, que si el proveedor
  afirma el correo como verificado la cuenta nace verificada y **no** recibe
  correo de verificación, y que si no lo afirma sí lo recibe.
- **Se reproduce con:** `pnpm test -- lib/auth/social.test.ts` y
  `pnpm test:browser -- e2e/sprint2-hu02a.spec.ts`.
- **Resultado:** **Cumple en modo simulado**. Siete de siete pruebas contra el
  proveedor OAuth local.
- **Matiz:** no hay credenciales reales de Google. La lectura literal de CA-30
  está en el ADR 0017, que **espera aprobación del equipo**.

### CA-31 · Si ya existe una cuenta local con ese correo, vincularla sin duplicar

- **Qué se comprobó:** que la identidad del proveedor se vincula a la cuenta
  local existente, que no se crea un duplicado y que el evento queda en auditoría.
- **Se reproduce con:** las mismas pruebas que CA-30.
- **Resultado:** **Cumple en modo simulado**.
- **Matiz:** la política es explícita en `lib/auth/social.ts`
  (`ACCOUNT_LINKING_POLICY`) y una prueba la fija. Vincular por coincidencia de
  correo sin más sería una toma de cuenta; el ADR 0016 explica por qué.

### CA-32 · Cerrar sesión y volver a entrar con el proveedor

- **Qué se comprobó:** que tras cerrar sesión, el segundo ingreso con el mismo
  proveedor es un ingreso normal (sin repetir la creación de cuenta) y que la
  sesión anterior quedó revocada.
- **Se reproduce con:** `pnpm test:browser -- e2e/sprint2-hu02a.spec.ts`.
- **Resultado:** **Cumple en modo simulado**.
- **Matiz:** el cierre de sesión se verifica en dos pasos —`get-session` devuelve
  `null` y un `goto('/dashboard')` aterriza en `/login`— porque el router del
  cliente puede quedarse en la URL anterior tras la redirección.

### CA-33 · Una cuenta con contraseña que llega por primera vez debe verificar el correo

- **Qué se comprobó:** que una cuenta local con contraseña **no** se vincula a una
  identidad social hasta que su buzón está verificado, y que una cuenta que nunca
  verificó no recibe el acceso por esa vía.
- **Se reproduce con:** `pnpm test -- lib/auth/social.test.ts` y
  `pnpm test:browser -- e2e/sprint2-hu02a.spec.ts` (dos casos ADR 0016).
- **Resultado:** **Cumple en modo simulado**.
- **Matiz:** esta barrera es la que evita la toma de cuenta por correo no
  verificado; está implementada para el vínculo social. La barrera equivalente
  para auditoría activa, programaciones y exportaciones (ADR 0014) **no** está
  implementada (§9.1).

### CA-34 · Contratar un plan y activarlo con un pago aprobado

- **Qué se comprobó:** que el checkout crea la intención, que el pago aprobado
  llega como webhook **firmado**, que el evento se deduplica por id y que solo
  entonces cambia el plan; y que un reenvío del mismo evento es un duplicado.
- **Se reproduce con:** `pnpm test -- lib/payments/apply.test.ts
  lib/payments/simulator.test.ts` y `pnpm test:browser -- e2e/sprint2-hu02b.spec.ts`.
- **Resultado:** **Cumple en modo simulado**. El webhook se verificó por HTTP real
  contra `/api/payments/webhook`.
- **Matiz:** el dinero es simulado; el contrato no (ADR 0019). No hay pasarela
  conectada.

### CA-35 · Un pago rechazado no cambia el plan

- **Qué se comprobó:** que un evento `checkout.declined` cambia solo la fila del
  checkout y deja el plan intacto, y que un rechazo que llega **fuera de orden**
  (con marca de tiempo anterior al último evento aplicado) se descarta como
  `stale`.
- **Se reproduce con:** las mismas pruebas que CA-34, más la tarjeta
  `4000 0000 0000 0002` en la pasarela simulada.
- **Resultado:** **Cumple en modo simulado**.

### CA-36 · La suscripción muestra su estado y su periodo

- **Qué se comprobó:** que `/settings/billing` muestra plan, estado y periodo, con
  la banda «Modo demostración: no se realiza ningún cobro».
- **Se reproduce con:** `pnpm test:browser -- e2e/sprint2-hu02b.spec.ts` y la
  captura `12-facturacion-demo.png`.
- **Resultado:** **Cumple en modo simulado**.
- **Matiz:** el precio del plan Pro muestra `[COMPLETAR: precios definitivos]`
  porque el equipo no los fijó (§9.7).

### CA-37 · Cancelar la suscripción

- **Qué se comprobó:** que cancelar programa el fin al término del periodo
  (`cancelAtPeriodEnd`), que un `checkout.paid` posterior lo revierte, y que el
  evento queda en auditoría.
- **Se reproduce con:** `pnpm test:browser -- e2e/sprint2-hu02b.spec.ts` y
  `pnpm test -- lib/payments/apply.test.ts`.
- **Resultado:** **Cumple en modo simulado**.

## 7. Mediciones

Toda cifra de esta sección se midió en la aplicación en ejecución, no se estimó.
El método va junto al número: una medición sin método no es evidencia, es una
afirmación.

### 7.1 Cancelación: cuánto tarda el worker en detenerse

| Qué se midió            | Valor      | Presupuesto |
| ----------------------- | ---------- | ----------- |
| Detención del worker    | **2.654 ms** | 10.000 ms |
| Hallazgos conservados   | **7**      | —           |

**Cómo se midió:** se puso el fixture en modo lento (1.200 ms por respuesta), se
lanzó un escaneo, se esperó a que terminara al menos una comprobación y se pulsó
**Cancelar escaneo**. La marca de tiempo de la cancelación y la del último evento
del worker dan la diferencia.

**Qué significa:** cancelar no es instantáneo —el worker termina la comprobación en
curso y luego se detiene— y no es destructivo. El presupuesto de 10 segundos existe
porque un usuario que cancela y ve la pantalla congelada durante medio minuto deja
de confiar en el botón.

**Qué no significa:** no mide la cancelación de un escaneo **en cola**, que es
inmediata, ni la de un escaneo que ya terminó, que se rechaza.

### 7.2 Alerta de vulnerabilidad nueva: cuánto tarda el aviso

| Qué se midió                            | Valor      | Presupuesto |
| --------------------------------------- | ---------- | ----------- |
| Cierre del escaneo → correo disponible  | **5.535 ms** | 60.000 ms |

**Cómo se midió:** se activó la inyección SQL del fixture entre un escaneo de
referencia y el siguiente, se ejecutó la programación real y se consultó la API de
Mailpit hasta que el mensaje «Hallazgo crítico en …» apareció.

**Qué significa:** el aviso es de segundos, no de horas. Un escaneo programado que
encuentra algo nuevo avisa casi de inmediato.

**Qué no significa:** no mide la entrega al buzón del usuario final. Mide la
disponibilidad del correo en el sistema, que es el tramo que el producto controla.
La entrega posterior depende del proveedor de correo.

### 7.3 Tiempos del recorrido de demo

Tres corridas completas desde estado limpio, cada una con su calentamiento. Los
números son **tiempos en caliente**: la compilación de `next dev` se paga antes del
paso 1 (§5.0).

Tres corridas completas desde estado limpio, cada una con su calentamiento. Los
números son **tiempos en caliente**: la compilación de `next dev` se paga antes del
paso 1 (§5.0).

| Paso | Qué se muestra | Corrida 1 | Corrida 2 | Corrida 3 | Mediana |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Panel: el riesgo de un vistazo | 4,0 s | 4,4 s | 8,2 s | **4,4 s** |
| 2 | Escaneo cancelado con resultados parciales | 52,0 s | 40,4 s | 56,5 s | **52,0 s** |
| 3 | Programación y alerta de hallazgo nuevo | 60,6 s | 50,0 s | 74,0 s | **60,6 s** |
| 4 | Informe ejecutivo descargable | 23,4 s | 19,0 s | 53,9 s | **23,4 s** |
| 5 | Historial comparativo | 12,0 s | 19,2 s | 16,5 s | **16,5 s** |
| 6 | Acceso con Google simulado | 36,6 s | 74,0 s | 73,0 s | **73,0 s** |
| 7 | Suscripción con pago simulado | 53,2 s | 47,2 s | 57,9 s | **53,2 s** |
| 8 | Escaneo autenticado detrás del login | 99,9 s | 101,9 s | 231,5 s | **101,9 s** |
| — | **Total del recorrido** | **5,7 min** | **5,9 min** | **9,5 min** | **6,4 min** |
| — | Calentamiento (no se muestra) | 59,1 s | 104,7 s | 130,1 s | 104,7 s |

Las tres corridas pasaron los ocho pasos. Los totales cuadran con la duración que
Playwright reporta para el archivo (5,7 / 5,9 / 9,5 minutos), que es la
comprobación de que la suma de los pasos es el recorrido y no una parte de él.

**La tercera corrida es la más lenta y conviene explicar por qué, porque es la
lección operativa de esta sección.** El paso 8 tardó 231,5 segundos frente a los
100 de las dos primeras. El registro del servidor muestra la causa: las peticiones
de progreso del worker, que en la primera corrida respondían en menos de un
segundo, respondían en **11,7 segundos** al final de la tercera. `next dev`
acumula estado y se degrada. El producto no cambió; el servidor de desarrollo sí.

Dos consecuencias prácticas:

1. **Reiniciar el servidor antes de presentar**, no después de que algo se vea
   lento. Con el servidor recién arrancado y las rutas calientes, el recorrido
   ronda los seis minutos.
2. **La tercera corrida valida la corrección del tiempo de espera del evento.**
   Con el límite anterior de 10 segundos, una respuesta de 11,7 segundos habría
   hecho fallar un escaneo que había autenticado y recogido hallazgos. El límite
   de 30 segundos lo sostuvo.

**La primera corrida, en frío, fue distinta y conviene decirlo:** 4,9 / 47,3 /
64,0 / 17,0 / 13,8 / 26,8 / 66,2 segundos en los pasos 1 a 7, con un calentamiento
de 98,3 segundos y el paso 8 fallando por un tiempo de espera agotado. Ese fallo no
era del producto: el worker esperaba 10 segundos una respuesta que tardó 14, y el
escaneo, que ya había autenticado y recogido hallazgos, se reportó como fallido. Se
corrigió el tiempo de espera del evento a 30 segundos, igual que el del callback.

**Cómo se midió:** `e2e/sprint2-demo.spec.ts` escribe el tiempo de cada paso en
`test-results/sprint2-demo-timings.json` **después de cada paso**, no al final. Un
guion que solo escribe al terminar pierde los números justo cuando algo falla, que
es cuando más se necesitan.

**Qué significa:** el recorrido completo dura alrededor de seis minutos y medio en
caliente, con dos pasos largos —la programación y el escaneo autenticado— que
incluyen esperar a que el worker termine de verdad. Es el rango que un presentador
debe reservar, no el mínimo.

**Qué no significa:** no es el tiempo de una demo narrada. Un presentador habla
mientras los pasos corren, y los pasos largos son justamente donde hay algo que
contar.

### 7.4 Cobertura de pruebas

Cuatro conjuntos, cuatro propósitos distintos. Ninguno reemplaza a otro, y sumarlos
para decir «tenemos N pruebas» sería engañarse: un test unitario y un recorrido de
navegador no cuestan lo mismo ni prueban lo mismo.

| Conjunto | Comando | Alcance | Cantidad |
| --- | --- | --- | --- |
| Unitario y de integración | `pnpm test` | Lógica pura, acciones de servidor, esquema sobre PGlite | 44 archivos · 437 pruebas |
| Integración de rutas | `pnpm test:e2e` | Handlers y flujo HTTP sobre PGlite | 2 archivos · 15 pruebas |
| Navegador real | `pnpm test:browser` | Aplicación en ejecución, PostgreSQL real, Redis real, worker real | 10 archivos · 24 pruebas |
| Worker | `pytest -q` | Comprobaciones, cliente endurecido, login, reporte | 95 pruebas |

De las 24 pruebas de navegador, **19 son del Sprint 2** y 5 son la verificación del
Sprint 1 que se conserva como regresión. El reparto por historia:

| Archivo | Pruebas | Qué cubre |
| --- | --- | --- |
| `e2e/sprint2-hu02a.spec.ts` | 7 | Cuenta nueva, vinculación, sesión repetida, verificación de correo |
| `e2e/sprint2-hu02b.spec.ts` | 4 | Aprobado, rechazado, estado y periodo, cancelación |
| `e2e/sprint2-hu04.spec.ts` | 2 | Escaneo autenticado y login fallido |
| `e2e/sprint2-hu06.spec.ts` | 1 | Cancelación con resultados parciales |
| `e2e/sprint2-hu07.spec.ts` | 1 | Programación que se ejecuta sola |
| `e2e/sprint2-hu07-alert.spec.ts` | 1 | Alerta de hallazgo nuevo con su latencia |
| `e2e/sprint2-hu09.spec.ts` | 1 | PDF ejecutivo descargado y válido |
| `e2e/sprint2-hu10.spec.ts` | 1 | Historial comparativo |
| `e2e/sprint2-demo.spec.ts` | 1 | Los ocho pasos del recorrido completo |

**Qué significa:** cada criterio tiene al menos una prueba que lo nombra por su
identificador en el nombre del test, de modo que `npx playwright test -g CA-26`
selecciona la prueba de ese criterio y no otra.

**Qué no significa:** que la cobertura sea completa. Los conjuntos cubren los
caminos que el producto declara; no hay medición de cobertura por líneas y no se
persigue un porcentaje. Una prueba que existe para subir un número no prueba nada.

### 7.5 Lo que estas mediciones no cubren

- **No hay medición de carga.** Un usuario a la vez, no cien.
- **No hay medición de un proveedor externo real.** Identidad y pagos son
  simulados; la latencia de un tercero real no está medida.
- **No hay medición en producción.** Todo corre en `next dev` sobre una base local.
- **No hay prueba de penetración.** El modelo de amenazas está documentado, no
  auditado por un tercero.



## 8. Material para inversionistas

Esta sección existe porque un manual de verificación no es un pitch. El resto del
documento prueba que el producto funciona; esta parte explica por qué eso vale
algo.

**Regla que se respeta en todo lo que sigue:** ningún número de mercado, de
crecimiento ni de ingreso está inventado. Donde el equipo todavía no tiene el
dato, aparece `[COMPLETAR]`. Un inversionista detecta una cifra inventada en
treinta segundos, y a partir de ahí deja de creer en todo lo demás.

### 8.1 El problema

Casi toda organización pequeña y mediana vive con la misma contradicción: **sabe
que su sitio web es su vitrina principal y no tiene a nadie mirando si está
abierto o con la puerta forzada.**

Los tres síntomas concretos:

1. **El escaneo se hace una vez y se olvida.** Una consultoría entrega un informe
   PDF, se archiva y el sitio cambia al mes siguiente.
2. **Las herramientas que existen hablan para un especialista.** Reportan
   quinientos hallazgos sin decir cuál se arregla primero, y el dueño del negocio
   no sabe leer el reporte.
3. **El aviso llega cuando ya pasó.** La mayoría se entera del problema por un
   cliente, por un proveedor de pagos o por la prensa.

### 8.2 El costo de no verlo

No damos una cifra de pérdida promedio porque no tenemos una fuente propia. Lo que
sí se puede afirmar, y es suficiente para justificar el producto:

- Un sitio comprometido pierde tráfico, posicionamiento y confianza, y la
  recuperación no es inmediata aunque se arregle el fallo.
- Una brecha obliga a notificar y a responder, y esa respuesta tiene costo
  operativo y legal.
- El costo de **prevenir** es una fracción del costo de **explicar** por qué no se
  previno.

`[COMPLETAR: dato de mercado de ciberseguridad para PYMES con fuente y año]`

### 8.3 La solución en una frase

**VulDetected vigila la seguridad de un dominio de forma continua, traduce lo que
encuentra a decisiones y avisa solo cuando hay algo nuevo.**

Lo que eso significa en producto:

- **Continuo:** escanea solo, por programación, sin que nadie lo abra.
- **Traducido:** semáforo de riesgo, conteo por severidad y remediación solo para
  lo que exige acción.
- **Con aviso:** un correo cuando aparece una vulnerabilidad nueva y crítica, no
  un tablero que alguien tiene que recordar mirar.

### 8.4 Cómo funciona, en lenguaje llano

1. El dueño del sitio **prueba que el dominio es suyo** antes de poder escanearlo.
2. El sistema **escanea** el sitio: cabeceras, cookies, XSS, inyección SQL y, si el
   cliente lo autoriza, también las páginas que están detrás de un login.
3. Cada hallazgo recibe una **severidad** y una **explicación de cómo arreglarlo**.
4. Un **panel** muestra el estado; un **PDF ejecutivo** lo entrega a quien decide.
5. El **historial** compara un escaneo contra el anterior, sin inventar un número
   único de "seguridad" que no se podría sostener.
6. Si aparece algo nuevo y grave, **llega un correo**.

### 8.5 Por qué ahora

Tres cambios que hacen viable lo que hace cinco años no lo era:

- **El escaneo dejó de ser caro.** Lo que requería una licencia de gama alta hoy se
  ejecuta en un contenedor que cuesta centavos por corrida.
- **El comprador cambió.** El dueño de una PYME ya contrata SaaS sin intermediario;
  no necesita un integrador para entender un panel.
- **La expectativa cambió.** Un cliente que ve "verificado" en un proveedor de pagos
  espera el mismo tipo de señal en sus proveedores.

### 8.6 Mercado

`[COMPLETAR: tamaño de mercado, segmento objetivo, fuente y año]`

Lo que el equipo sí puede afirmar sin dato externo: el comprador objetivo es una
organización con un sitio propio, sin equipo de seguridad dedicado y con alguien
que responde por el riesgo. Es un comprador que ya existe y ya paga por otros
servicios.

### 8.7 Modelo de negocio

Suscripción por dominio, en tres niveles:

| Plan         | Para quién                                        | Precio                        |
| ------------ | ------------------------------------------------- | ----------------------------- |
| **Free**     | Probar el producto con un dominio                 | Gratis                        |
| **Pro**      | Un negocio que quiere vigilancia continua         | `[COMPLETAR: precio Pro]`     |
| **Business** | Varios dominios, reportes ejecutivos y escaneo autenticado | `[COMPLETAR: precio Business]` |

Los precios **no** están fijados. La pantalla los muestra como
`[COMPLETAR: precios definitivos]` a propósito: es preferible un hueco visible a
un precio inventado que después haya que desdecir.

`[COMPLETAR: planes y precios definitivos]`

### 8.8 Tracción y evidencia

Lo que hay hoy, sin adornos:

- **Producto funcionando de extremo a extremo** en siete historias del Sprint 2
  sobre base de datos real, cola real, worker real y navegador real.
- **Cobertura de pruebas:** 44 archivos y 437 pruebas unitarias e de integración,
  24 pruebas de navegador y 95 pruebas del worker.
- **Mediciones reales:** cancelación detenida en 2,65 segundos con los hallazgos
  conservados; alerta de vulnerabilidad nueva en 5,5 segundos; informe ejecutivo
  de 2.457 bytes descargado con la sesión del dueño.
- **Decisiones de producto documentadas** en 26 registros de arquitectura, dos de
  ellos explícitamente marcados como pendientes de aprobación.

Lo que **no** hay: usuarios reales, ingresos, ni una pasarela de pago conectada.
Decirlo es parte de la credibilidad.

`[COMPLETAR: usuarios, ingresos, cartas de intención, pilotos]`

### 8.9 Ventaja competitiva

No es la tecnología: escanear un sitio no es difícil. La ventaja es **el criterio
con el que se decide qué mostrar**:

- **Honestidad medible.** El producto se niega a inventar un puntaje compuesto y se
  niega a emitir un veredicto sobre un escaneo parcial. Es una decisión de diseño
  verificada por pruebas, no una frase de marketing.
- **Aviso con criterio.** Avisar de todo es lo mismo que no avisar de nada. El
  umbral por defecto es crítico y es configurable por programación.
- **Seguridad del propio producto.** El guard SSRF no se desactiva ni para la demo;
  el escaneo autenticado se demuestra contra un objetivo autorizado, no abriendo la
  red del servidor.

### 8.10 Riesgos y cómo se mitigan

| Riesgo                                             | Mitigación                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Falso positivo que erosiona la confianza           | Severidad calibrada, remediación solo para lo accionable, aviso limitado a lo nuevo y crítico.    |
| Un escaneo colgado bloquea las programaciones       | **Brecha abierta** (§9.2). Tiene plan y está documentada; no se presenta como resuelta.          |
| Dependencia de un tercero de pagos                 | La interfaz `PaymentProvider` aísla la pasarela: cambiarla es una integración, no una reescritura. |
| Que el producto escanee algo que no debe           | Verificación de propiedad del dominio obligatoria y guard SSRF activo.                            |
| Prometer más de lo que se entrega                  | Los veredictos tienen cinco valores y ninguno se usa como sinónimo de otro (ADR 0026).            |

### 8.11 Qué sigue

- **Cerrar la barrera de correo verificado** para auditoría activa, programaciones y
  exportaciones (§9.1). Es la brecha de mayor impacto y la primera del plan.
- **Resolver el escaneo huérfano** con un tiempo máximo de ejecución y una
  reconciliación (§9.2).
- **Conectar una pasarela real** detrás de `PaymentProvider`, cuando existan precios
  y una cuenta de comercio.
- **Credenciales reales de Google y GitHub**, para mover HU-02a de "modo simulado" a
  "listo".

### 8.12 El pedido

`[COMPLETAR: monto, uso de fondos, hitos que desbloquea, plazo]`

### 8.13 Catorce preguntas difíciles, con su respuesta

Un inversionista va a preguntar esto. Conviene tenerlo escrito antes de que lo
pregunte.

**1. "¿No hay cien empresas haciendo esto?"**
Sí, y la mayoría vende a empresas grandes con equipo de seguridad. El segmento que
atendemos no compra herramientas: compra tranquilidad y una decisión clara. La
diferencia no es el escáner, es el criterio con el que se presenta el resultado.

**2. "¿Qué impide que un competidor copie esto en un mes?"**
Nada, y no lo pretendemos. Lo que no se copia rápido es la disciplina: negarse a
inventar un puntaje, negarse a dar veredicto sobre datos parciales, etiquetar cada
dato simulado. Eso se ve en el código y en las pruebas, no en la página de ventas.

**3. "¿Cómo sé que las cifras que me muestran son reales?"**
Porque el documento dice cuáles no lo son. Las dos historias de proveedor externo
están marcadas "Cumple en modo simulado"; los precios están sin fijar; el mercado
está en `[COMPLETAR]`. Un equipo que marca sus propios huecos es más creíble que
uno que no tiene ninguno.

**4. "¿Qué pasa si el escaneo se cuelga?"**
Hoy, el escaneo se queda en cola o en ejecución y bloquea las programaciones
posteriores de ese dominio. Es una brecha abierta, está en §9.2 con plan, y no la
escondemos. Un inversionista que descubre solo una brecha que el equipo conocía y
ocultó deja de confiar en el resto del acta.

**5. "¿Esto es seguro? Van a escanear sitios ajenos."**
No se puede escanear un dominio sin probar que es tuyo, y el guard SSRF impide que
el servidor sea usado para alcanzar la red interna. Ni siquiera la demo lo
desactiva: se demuestra con un objetivo autorizado (ADR 0020).

**6. "¿Por qué el escaneo autenticado usa un fixture y no una intranet real?"**
Porque una intranet real está en una red privada, y alcanzarla exigiría desactivar
el guard SSRF. Elegimos no debilitar la seguridad del producto para hacer una demo
más vistosa.

**7. "¿Cobran de verdad?"**
No. El cobro es simulado y la pantalla lo dice: «Modo demostración: no se realiza
ningún cobro». Lo que sí es real es el contrato: checkout, webhook firmado con HMAC,
deduplicación por id de evento y activación solo por webhook. Cambiar el simulador
por Stripe es una integración.

**8. "¿Cómo evitan que un pago duplicado cobre dos veces?"**
Cada evento tiene un id único y una restricción de unicidad por proveedor. Un
reenvío se inserta como duplicado y no se aplica dos veces. Un evento que llega
fuera de orden se descarta como obsoleto.

**9. "¿Qué pasa si el proveedor de identidad miente sobre el correo?"**
No vinculamos una cuenta local con contraseña a una identidad social hasta que el
buzón esté verificado (ADR 0016). Vincular por coincidencia de correo sin más sería
una toma de cuenta.

**10. "¿Por qué no hay un número de seguridad del 0 al 100?"**
Porque sería inventado. El producto muestra conteos por severidad y el cambio
respecto del escaneo anterior; el tipo de retorno del módulo de comparación no
tiene un campo donde poner un puntaje. Es una decisión de diseño, no una omisión.

**11. "¿Cuánto tarda en avisar?"**
Medido: 5,5 segundos desde que el escaneo cierra hasta que el correo está
disponible, contra un presupuesto de 60 segundos. La medición está en §7.2, con el
método.

**12. "¿Qué pasa mañana si el equipo desaparece?"**
El repositorio tiene 26 registros de arquitectura que explican cada decisión y por
qué se tomó, un manual de verificación reproducible y pruebas que fallan si algo se
rompe. El conocimiento no está solo en la cabeza de tres personas.

**13. "¿Por qué debería creerles que 'Listo' significa listo?"**
Porque el veredicto tiene una definición escrita: hay una prueba con el
identificador del criterio en el nombre que pasa **y** el comportamiento se
reprodujo a mano en la aplicación en ejecución. Si falta cualquiera de las dos, el
veredicto baja.

**14. "¿Cuál es el mayor riesgo del proyecto?"**
Que el producto prometa más de lo que entrega. Por eso el acta tiene cinco
veredictos y ninguno se usa como sinónimo de otro, y por eso este documento dedica
una sección entera a lo que falta.

## 9. Brechas abiertas y su plan

Ninguna de estas brechas está resuelta. Se listan con impacto, causa y plan
concreto, porque una brecha conocida y escrita es una decisión; una brecha
conocida y callada es un pasivo.

### 9.1 La barrera de correo verificado está documentada y no implementada

- **Qué es:** el ADR 0014 decide que una cuenta con el correo sin verificar no
  puede activar auditoría, programar escaneos ni exportar informes.
- **Estado:** la decisión está escrita; el código **no** la aplica.
- **Impacto:** medio. Una cuenta recién creada puede usar funciones que el diseño
  dice que requieren un buzón probado. No es una escalada de privilegios —cada
  usuario solo toca sus propios datos— pero sí una promesa del diseño sin cumplir.
- **Plan:** una guarda reutilizable `requireVerifiedEmail()` en las tres entradas
  (auditoría, programaciones, exportaciones), con su prueba por cada una y un
  mensaje que diga qué falta y cómo verificarlo. Estimación: una sesión de trabajo.

### 9.2 Un escaneo cuyo callback nunca llega queda colgado y bloquea su dominio

- **Qué es:** si el worker muere sin enviar el callback terminal, el escaneo se
  queda en `queued` o `running` para siempre. El guard de solapamiento impide
  lanzar otro escaneo del mismo dominio mientras haya uno activo, así que las
  programaciones posteriores de ese dominio no corren.
- **Impacto:** **alto**. Es la única brecha que puede detener el producto en
  operación continua, que es justamente lo que vende el Sprint 2.
- **Plan:** (a) un tiempo máximo de ejecución por escaneo, con un barrido que marca
  como `failed` lo que exceda el doble del tiempo esperado y lo registra como
  parcial; (b) una reconciliación periódica que compare escaneos activos contra
  tareas vivas en la cola; (c) una prueba que simule el worker muerto y verifique
  que el dominio vuelve a poder escanearse.
- **Nota honesta:** durante esta verificación se vio el síntoma dos veces —un
  `ReadTimeout` del worker contra la aplicación— y se corrigió la causa de esa
  ocurrencia concreta (tiempo de espera del evento subido a 30 segundos). Eso no
  resuelve la brecha: resuelve un caso. La brecha es que no hay red de seguridad.

### 9.3 Ningún usuario se puede borrar

- **Qué es:** `audit_logs` tiene un trigger de solo-append a nivel de sentencia. La
  clave foránea `actor_user_id` es `ON DELETE SET NULL`, así que borrar un usuario
  dispara un `UPDATE` que, aunque no afecte ninguna fila, activa el trigger y aborta
  la operación. El resultado es que **no se puede borrar ningún usuario**, nunca.
- **Impacto:** bajo para el producto, alto para la operación. Impide cumplir una
  solicitud de supresión de datos y obliga a que los aceleradores de demo desactiven
  el trigger dentro de su propia transacción.
- **Plan:** cambiar el trigger a nivel de fila, o excluir explícitamente el `SET
  NULL` de la clave foránea. Requiere una migración y una prueba que verifique que
  la auditoría sigue siendo inmutable a `UPDATE` y `DELETE` de filas reales.

### 9.4 `getClientIp` confía en `X-Forwarded-For` y comparte un cubo `unknown`

- **Qué es:** la función toma la primera dirección de `X-Forwarded-For` sin validar
  que venga de un proxy propio, y cuando no hay cabecera cae a un único cubo
  `unknown` compartido.
- **Impacto:** medio. Detrás de un proxy correctamente configurado funciona; sin
  proxy, un cliente puede falsear la cabecera y esquivar los límites de tasa por IP,
  y todos los clientes sin cabecera comparten un mismo límite.
- **Plan:** una lista de proxies de confianza configurable y, cuando la cabecera no
  sea confiable, usar la dirección del socket. Los límites por usuario ya existen y
  no dependen de esta función.

### 9.5 El login por formulario no soporta CSRF ni flujos de varios pasos

- **Qué es:** la credencial de formulario hace un `POST` con los campos indicados y
  busca un marcador de éxito. No extrae un token CSRF de la página de login ni
  encadena un segundo paso.
- **Impacto:** bajo. Está diseñado así: un objetivo con CSRF falla con
  `marker_missing`, que es un fallo explícito y visible, no una degradación
  silenciosa. Un flujo de varios pasos no se puede configurar.
- **Plan:** un campo opcional de selector de token CSRF y un segundo paso declarativo,
  solo cuando un usuario real lo necesite. Hoy no hay ninguno.

### 9.6 `CREDENTIALS_ENCRYPTION_KEY` es opcional en desarrollo

- **Qué es:** sin esa clave, los secretos de credenciales se guardan sin cifrar en
  desarrollo. En producción `lib/env.ts` la exige.
- **Impacto:** medio en desarrollo, nulo en producción. El riesgo real es que un
  entorno mal etiquetado se trate como desarrollo.
- **Plan:** exigirla también en desarrollo y generarla en el arranque si falta,
  avisando. Un secreto sin cifrar en una base local sigue siendo un secreto sin
  cifrar.

### 9.7 Los precios de los planes no están fijados

- **Qué es:** el plan Pro y el Business muestran `[COMPLETAR: precios definitivos]`.
- **Impacto:** bajo para la verificación, alto para el negocio. Sin precio no hay
  ingreso, y sin ingreso el modelo de negocio es una hipótesis.
- **Plan:** decisión del equipo, no del código. El lugar donde poner el número ya
  existe y es uno solo.

### 9.8 La demo exige `next dev` y no puede correr sobre una compilación de producción

- **Qué es:** `DEMO_MODE` se rechaza con `NODE_ENV=production`, a propósito. Por eso
  la demo corre sobre el servidor de desarrollo, que compila cada ruta la primera
  vez que se visita.
- **Impacto:** bajo para el producto, medio para la demo. Un servidor recién
  arrancado tarda entre 5 y 28 segundos por ruta la primera vez, y por eso el guion
  calienta las rutas antes de empezar (§5.0).
- **Plan:** ninguno, y es deliberado. Debilitar esa negativa para tener una demo más
  rápida sería exactamente el atajo que el producto promete no tomar.

### 9.9 No hay credenciales reales de Google ni de GitHub

- **Qué es:** el inicio de sesión social se verifica contra un proveedor OAuth 2.0
  simulado que corre en el puerto 8100 y se niega a arrancar sin `DEMO_MODE=true`.
  Habla el mismo protocolo —PKCE S256, códigos de un solo uso, los formatos de
  endpoint de Google y de GitHub— pero no es Google.
- **Impacto:** alto para cerrar HU-02a como «Listo». El flujo está probado; el
  proveedor no.
- **Plan:** registrar un proyecto de OAuth en Google Cloud Console y una OAuth App
  en GitHub, poner las cuatro variables en el entorno y repetir
  `e2e/sprint2-hu02a.spec.ts` contra los proveedores reales. El código de negocio no
  cambia: `resolveSocialSetup` ya lee las credenciales reales cuando existen y solo
  prefiere el simulador en modo demo. Decisión registrada en
  [`decisions-pending.md`](./decisions-pending.md) §7.

## 10. Glosario

| Término                    | Significado en este documento                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **ADR**                    | *Architecture Decision Record*. Un archivo corto que registra una decisión, su contexto y sus consecuencias. Hay 26.              |
| **CA**                     | Criterio de aceptación. En este documento siempre se refiere a la numeración oficial del Sprint 2 (ADR 0015).                      |
| **HU**                     | Historia de usuario.                                                                                                               |
| **SP**                     | Story point. Unidad de estimación relativa, no de tiempo.                                                                           |
| **SSRF**                   | *Server-Side Request Forgery*. Un ataque donde se usa el servidor para alcanzar direcciones que el atacante no puede alcanzar.     |
| **CSRF**                   | *Cross-Site Request Forgery*. Un ataque donde se hace que el navegador de la víctima envíe una petición que no pretendía.           |
| **HMAC**                   | Firma criptográfica con clave compartida. Es lo que prueba que un webhook lo envió quien dice enviarlo.                            |
| **PKCE**                   | Extensión de OAuth 2.0 que evita que un código de autorización interceptado sirva a un tercero.                                    |
| **Webhook**                | Petición HTTP que un tercero envía al sistema para notificar un evento. En este sprint, el pago aprobado o rechazado.              |
| **Callback**               | Petición HTTP que el worker envía a la aplicación al terminar (o fallar) un escaneo.                                               |
| **Idempotencia**           | Propiedad de una operación que se puede repetir sin cambiar el resultado. Un webhook duplicado no debe cobrar dos veces.           |
| **Deduplicación**          | Descartar un evento ya procesado, identificándolo por su id único.                                                                  |
| **Compare-and-set**        | Actualizar solo si el valor previo es el esperado. Es lo que impide que dos planificadores ejecuten la misma programación.         |
| **Fixture**                | Sitio vulnerable local que sirve de objetivo controlado para las pruebas y la demo.                                                |
| **Seed**                   | Datos iniciales insertados por un script para que la aplicación tenga algo que mostrar.                                            |
| **`DEMO_MODE`**            | Interruptor maestro de todos los aceleradores de demo. Se rechaza en producción.                                                    |
| **`is_demo`**              | Marca en la base de datos que identifica un dato como de demostración. Viaja hasta la pantalla y hasta el PDF.                      |
| **`partial`**              | Marca en un escaneo cancelado o incompleto. No es un sexto estado: el escaneo conserva su estado y además es parcial.                |
| **`source='schedule'`**    | Indica que un escaneo lo lanzó el planificador y no una persona.                                                                   |
| **Modo simulado**          | El criterio se cumple de extremo a extremo contra un proveedor sustituto. La lógica es real; el tercero no.                        |
| **`[COMPLETAR]`**          | Un dato que el equipo todavía no tiene. Es visible a propósito. Se prefiere un hueco honesto a una cifra inventada.                |

## 11. Anexos

### 11.1 Inventario de capturas

Todas en `docs/capturas/sprint-2/`, tomadas por la prueba de navegador durante la
corrida de la demo.

| Archivo                            | Paso | Qué muestra                                                    |
| ---------------------------------- | ---- | -------------------------------------------------------------- |
| `01-panel.png`                     | 1    | El panel con el riesgo actual y el semáforo.                   |
| `02-cancelacion-parcial.png`       | 2    | Escaneo cancelado con la insignia de resultados parciales.     |
| `03-correo-cancelacion.png`        | 2    | El correo de cancelación en Mailpit.                           |
| `04-programacion.png`              | 3    | La programación creada con su próxima ejecución.               |
| `05-escaneo-programado.png`        | 3    | El escaneo lanzado por el planificador, completado.            |
| `06-alerta-correo.png`             | 3    | El correo de hallazgo crítico nuevo.                           |
| `07-informes.png`                  | 4    | La pantalla de informes.                                       |
| `08-informe-ejecutivo.png`         | 4    | La descarga del informe ejecutivo.                             |
| `09-historial-comparativo.png`     | 5    | El historial completo, a página entera.                        |
| `10-proveedor-simulado.png`        | 6    | La pantalla del proveedor con la banda de «simulado».          |
| `11-sesion-social.png`             | 6    | La sesión iniciada tras el consentimiento.                     |
| `12-facturacion-demo.png`          | 7    | La pantalla de facturación con la banda de modo demostración.  |
| `13-checkout-simulado.png`         | 7    | La pasarela de pago simulada.                                  |
| `14-plan-activado.png`             | 7    | El plan ya en Pro tras el webhook.                             |
| `15-credencial-guardada.png`       | 8    | La credencial de formulario guardada.                          |
| `16-escaneo-autenticado.png`       | 8    | El escaneo con la insignia «Escaneo autenticado».              |

### 11.2 Video de la demo

`docs/demo/sprint2-demo.webm` — la corrida completa de los ocho pasos, grabada por
Playwright. El calentamiento **no** aparece en el video: corre en un contexto de
navegador propio, antes de que exista la página que se graba.

### 11.3 Archivos de prueba del Sprint 2

| Archivo                                                        | Qué cubre                                    |
| -------------------------------------------------------------- | -------------------------------------------- |
| `e2e/sprint2-demo.spec.ts`                                     | El recorrido de ocho pasos y las capturas.   |
| `e2e/sprint2-hu02a.spec.ts`                                    | HU-02a · CA-30 a CA-33 contra el proveedor simulado. |
| `e2e/sprint2-hu02b.spec.ts`                                    | HU-02b · CA-34 a CA-37.                      |
| `e2e/sprint2-hu04.spec.ts`                                     | HU-04 · CA-25 a CA-27.                       |
| `e2e/sprint2-hu06.spec.ts`                                     | HU-06 · CA-20 a CA-22.                       |
| `e2e/sprint2-hu07.spec.ts`                                     | HU-07 · CA-23 y CA-24.                       |
| `e2e/sprint2-hu07-alert.spec.ts`                               | HU-07 · CA-12, con la medición de latencia.  |
| `e2e/sprint2-hu09.spec.ts`                                     | HU-09 · CA-09 y CA-28.                       |
| `e2e/sprint2-hu10.spec.ts`                                     | HU-10 · CA-10 y CA-29.                       |
| `apps/web/src/features/scans/sprint2-hu06.test.ts`             | CA-20 a CA-22, diez casos límite.            |
| `apps/web/src/lib/reports/sprint2-hu09.test.ts`                | CA-09 y CA-28, incluida la paridad de idioma. |
| `apps/web/src/lib/history/sprint2-hu10.test.ts`                | CA-10 y CA-29, la comparabilidad como módulo puro. |
| `apps/web/src/lib/payments/apply.test.ts`                      | Deduplicación, fuera de orden, declinado.    |
| `apps/web/src/lib/payments/simulator.test.ts`                  | Firma HMAC y tarjetas de prueba.             |
| `apps/web/src/lib/auth/social.test.ts`                         | Vinculación social y política explícita.     |
| `apps/web/src/lib/credentials/secret.test.ts`                  | Cifrado y validación de credenciales.        |
| `apps/web/src/lib/scans/login-failure.test.ts`                 | Los motivos de fallo de login.               |
| `apps/web/src/lib/findings/newness.test.ts`                    | Qué cuenta como hallazgo nuevo.              |
| `apps/web/src/lib/severity/alert-threshold.test.ts`            | El umbral de aviso.                          |
| `apps/web/src/lib/scheduled-scans.test.ts`                     | Cadencia, reanudación y reclamo.             |
| `services/scanner/tests/`                                      | 95 pruebas del worker, incluida la autenticación. |

### 11.4 Registros de arquitectura del Sprint 2

| ADR  | Título                                                                | Estado                          |
| ---- | --------------------------------------------------------------------- | ------------------------------- |
| 0015 | Los criterios oficiales del Sprint 2 mandan sobre los propuestos      | Aceptada                        |
| 0016 | Vincular una cuenta social exige prueba de control del buzón          | Aceptada                        |
| 0017 | Lectura literal de CA-30 para cuentas nuevas de Google                | **Propuesta — requiere aprobación** |
| 0018 | Criterios propuestos de GitHub (`CA-30-GH` a `CA-33-GH`)              | **Propuesta — requiere aprobación** |
| 0019 | Suscripciones simuladas detrás de `PaymentProvider`                   | Aceptada                        |
| 0020 | La intranet se demuestra con un fixture, no debilitando el SSRF       | Aceptada                        |
| 0021 | Los datos de demostración se marcan donde se ven                      | Aceptada                        |
| 0022 | Historial de instantáneas, sin puntaje compuesto                      | Aceptada                        |
| 0023 | Qué es una vulnerabilidad nueva y cuándo se avisa                     | Aceptada                        |
| 0024 | Cancelación con resultados parciales                                  | Aceptada                        |
| 0025 | Tabla de equivalencia entre la operación del acta y la ruta real      | Aceptada                        |
| 0026 | Un cierre honesto: «Parcial» con plan, nunca «Listo» por optimismo    | Aceptada                        |

Dos ADR están marcados como **propuesta** porque cambian una lectura del acta y
requieren que el equipo lo apruebe explícitamente. Ninguno de los dos se cita como
si ya estuviera aprobado.

### 11.5 Comandos de esta verificación

```powershell
pnpm install
pnpm dev:all                 # PostgreSQL, Redis, Mailpit, fixture, OAuth, worker, planificador, Next.js
pnpm demo:reset
pnpm demo:seed-history
pnpm demo:reset-billing
pnpm demo:reset-social

pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:browser
cd services/scanner; pytest -q
pnpm build
```

### 11.6 Datos de la presentación que debe completar el equipo

Este documento deja huecos visibles a propósito. Estos son, todos juntos, para que
nadie tenga que buscarlos:

| Dato | Dónde | Estado |
| --- | --- | --- |
| Nombre comercial y eslogan | Portada y §8.3 | Sin definir |
| Fecha, lugar y duración de la presentación | Portada | Sin definir |
| Tipo de audiencia (profesor, jurado, inversionista) | §0 | Sin definir |
| Dominio que se usará en la demo | §5 | Sin definir; hoy es `127-0-0.1.nip.io` |
| Credenciales de Google y GitHub | §9.9 | No disponibles |
| Monto de financiación y uso de fondos | §8.12 | Sin definir |
| Tamaño de mercado, segmento y fuente | §8.6 | Sin definir |
| Tracción: usuarios, ingresos, pilotos | §8.8 | Sin definir |
| Planes y precios definitivos | §8.7 y §9.7 | Sin definir |
| Quién presenta cada parte | §0 | Sin definir |

Cada uno de esos huecos aparece en el texto como `[COMPLETAR: …]`. Se completan
antes de presentar; ninguno se rellena con una cifra estimada.

### 11.7 Créditos

**© 2026 VulDetected. Todos los derechos reservados.**

Juan Esteban Correa, Victor Salinas y Emmanuel Berrio Jimenez

Grupo ET0123 · Institución Universitaria Pascual Bravo · Medellín

---

*Este documento se escribió al cerrar la verificación del Sprint 2. Si el código
cambia y este documento no, el documento está mal: las pruebas son la fuente, y
este archivo es su acta.*







