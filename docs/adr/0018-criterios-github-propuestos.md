# ADR 0018: Equivalentes de GitHub para los criterios de Google, como propuesta

Fecha: 2026-11-18
Estado: Propuesta — requiere aprobación del equipo
Decisores: Equipo VulDetected

## Contexto

La especificación oficial del Sprint 2 nombra Google en los criterios de inicio de
sesión social. El producto también quiere ofrecer GitHub, y la implementación
resulta ser la misma pieza con otro proveedor.

Escribir criterios nuevos con numeración oficial inventada rompería ADR 0015.
No escribirlos deja el trabajo de GitHub sin criterio verificable.

## Decisión

Se documentan equivalentes explícitos de los criterios de Google para GitHub, con
el sufijo `-GH`:

- `CA-30-GH` — crear cuenta e iniciar sesión con GitHub.
- `CA-31-GH` — iniciar sesión con GitHub en una cuenta existente.
- `CA-32-GH` — cerrar sesión y volver a entrar con GitHub.
- `CA-33-GH` — no duplicar cuenta cuando el correo coincide.

Reglas adicionales:

- Solo se considera el **correo primario verificado** que devuelve GitHub. Un
  correo secundario o no verificado no participa de ninguna decisión.
- La regla de vinculación de ADR 0016 aplica igual: proveedor que afirma
  verificación **y** cuenta local que ya demostró control del buzón.
- Estos criterios son **propuestos**: no forman parte de la lista oficial y se
  presentan como tales en el manual de verificación.

## Consecuencias

- GitHub tiene criterios verificables sin contaminar la numeración oficial.
- El acta puede decir con precisión qué es oficial y qué es propuesta.
- Si el equipo decide que GitHub no entra al Sprint 2, se retiran los cuatro
  criterios sin tocar nada más.

## Alternativas consideradas

- **Numerarlos como CA-38…CA-41**: los hace pasar por oficiales sin serlo.
  Descartada por ADR 0015.
- **No documentarlos**: el código de GitHub quedaría sin criterio y sin prueba
  rastreable. Descartada.
