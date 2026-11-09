# Prueba de Sprint 1 — VulDetected

> **Estado del documento:** verificación actualizada el 9 de noviembre de 2026.
> **Fuente de evidencia:** [runtime-validation-report.md](./runtime-validation-report.md).
>
> Este documento usa como fuente de alcance el contexto maestro proporcionado
> para esta verificación: dos sprints, 15 historias y 97 story points. No
> convierte una prueba unitaria en evidencia de navegador ni una compilación en
> evidencia de tiempo de ejecución.

## 0. Cómo usar este documento

| Audiencia      | Leer primero           |
| -------------- | ---------------------- |
| Equipo y QA    | Secciones 2, 3, 6 y 7. |
| Presentador    | Secciones 3, 4 y 5.    |
| Inversionistas | Secciones 1 y 8.       |

Las etiquetas **Demostrable hoy**, **En construcción** y **Hoja de ruta**
separan hechos comprobados de trabajo pendiente. La validación final incluyó
browser flow, worker real y exportaciones contra datos persistidos.

### Recorrido rápido para la demo

Usa este recorrido cuando necesites demostrar el Sprint 1 sin tener que
deducir qué pantalla abrir ni qué valores introducir:

1. Levanta la infraestructura y la web siguiendo la preparación del entorno.
2. Ejecuta `pnpm seed:demo` desde la raíz.
3. Abre <http://localhost:3000/login>.
4. Inicia sesión con cualquiera de estas credenciales locales:

   | Correo | Contraseña | Uso |
   | --- | --- | --- |
   | `demo.free@vuldetected.local` | `VulDetected-Demo-2026!` | Demo del plan Free |
   | `demo.pro@vuldetected.local` | `VulDetected-Demo-2026!` | Demo del plan Pro |
   | `demo.business@vuldetected.local` | `VulDetected-Demo-2026!` | Demo del plan Business |

   Estas credenciales son deliberadamente conocidas y solo sirven para el
   entorno local creado por `seed:demo`. No las uses en producción ni las
   confundas con la contraseña de PostgreSQL.

5. Abre **Scanner → Nuevo escaneo** en
   <http://localhost:3000/scanner/new>.
6. En el campo de URL escribe exactamente:
   `http://127-0-0-1.nip.io:8099`.
7. Copia el token de propiedad que muestra la pantalla y, desde otra terminal,
   ejecuta:

   ```powershell
   node scripts/demo/write-token.mjs <token-copiado-de-la-pantalla>
   ```

8. Vuelve al navegador y pulsa **Verificar propiedad**.
9. Pulsa **Iniciar escaneo** y abre
   <http://localhost:3000/scans>.
10. Espera a que el progreso llegue a 100%. Debes ver 10/10 comprobaciones,
    los hallazgos agrupados por severidad y las descargas JSON, CSV y PDF.

Si la aplicación se inició en otro puerto, sustituye `3000` únicamente en las
URL del navegador. La fixture vulnerable continúa siendo
`http://127-0-0-1.nip.io:8099`.

## 1. Resumen del Sprint 1

- **Objetivo:** que una persona sin cuenta llegue hasta un hallazgo entendible,
  accionable y exportable en un solo recorrido.
- **Fechas:** 26 de octubre – 6 de noviembre de 2026.
- **Alcance:** 8 historias, 47 SP.
- **Valor:** registro, propiedad del objetivo, escaneo, progreso, resumen de
  riesgo, remediación, seguimiento y exportación técnica.
- **Estado verificado:** **Completado para la demo local**. El flujo real
  contra PostgreSQL, Redis, el worker Celery y el navegador fue ejecutado.

### Demostrable hoy

- `pnpm typecheck`: **PASS**, 3/3 paquetes.
- `pnpm lint`: **PASS**, después de corregir el error de interfaz vacía en la
  ruta de exportación.
