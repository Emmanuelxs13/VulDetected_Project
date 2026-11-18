# ADR 0026: Un cierre honesto: "Parcial" con plan, nunca "Listo" por optimismo

Fecha: 2026-11-18
Estado: Aceptada
Decisores: Equipo VulDetected

## Contexto

El Sprint 2 cierra el **20 de noviembre a las 18:00**. La tentación, en la última
semana de un proyecto académico, es marcar como terminado lo que está casi
terminado.

Un criterio marcado "Listo" sin prueba que lo demuestre es peor que un criterio
marcado "Parcial": el segundo dice la verdad y permite planear; el primero
destruye la credibilidad de todo el acta, porque un evaluador que descubre una
sola afirmación falsa deja de creer en las demás.

## Decisión

1. Un criterio solo puede reportarse **"Listo"** cuando existe una prueba con su
   identificador en el nombre que pasa, **y** evidencia manual reproducida en la
   aplicación en ejecución.
2. Veredictos permitidos, sin otros: **Listo**, **Listo con observaciones**,
   **Cumple en modo simulado**, **Parcial**, **No listo**.
3. Lo que no se termine se reporta como **"Parcial"** con: qué falta, un plan
   concreto y una estimación. Nunca se disfraza de "Listo" ni se omite.
4. Ninguna cifra del acta es inventada. Si un dato no se midió, se dice que no se
   midió.
5. Las capturas y los fixtures que no se pudieron revisar se declaran como tales.
6. Lo que es demostración se etiqueta como demostración en el acta, en la pantalla
   y en el manual.

## Consecuencias

- El acta se puede defender línea por línea.
- Un "Parcial" con plan es información útil para el siguiente sprint, no una
  derrota.
- Cuesta más trabajo escribir el plan de lo que falta que escribir "Listo".
- Obliga a medir de verdad lo que el acta afirma que se midió.

## Alternativas consideradas

- **Marcar "Listo" con una nota de pendientes**: es una contradicción en el mismo
  renglón. Descartada.
- **No reportar lo que falta**: el evaluador lo descubre solo, y con peor ánimo.
  Descartada.
