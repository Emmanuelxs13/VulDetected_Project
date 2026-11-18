# ADR 0021: Datos de demostración marcados, nunca indistinguibles de los reales

Fecha: 2026-11-18
Estado: Aceptada
Decisores: Equipo VulDetected

## Contexto

**HU-10** (CA-10 y CA-29) pide un tablero comparativo de historial.
Un tablero con dos puntos no demuestra nada: hace falta una serie temporal.

Generar seis meses de historial es trivial. El riesgo no es técnico, es de
honestidad: si los datos de demo se ven igual que los reales, cualquier captura
del tablero es una afirmación falsa sobre el producto.

## Decisión

`pnpm demo:seed-history` genera seis meses de historial de demostración con estas
reglas:

- Solo corre con `DEMO_MODE=true`; se niega a ejecutarse en producción.
- Toda fila creada lleva `is_demo = true`.
- La interfaz muestra una insignia visible cuando la serie que se está viendo
  contiene datos de demostración.
- Los datos de demo **no** participan del cálculo de "vulnerabilidad nueva" para
  alertas reales: la comparación usa solo escaneos comparables no-demo.
- El manual de verificación declara, junto a cada captura del tablero, que la serie
  es de demostración.

## Consecuencias

- El tablero se puede mostrar con seis meses de evolución sin mentir.
- El badge es la prueba visible de que el sistema distingue demo de real.
- Un escaneo real sobre el mismo dominio sigue siendo comparable consigo mismo.
- Cuesta una columna, una insignia y una regla de exclusión en las consultas.

## Alternativas consideradas

- **Generar historial sin marca**: la captura sería indistinguible de un producto
  en producción. Descartada.
- **No generar historial**: el tablero se demuestra con dos puntos y no prueba la
  funcionalidad. Descartada.