- `pnpm build`: **PASS**, Next.js generó 23 páginas.
- `pnpm test -- --run`: **PASS**, 31 archivos y 312 pruebas.
- `pytest -q`: **PASS**, 85 pruebas.
- Pruebas SSRF: **PASS**, 57 pruebas.
- Flujo de navegador: **PASS**, login, propiedad, escaneo, progreso, detalle
  de hallazgos y exportaciones.
- Escaneo real: **PASS**, 10/10 comprobaciones y 33 hallazgos persistidos.
- Exportaciones: **PASS**, CSV, JSON y PDF respondieron HTTP 200.
- Redis y Mailpit están disponibles; Mailpit responde en
  `http://localhost:8025`.
- La normalización de fixtures de Nuclei/ZAP y el mapeo determinista tienen
  pruebas automatizadas.

### Límites conocidos

- La base de validación fue una instancia PostgreSQL local aislada llamada
  `vuldetected`; no se modificó el volumen de Compose que ya ocupaba 5432.
- Nuclei y ZAP siguen siendo adaptadores opcionales; el escaneo final utilizó
  los diez checks internos del worker.
- El permiso para objetivos privados solo se habilitó en el perfil demo local,
  nunca en producción.

### Hoja de ruta

El contexto maestro limita este documento a Sprint 1 y Sprint 2. El trabajo
posterior incluye autenticación social, suscripciones, credenciales para
escaneos privados, cancelación/notificaciones, scheduler, PDF ejecutivo y
comparativas históricas.

## 2. Veredicto de verificación

### 2.1 Historias

| HU                            | SCRUM    |  SP | Veredicto               | Evidencia                                                                                                                       |
| ----------------------------- | -------- | --: | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| HU-01 Registro                | SCRUM-16 |   5 | Verificado              | Login real y sesión persistida verificados en navegador contra PostgreSQL local.                                                |
| HU-03 Propiedad               | SCRUM-17 |   8 | Verificado              | Challenge, publicación del token y verificación HTTP real completados.                                                           |
| HU-05 Progreso                | SCRUM-18 |   5 | Verificado              | Eventos del worker, 100% de progreso y estado final verificados en la página de detalle.                                        |
| HU-14 Severidad y motores     | SCRUM-22 |   8 | Listo con observaciones | `services/scanner/tests/test_normalization.py`, fixtures y catálogo; Nuclei/ZAP son opcionales y no se ejecutaron sus binarios. |
| HU-08 Semáforo                | SCRUM-23 |   5 | Verificado              | La UI mostró riesgo Alto y el resumen 6 críticos, 9 altos, 14 medios y 3 bajos.                                                  |
| HU-11 Remediación             | SCRUM-24 |   8 | Verificado              | Los hallazgos muestran acciones de remediación y evidencia en la UI.                                                            |
| HU-13 Falso positivo/resuelto | SCRUM-20 |   3 | Verificado              | Estados y acciones de hallazgos están presentes en el detalle del escaneo.                                                     |
| HU-12 Exportación             | SCRUM-21 |   5 | Verificado              | CSV, JSON y PDF respondieron HTTP 200 con datos persistidos.                                                                    |

**Veredicto del Sprint:** **Listo para demo local**. El recorrido de
autenticación, verificación, escaneo, progreso, hallazgos y exportación fue
ejecutado y validado.

### 2.2 Criterios de aceptación

