# ADR 0025: Tabla de equivalencia entre la operación del Sprint 2 y la ruta real

Fecha: 2026-11-18
Estado: Aceptada
Decisores: Equipo VulDetected

## Contexto

El acta del Sprint 2 describe operaciones de negocio ("cambiar de plan", "cancelar
una suscripción"). El código no tiene esas operaciones como rutas con ese nombre:
tiene acciones de servidor, endpoints y páginas. Sin un puente explícito, un
evaluador no puede comprobar que la operación descrita en el acta existe en el
sistema.

## Decisión

El manual de verificación incluye una tabla **"Operación del Sprint 2 vs. ruta
real"** con una fila por operación:

| Operación del acta | Ruta o acción real | Cómo se comprueba |
| ------------------ | ------------------ | ----------------- |

Reglas:

- La equivalencia es **funcional**, no nominal. Si la operación del acta se cumple
  por una acción de servidor y no por una URL, la tabla lo dice y muestra cómo
  llegar.
- Toda fila apunta a una ruta, acción o archivo que existe en el repositorio.
- La tabla se revisa contra el código, no contra la memoria de quien la escribe.

## Consecuencias

- Un evaluador puede recorrer el sistema sin adivinar nombres de rutas.
- Si una operación del acta no tiene equivalente real, la tabla lo deja visible en
  lugar de esconderlo.
- Cuesta mantener la tabla cuando cambien las rutas.

## Alternativas consideradas

- **Renombrar rutas para que coincidan con el acta**: obliga a romper URLs estables
  por razones de presentación. Descartada.
- **No incluir la tabla**: el acta y el código quedan desconectados. Descartada.
