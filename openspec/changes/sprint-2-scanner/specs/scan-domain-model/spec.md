# scan-domain-model Specification

## Purpose

Defines the persistence model for the scan domain: the `domains`, `scans`, `findings`, and
`scan_events` tables, the `scan_status` and `severity` enums, and the tool-independent
normalized finding shape. Severity classification, retention policy, and real tool
integration are out of scope for Sprint 2.

## Requirements

### Requirement: [DM-1] Esquema del dominio de escaneo

`packages/db` MUST define the `domains`, `scans`, `findings`, and `scan_events` tables plus
the `scan_status` and `severity` enums. Migrations MUST be additive with no backfill.

#### Scenario: Migración aditiva crea el esquema
- GIVEN una base de datos con el esquema de Sprint 1
- WHEN se aplica la migración de Sprint 2
- THEN las cuatro tablas y los dos enums existen
- AND ninguna tabla existente se altera con backfill

#### Scenario: Reversión a nivel de código
- GIVEN el esquema de Sprint 2 aplicado
- WHEN se revierte la rama `sprint/2`
- THEN las tablas aditivas quedan sin uso sin romper el código de Sprint 1

### Requirement: [DM-2] Ciclo de vida del scan (scan_status)

`scans.status` MUST use the `scan_status` enum with `queued`, `running`, `completed`,
`failed`, and `cancelled`.

#### Scenario: Estado inicial al aceptar un escaneo
- GIVEN un escaneo aceptado y encolado
- WHEN se inserta la fila en `scans`
- THEN `status` es `queued`

### Requirement: [DM-3] Severidad sin clasificar

`findings.severity` MUST exist as a column over the `severity` enum. Sprint 2 MUST store
findings without classifying them and MUST NOT implement classification logic.

#### Scenario: Hallazgo sin clasificar
- GIVEN un hallazgo producido por un check determinista
- WHEN se persiste en `findings`
- THEN `severity` acepta el valor sin clasificar del enum
- AND no existe lógica de clasificación en Sprint 2

#### Scenario: Clasificación diferida a Sprint 3
- GIVEN el enum `severity` definido
- WHEN un consumidor lee severidades en Sprint 2
- THEN obtiene valores sin clasificar, sin reglas de mapeo

### Requirement: [DM-4] Forma normalizada de finding

A `findings` row MUST use a normalized shape independent of the producing tool, so future
Nuclei/ZAP output maps onto the same record without schema changes. Sprint 2 findings come
only from the worker's own deterministic checks.

#### Scenario: Hallazgo de check propio en forma normalizada
- GIVEN el worker emite un hallazgo de uno de sus checks propios
- WHEN la web lo persiste
- THEN la fila usa la forma normalizada
- AND el payload crudo de la herramienta se conserva como evidencia

#### Scenario: Integración futura sin remodelar
- GIVEN una herramienta futura con formato distinto
- WHEN su salida se mapea a la forma normalizada
- THEN no requiere cambios de esquema

### Requirement: [DM-5] Identidad estable para deduplicación

Each finding MUST carry a stable finding key that supports deduplication across re-scans.
The dedup scope (intra-scan versus cross-scan) is decided in design.

#### Scenario: Clave estable entre re-escaneos
- GIVEN el mismo hallazgo detectado en dos escaneos del mismo dominio
- WHEN ambos se persisten
- THEN comparten la misma clave de hallazgo

### Requirement: [DM-6] Compatibilidad de retención

Sprint 2 MUST retain all rows with no TTL, scheduler, or cleanup job. The schema MUST allow
adding a TTL later without remodeling.

#### Scenario: Sin job de limpieza
- GIVEN el esquema de Sprint 2
- WHEN se inspecciona el sistema
- THEN no existe job de TTL ni de limpieza

#### Scenario: TTL futuro sin remodelar
- GIVEN una tabla con su columna de creación
- WHEN se decide un TTL futuro
- THEN puede añadirse sin recrear la tabla