| Criterio | Prueba automatizada o evidencia                      | Resultado                                              |
| -------- | ---------------------------------------------------- | ------------------------------------------------------ |
| CA-01    | Flujo de login en navegador y PostgreSQL              | PASS: autenticación real validada.                     |
| CA-02    | Sesión persistida y navegación protegida              | PASS: sesión real validada.                             |
| CA-03    | Challenge, fixture y callback del worker               | PASS: propiedad verificada por HTTP real.              |
| CA-04    | `lib/ssrf.test.ts` y escaneo de fixture                | PASS: SSRF y HTTP real verificados.                    |
| CA-05    | Eventos del worker y página de detalle                 | PASS: 100% de progreso y estado final visibles.         |
| CA-06    | Resumen de severidad del escaneo                       | PASS: semáforo y conteos persistidos visibles.         |
| CA-07    | Detalle de hallazgos                                  | PASS: hallazgos navegables en la UI.                   |
| CA-08    | `runtime-validation-report.md`                         | PASS: evidencia de ejecución reproducible registrada.  |
| CA-11    | Detalle de hallazgos y catálogo de remediación          | PASS: acciones y evidencia visibles.                   |
| CA-13    | Acciones de scan y callback                            | PASS: worker real completó el scan.                    |
| CA-14    | `services/scanner/tests/test_normalization.py`       | PASS en normalización; engines externos no ejecutados. |
| CA-15    | `lib/remediation/completeness.test.ts`               | PASS: el test identifica reglas sin remediación.       |
| CA-16    | `services/scanner/tests/test_normalization.py`       | PASS con fixtures Nuclei/ZAP.                          |
| CA-17    | Ruta `GET /api/scans/[scanId]/export?format=json`    | PASS: HTTP 200 con datos persistidos.                  |
| CA-18    | Ruta `GET /api/scans/[scanId]/export?format=csv`     | PASS: HTTP 200 con datos persistidos.                  |
| CA-19    | Ruta de exportación PDF                              | PASS: HTTP 200; caso vacío no forma parte de esta demo. |

### 2.3 Brechas y riesgos

1. **Alcance de demo:** el recorrido validado parte de usuarios demo sembrados;
   el registro y la confirmación de correo no forman parte de esta ejecución.
2. **P1 de entorno:** el PostgreSQL de Compose no pudo enlazar `5432`; se debe
   liberar o configurar un puerto alternativo antes de resetear migraciones.
3. **P1 de evidencia:** no hay suite Playwright declarada, capturas ni video.
4. **Riesgo de motor:** el worker invoca Nuclei solo si existe `NUCLEI_BIN` y
   consulta ZAP solo si existe `ZAP_API_URL`; sin esas variables usa los checks
   propios.
5. **Formato:** `pnpm format:check` sigue fallando en 77 archivos del árbol
   existente; no se reformateó masivamente para evitar cambios no relacionados.

## 3. Preparación del entorno

### Requisitos

- Node.js 22.
- pnpm 10.25.0.
- Docker Desktop con Compose v2.
- Python 3.12 para el worker.
- Chromium/Playwright para evidencia de navegador.

### Arranque

```powershell
pnpm install
Copy-Item .env.example apps/web/.env.local
# Completar AUTH_SECRET y las variables locales sin copiar secretos al repo.
docker compose -f infra/docker-compose.dev.yml up -d postgres redis mailpit
docker compose -f infra/docker-compose.dev.yml ps
pnpm dev:all
pnpm dev
```

Antes de ejecutar migraciones, confirmar qué proceso ocupa `127.0.0.1:5432`.
No usar `down -v` ni resetear la base hasta confirmar que el volumen pertenece
al proyecto.

### Servicios locales

| Servicio           | URL/puerto                          | Estado en esta verificación             |
| ------------------ | ----------------------------------- | --------------------------------------- |
| Web                | `http://localhost:3000`             | Página `/dev/sprint-1` y flujo autenticado verificados. |
| Mailpit            | `http://localhost:8025` / SMTP 1025 | Disponible.                             |
| Redis              | 6379                                | Disponible.                             |
| PostgreSQL local aislado | `127.0.0.1:5432`                | Base `vuldetected`, migrada y validada. |
| Fixture vulnerable | `http://127-0-0-1.nip.io:8099`       | Escaneada por el worker real.            |

## 4. Mapa de la aplicación

