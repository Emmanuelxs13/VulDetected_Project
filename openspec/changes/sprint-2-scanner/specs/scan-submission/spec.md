# scan-submission Specification

## Purpose

Accepts, normalizes, and validates a scan target; applies the ownership gate and rate
limits; and enqueues the job through the Celery broker. Anti-SSRF, the ownership gate, and
rate limiting are security non-negotiables from `docs/security.md`.

## Requirements

### Requirement: [SS-1] Normalización de URL

A submitted URL MUST be normalized deterministically (scheme, host casing, default ports,
and encoding) before any validation or persistence.

#### Scenario: URL normalizada
- GIVEN una URL con mayúsculas en el host, puerto por defecto y path redundante
- WHEN se somete al sistema
- THEN se persiste su forma normalizada
- AND dos URLs que difieren solo en mayúsculas comparten el mismo hostname normalizado

#### Scenario: Esquema no permitido
- GIVEN una URL con esquema distinto de http o https
- WHEN se somete al sistema
- THEN se rechaza sin encolar

### Requirement: [SS-2] Rechazo de http(s) no público

The system MUST reject any target that resolves to loopback, link-local, private, or
IPv6-loopback addresses. Validation MUST resolve DNS and check the resolved address, not the
hostname string.

#### Scenario: Dirección no pública
- GIVEN una URL que resuelve a `127.0.0.1`, `169.254.169.254`, un rango RFC1918 o `::1`
- WHEN se somete al sistema
- THEN se rechaza sin encolar

### Requirement: [SS-3] Gate de ownership antes del encolado

Submission MUST require a verified `domains` row; the structural guard defined by
`domain-ownership` runs before any job is created.

#### Scenario: Rechazo sin ownership
- GIVEN un usuario sin ownership verificado
- WHEN somete una URL válida
- THEN la sumisión se rechaza sin encolar

### Requirement: [SS-4] Rate limiting en escaneos y auth

Scan submission MUST be rate limited per user and per IP, and auth endpoints MUST be rate
limited per IP. The limiter MUST be enforced server-side and MUST fail closed when
unavailable. Limiter versus product quota is a design decision.

#### Scenario: Límite excedido en escaneos
- GIVEN un usuario que supera el umbral de envíos
- WHEN somete otro escaneo
- THEN la petición se rechaza del lado servidor

#### Scenario: Límite en auth
- GIVEN un cliente que supera el umbral por IP en endpoints de auth
- WHEN intenta autenticarse otra vez
- THEN se rechaza sin revelar si la cuenta existe

#### Scenario: Limiter fuera de servicio
- GIVEN el limiter no disponible
- WHEN llega una petición
- THEN el endpoint falla cerrado

### Requirement: [SS-5] Despacho por broker Redis/Celery

Accepted scans MUST be enqueued through the Redis/Celery broker. The system MUST NOT use
`SCANNER_SERVICE_URL` or any HTTP dispatch contract.

#### Scenario: Encolado vía broker
- GIVEN un escaneo aceptado
- WHEN se encola
- THEN la tarea llega al broker Redis para el worker Celery

#### Scenario: SCANNER_SERVICE_URL retirado
- GIVEN el contrato de configuración de Sprint 2
- WHEN se inspeccionan las variables de entorno
- THEN `SCANNER_SERVICE_URL` no forma parte del contrato

### Requirement: [SS-6] Ciclo de vida del encolado

On acceptance the system MUST insert a `scans` row with `status = queued` and enqueue the
job; scan status is owned by the web app.

#### Scenario: Fila creada antes de encolar
- GIVEN una sumisión válida y autorizada
- WHEN se acepta el escaneo
- THEN existe una fila `scans` en `queued` y la tarea se encola
