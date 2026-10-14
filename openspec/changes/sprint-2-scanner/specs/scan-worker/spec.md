# scan-worker Specification

## Purpose

The isolated Python + Celery worker consumes jobs from the Redis broker, executes
deterministic own checks in Sprint 2, and reports through an authenticated callback. It
holds no business rules, no session validation, and no database credentials.

## Requirements

### Requirement: [SW-1] Consumo de la cola y revalidación independiente

The worker MUST consume Celery tasks from the Redis broker and MUST independently
re-validate every target against the SSRF rules. It MUST NOT trust the queue for target
safety.

#### Scenario: Revalidación del objetivo
- GIVEN una tarea con un objetivo recibido por el broker
- WHEN el worker inicia el escaneo
- THEN vuelve a validar el objetivo antes de la primera petición

### Requirement: [SW-2] Checks propios deterministas

In Sprint 2 the worker MUST execute deterministic own checks: security headers, TLS/HTTPS,
cookie flags, and redirects. It MUST NOT run Nuclei or ZAP in Sprint 2; the findings output
contract MUST anticipate their future integration.

#### Scenario: Ejecución de checks propios
- GIVEN un objetivo verificado y validado
- WHEN el worker ejecuta el escaneo
- THEN produce hallazgos de headers de seguridad, TLS/HTTPS, flags de cookies y redirects

#### Scenario: Sin herramientas reales en Sprint 2
- GIVEN el worker de Sprint 2
- WHEN ejecuta un escaneo
- THEN no invoca Nuclei ni ZAP
- AND la salida usa la forma normalizada de findings

### Requirement: [SW-3] Egress endurecido contra SSRF

The egress path MUST resolve DNS and validate the resolved address, reject loopback,
link-local, private, and IPv6-loopback ranges, re-validate after every redirect with a
bounded chain, restrict ports to an allowlist, pin the validated address against DNS
rebinding, and enforce timeouts and concurrency caps.

#### Scenario: Rechazo de rango no público
- GIVEN un objetivo que resuelve a un rango loopback, link-local o privado
- WHEN el worker intenta conectar
- THEN la conexión se rechaza

#### Scenario: Revalidación tras redirect
- GIVEN un objetivo permitido que redirige a `169.254.169.254` o `127.0.0.1`
- WHEN el worker sigue el redirect
- THEN vuelve a resolver y validar antes de conectar
- AND la cadena de redirects es acotada

#### Scenario: Bypass por IPv6
- GIVEN un objetivo que resuelve a `::1`
- WHEN el worker valida la dirección
- THEN se rechaza igual que el loopback IPv4

### Requirement: [SW-4] Aislamiento del worker

The worker MUST run with a read-only root filesystem, `tmpfs` on `/tmp`, dropped
capabilities, no host or Docker-socket mounts, resource limits, and no database
credentials. User input MUST NOT reach a shell; arguments are passed as an argv array.

#### Scenario: Sistema de archivos de solo lectura
- GIVEN el contenedor del worker
- WHEN se inspecciona su configuración
- THEN el rootfs es de solo lectura y `/tmp` es `tmpfs`
- AND no tiene credenciales de Postgres ni montajes del host

### Requirement: [SW-5] Callback autenticado

The worker MUST report findings, events, and status only through an authenticated channel
using `SCANNER_CALLBACK_SECRET`. It MUST NOT write to the database directly.

#### Scenario: Reporte autenticado
- GIVEN un escaneo completado en el worker
- WHEN reporta sus resultados
- THEN usa el canal de callback autenticado
- AND la web es el único escritor de `findings`, `scan_events` y estado

#### Scenario: Callback no autenticado
- GIVEN una petición de callback sin credencial válida
- WHEN llega a la web
- THEN se rechaza

### Requirement: [SW-6] Runner de pruebas del worker (pytest)

pytest MUST be adopted as the worker test runner, with mandatory anti-SSRF tests that
include redirect-based and IPv6 bypass attempts.

#### Scenario: Pruebas anti-SSRF obligatorias
- GIVEN la suite de pytest del worker
- WHEN se ejecuta
- THEN incluye intentos de bypass por redirect e IPv6 y pasan