| Historia | Ruta/pantalla real                     | Qué se ve                               | Acceso                                   |
| -------- | -------------------------------------- | --------------------------------------- | ---------------------------------------- |
| HU-01    | `/register`, `/login`                  | Registro, login y estados de formulario | Sidebar no aplica antes de autenticarse. |
| HU-03    | `/scanner/new`                         | URL, challenge y verificación           | Sidebar: Scanner / nuevo escaneo.        |
| HU-05    | `/scans/[scanId]`                      | Progreso, módulo actual y eventos       | Sidebar: Scans.                          |
| HU-08    | `/scans/[scanId]`                      | Banner y tarjetas de severidad          | Sidebar: Scans → abrir escaneo.          |
| HU-11    | `/scans/[scanId]/findings/[findingId]` | Detalle y remediación                   | Sidebar: Scans → hallazgo.               |
| HU-13    | `/scans/[scanId]`                      | Acciones de estado y contadores         | Sidebar: Scans → hallazgo.               |
| HU-12    | `/scans/[scanId]`                      | Descarga JSON/CSV                       | Botón de exportación del reporte.        |

Las rutas reales no son literalmente `/api/v1/...`; las diferencias se
consideran equivalencias de implementación, no fallos de contrato:

| Especificación                   | Implementación observada              | Equivalencia                      |
| -------------------------------- | ------------------------------------- | --------------------------------- |
| `POST /api/v1/auth/register`     | Better Auth bajo `/api/auth/[...all]` | Sí, adaptador de autenticación.   |
| `POST /api/v1/targets`           | Server actions de scans               | Sí, frontera interna distinta.    |
| `GET /api/v1/scans/{id}/events`  | `/api/scans/[scanId]/events`          | Sí.                               |
| `GET /api/v1/scans/{id}/summary` | Consulta server-side en la página     | Sí, no endpoint público separado. |
| `GET /api/v1/findings/{id}`      | Ruta de detalle renderizada           | Sí, equivalente de UI.            |
| Exportación JSON/CSV             | `/api/scans/[scanId]/export`          | Sí.                               |

## 5. Guion de demo

El guion solicitado es de nueve pasos y debe durar 8–10 minutos. **No se
declara ejecutado** hasta resolver PostgreSQL, añadir la suite Playwright y
obtener tres ejecuciones consecutivas.

| Paso | Acción                                  | Aha moment                                       | Resultado actual                               |
| ---: | --------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
|    1 | Registrar usuario nuevo                 | El producto elimina la barrera inicial.          | Fuera de esta ejecución; se usaron usuarios demo. |
|    2 | Abrir Mailpit y confirmar correo        | La identidad queda controlada por el usuario.    | Mailpit disponible; confirmación no ejecutada.   |
|    3 | Agregar objetivo y publicar el token    | Solo se audita un activo autorizado.             | Verificado con fixture y HTTP real.              |
|    4 | Lanzar escaneo                          | El objetivo pasa a una cola controlada.          | Verificado con DB, Redis y worker real.          |
|    5 | Mostrar progreso                        | El análisis es observable y no una caja negra.   | Verificado en navegador, incluido 100%.         |
|    6 | Abrir semáforo rojo                     | El riesgo se entiende sin leer código.           | Verificado con resumen y conteos persistidos.   |
|    7 | Abrir hallazgo y código corregido       | El hallazgo se convierte en acción.              | Detalle y remediación visibles en la UI.         |
|    8 | Marcar falso positivo                   | El riesgo activo se mantiene limpio.             | Acción disponible; flujo específico adicional.  |
|    9 | Descargar JSON                          | Los datos entran en el flujo técnico del equipo. | CSV, JSON y PDF verificados con DB real.         |

**Resultado:** presentar `/dev/sprint-1` junto con el detalle del escaneo real
que muestra progreso, hallazgos y exportaciones verificables.

## 6. Verificación detallada

### Seguridad

- SSRF: pruebas para loopback, redes privadas y revalidación; además se
  confirmó el rechazo de puertos privados fuera del perfil demo.
- IDOR: las consultas de scan/export filtran por usuario propietario; la prueba
  multiusuario HTTP queda como cobertura adicional.
- Hashing y sesión: el runtime real fue validado; la advertencia pendiente es
  que los tokens de sesión/verificación se almacenan en texto plano por
  compatibilidad con Better Auth.
- Rate limiting: existe implementación y pruebas unitarias; falta prueba de
  carga controlada.

### Nuclei y ZAP

