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
