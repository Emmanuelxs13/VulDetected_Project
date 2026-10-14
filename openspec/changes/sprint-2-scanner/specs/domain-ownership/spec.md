# domain-ownership Specification

## Purpose

Proves that a user controls a domain before any scan is enqueued. Ownership is a legal
precondition, not a feature: the enqueue path MUST be structurally incapable of running
without a verified `domains` row.

## Requirements

### Requirement: [DO-1] Prueba de propiedad obligatoria

No scan job MUST be enqueued without a verified `domains` row for the target.

#### Scenario: Encolado bloqueado sin prueba
- GIVEN un usuario sin prueba de propiedad verificada
- WHEN intenta encolar un escaneo
- THEN el encolado falla
- AND no se crea ninguna tarea en el broker

#### Scenario: Encolado permitido tras verificar
- GIVEN una fila `domains` verificada para el usuario
- WHEN encola un escaneo
- THEN el encolado procede

### Requirement: [DO-2] Métodos DNS TXT y /.well-known

The system MUST support a DNS `TXT` challenge at `_vuldetected.<domain>` and a
`/.well-known/` file challenge. Either method MUST be sufficient on its own.

#### Scenario: Verificación por DNS TXT
- GIVEN un token generado para el dominio
- WHEN el registro `TXT` coincide
- THEN la propiedad se marca como verificada con método `dns_txt`

#### Scenario: Verificación por archivo well-known
- GIVEN un token generado y servido en `/.well-known/`
- WHEN el archivo coincide
- THEN la propiedad se marca como verificada con método `well_known`

#### Scenario: Prueba fallida
- GIVEN un token que no coincide
- WHEN se comprueba la propiedad
- THEN la verificación falla y el dominio queda sin verificar
- AND no se habilita ningún encolado

### Requirement: [DO-3] Reutilización de verification_tokens

The challenge MUST reuse the existing `verification_tokens` table with
`purpose = 'domain_ownership'`. No new token table MUST be introduced.

#### Scenario: Token con purpose correcto
- GIVEN un reto de propiedad emitido
- WHEN se inspecciona `verification_tokens`
- THEN la fila usa `purpose = 'domain_ownership'`

### Requirement: [DO-4] Persistencia del método y registro

The proof MUST be persisted on the `domains` row with the method, the verifying record, and
`verified_at`.

#### Scenario: Registro de la prueba
- GIVEN una verificación exitosa
- WHEN se actualiza `domains`
- THEN se guardan el método, el registro verificado y `verified_at`

### Requirement: [DO-5] Guard estructural testeado

The enqueue path MUST be structurally incapable of running without a verified row, and MUST
be covered by automated tests.

#### Scenario: Test cubre el guard
- GIVEN la suite de pruebas de la web
- WHEN se ejecuta el test del guard de encolado
- THEN todo intento de encolado sin prueba falla
