# ADR 0015: Los criterios oficiales del Sprint 2 mandan sobre los propuestos

Fecha: 2026-11-18
Estado: Aceptada
Decisores: Equipo VulDetected

## Contexto

El repositorio ya tenía criterios de aceptación escritos durante el Sprint 1 con
la numeración `CA-XX`. La especificación oficial del Sprint 2 define un conjunto
distinto de criterios que también usa `CA-09`, `CA-10`, `CA-12`, `CA-20`…`CA-37`.
Los dos conjuntos se solapan en número y no en contenido.

Mantener dos significados para el mismo identificador haría que un acta, una
prueba o un commit citaran `CA-25` sin que nadie pudiera saber a cuál se refiere.
Eso es exactamente el tipo de ambigüedad que arruina una verificación.

## Decisión

Los criterios de la especificación oficial del Sprint 2 son la única fuente de
verdad para todo lo que se reporte como Sprint 2.

Los criterios propuestos que ya existían en el repositorio y que no coinciden con
el texto oficial se renombran con el prefijo `CA-P` (`CA-P01`, `CA-P02`, …) y
quedan documentados como propuestas internas. Ninguna prueba, ningún acta y
ninguna sección del manual de verificación del Sprint 2 los cita como si fueran
oficiales.

## Consecuencias

- Cada criterio del Sprint 2 tiene un significado único y verificable.
- Las pruebas llevan el identificador oficial en el nombre, de modo que un
  `pnpm test` produce evidencia rastreable hasta el criterio.
- Los criterios propuestos no desaparecen: siguen existiendo con otro nombre, así
  que el trabajo previo no se pierde ni se presenta como si fuera oficial.
- Cuesta una renumeración única en la documentación existente.

## Alternativas consideradas

- **Conservar la numeración previa y traducir en el manual**: obliga a un lector a
  hacer la traducción mental en cada tabla. Descartada.
- **Reiniciar la numeración desde CA-01**: destruye la trazabilidad con el Sprint
  1 y con las actas ya entregadas. Descartada.

## Reparto oficial por historia

La especificación del Sprint 2 asigna 21 criterios a siete historias. Este es el
reparto que usan el código, las pruebas y el manual de verificación:

| Historia | Jira | Criterios |
| --- | --- | --- |
| HU-02a · Inicio de sesión social | SCRUM-28 | `CA-30`, `CA-31`, `CA-32`, `CA-33` |
| HU-02b · Gestión de suscripción | SCRUM-29 | `CA-34`, `CA-35`, `CA-36`, `CA-37` |
| HU-04 · Escaneo autenticado | SCRUM-30 | `CA-25`, `CA-26`, `CA-27` |
| HU-06 · Cancelación de escaneo | SCRUM-19 | `CA-20`, `CA-21`, `CA-22` |
| HU-07 · Escaneos programados y alertas | SCRUM-25 | `CA-12`, `CA-23`, `CA-24` |
| HU-09 · Reporte ejecutivo en PDF | SCRUM-26 | `CA-09`, `CA-28` |
| HU-10 · Historial comparativo | SCRUM-27 | `CA-10`, `CA-29` |

Los identificadores que no aparecen en esta tabla y que el repositorio ya usaba
(`CA-01`…`CA-19` del Sprint 1) conservan su significado del Sprint 1 y no se
reutilizan para el Sprint 2.

Cuando una decisión del Sprint 2 no corresponde a ningún criterio literal de la
especificación —por ejemplo, conservar los resultados parciales de un escaneo
cancelado— se documenta en su propio ADR y las pruebas la citan por el número de
ADR, nunca por un `CA-` inventado.