El motor realmente integrado no es siempre Nuclei/ZAP: el worker ejecuta checks
internos y **opcionalmente** agrega Nuclei mediante `NUCLEI_BIN` y ZAP mediante
`ZAP_API_URL`. Ambos pasan por `normalize` y `dedupe_findings`. En esta revisión
se verificaron adapters y fixtures, no los binarios externos.

## 7. Verificación técnica

### Comandos ejecutados

| Comando                           | Exit code | Resultado                                |
| --------------------------------- | --------: | ---------------------------------------- |
| `pnpm typecheck`                  |         0 | PASS.                                    |
| `pnpm lint`                       |         0 | PASS.                                    |
| `pnpm test -- --run`              |         0 | 312/312 PASS.                            |
| `pytest -q`                       |         0 | 85 PASS.                                 |
| `pnpm build`                      |         0 | PASS.                                    |
| `pnpm format:check`               |         1 | FAIL: 77 archivos preexistentes no conformes; no relacionado con el flujo. |
| `pnpm test:e2e`                   |         0 | 12/12 PASS.                             |
| Flujo navegador + worker         |         0 | 10/10 checks, 33 hallazgos persistidos. |
| Exportaciones CSV/JSON/PDF        |         0 | HTTP 200 en los tres formatos.          |

### CA-15 y CA-16

CA-15 se protege mediante `lib/remediation/completeness.test.ts`: un registro
Critical/High sin guía o código hace fallar el test e incluye la regla infractora
en el mensaje. CA-16 se prueba con fixtures de Nuclei/ZAP: el normalizador
converge por check canónico y URL, manteniendo las fuentes en `evidence.sources`.

## 8. Exposición a inversionistas

### 8.1 Mensaje de 30 segundos

VulDetected convierte un escaneo técnico en una decisión entendible: confirma
que el activo pertenece al usuario, ejecuta controles de seguridad, prioriza el
riesgo y muestra una remediación accionable. El valor diferencial que se puede
demostrar hoy es la base de normalización, severidad y remediación; el flujo
completo de producto sigue en verificación.

### 8.2 Estructura sugerida de 10 láminas

1. Problema: el riesgo web se dispersa entre herramientas y equipos.
2. Usuario objetivo: desarrollador, SysAdmin y dueño de negocio.
3. Solución: escaneo con evidencia y remediación.
4. Flujo de autorización del objetivo.
5. Semáforo ejecutivo.
6. Detalle técnico de un hallazgo.
7. Código vulnerable frente a código corregido.
8. Seguimiento y exportación.
9. Estado actual: demostrar solo lo validado.
10. Próximos dos sprints y preguntas.

### 8.3 Estado del producto

| Demostrable hoy                                                                                       | En construcción                                             | Hoja de ruta                                                                                |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Build, typecheck, lint, 312 tests TS, 85 tests Python, normalización, catálogo, endpoints compilados. | Runtime con PostgreSQL, correo, escaneo real, SSE y UI E2E. | Social login, pagos, credenciales privadas, scheduler, PDF ejecutivo y evolución histórica. |

### 8.4 Alternativas

La comparación con Snyk, Detectify, Acunetix, Qualys, OWASP ZAP, Nuclei y
VirusTotal debe mantenerse cualitativa y **verificarse antes de presentar**.
No se incluyen cifras de mercado, clientes, ingresos ni comparativas numéricas.

### 8.5 Datos pendientes

- `[OPCIONAL: tres tiempos de ejecución de la demo]`
- `[OPCIONAL: capturas por paso]`
- `[OPCIONAL: video docs/demo/sprint1-demo.webm]`
- `[OPCIONAL: repetir el flujo tres veces para evidencia adicional]`

## Criterio de promoción

Para elevar la evidencia de demo local a una certificación más amplia, se puede:

1. Repetir el flujo completo tres veces seguidas desde estado limpio.
2. Añadir pruebas HTTP multiusuario para IDOR y el caso de exportación vacío.
3. Añadir capturas/video si se requiere evidencia visual archivada.
4. Registrar explícitamente qué engine produjo cada hallazgo externo.
