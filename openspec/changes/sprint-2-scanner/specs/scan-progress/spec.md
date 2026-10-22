# scan-progress Specification

## Purpose

Provides live scan progress to the browser. `scan_events` is an append-only stream written
only by the web app; the browser consumes it over server-sent events (SSE).

## Requirements

### Requirement: [SP-1] scan_events append-only

`scan_events` MUST be append-only: rows are never updated or deleted in Sprint 2, and the
creation timestamp is the authoritative ordering.

#### Scenario: Sin reescritura de eventos
- GIVEN un escaneo en curso
- WHEN se añaden eventos de progreso
- THEN solo se insertan filas nuevas
- AND ningún evento previo se actualiza ni se borra

### Requirement: [SP-2] Web app como único escritor

Only the web app MUST write `findings`, `scan_events`, and scan status. The worker reports
through the authenticated callback and MUST NOT write these tables.

#### Scenario: Escritura centralizada
- GIVEN eventos reportados por el worker
- WHEN se persisten
- THEN lo hace la web a partir del callback autenticado

### Requirement: [SP-3] SSE sobre polling corto

The browser stream MUST use SSE backed by short polling of `scan_events`. Live progress MUST
be visible within 2 seconds of job start.

#### Scenario: Progreso en vivo
- GIVEN un escaneo en ejecución
- WHEN el navegador mantiene la conexión SSE
- THEN recibe eventos nuevos en 2 segundos o menos desde el inicio del job

### Requirement: [SP-4] LISTEN/NOTIFY como optimización gated

The design MAY use PostgreSQL `LISTEN/NOTIFY` only as an optimization gated by the hosting
decision. Correctness MUST NOT depend on it.

#### Scenario: Fallback a polling
- GIVEN un hosting que degrada `LISTEN/NOTIFY`
- WHEN opera el stream
- THEN el progreso sigue funcionando sobre polling corto

### Requirement: [SP-5] Retención compatible

Sprint 2 MUST NOT run any cleanup of `scan_events`; the schema MUST remain compatible with
adding a TTL later without remodeling.

#### Scenario: Sin limpieza en Sprint 2
- GIVEN el sistema en Sprint 2
- WHEN se inspecciona
- THEN no existe job de retención de eventos
