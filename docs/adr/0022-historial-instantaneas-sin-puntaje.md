# ADR 0022: El historial es una serie de instantáneas, no un puntaje compuesto

Fecha: 2026-11-18
Estado: Aceptada
Decisores: Equipo VulDetected

## Contexto

**HU-10** pide un tablero comparativo. La tentación es inventar un "puntaje de
seguridad" de 0 a 100 que suba y baje, porque un número único se ve bien en una
gráfica.

Un puntaje compuesto tiene dos problemas serios:

1. **No es auditable.** Si el número baja, el usuario no puede saber por qué.
2. **Cambia de significado en silencio.** Si mañana cambia la fórmula o el catálogo
   de severidades, todas las series históricas quedan incomparables y nadie se
   entera.

Además, el producto ya tiene un semáforo (verde/amarillo/rojo) con su propia regla,
y redefinirlo para el tablero lo volvería inconsistente con la ficha del escaneo.

## Decisión

1. El semáforo **no se redefine**. Su regla sigue siendo la misma en todas las
   pantallas.
2. El historial son **instantáneas** por escaneo: conteos por severidad, no un
   puntaje compuesto.
3. Solo entran escaneos **comparables**: estado `completed` y `partial = false`.
   Los `failed`, `cancelled` y parciales se excluyen o se muestran como **"no
   comparable"**, nunca como un punto más de la serie.
4. Cada escaneo guarda la **versión del catálogo de severidades** y el **modo de
   escaneo** (`passive`/`active`) con el que se produjo. Una serie que mezcle
   versiones o modos se marca como tal.

## Consecuencias

- La gráfica es honesta: cada punto es un escaneo completo y comparable.
- Cambiar el catálogo o el modo no corrompe el pasado: se ve en los datos.
- El usuario no obtiene un número único "para presumir", obtiene evidencia.
- Cuesta dos columnas y una regla de comparabilidad compartida con las alertas.

## Alternativas consideradas

- **Puntaje compuesto**: bonito, no auditable, y se rompe al primer cambio de
  fórmula. Descartada.
- **Mostrar todos los escaneos en la serie**: un escaneo cancelado a mitad de camino
  parece una mejora. Descartada.
