# ADR 0023: Qué significa "vulnerabilidad nueva" y cómo se entrega la alerta

Fecha: 2026-11-18
Estado: Aceptada
Decisores: Equipo VulDetected

## Contexto

**HU-07** (CA-23, CA-24, CA-25) pide escaneos programados y alertas cuando aparece
una vulnerabilidad nueva. La palabra "nueva" parece obvia y no lo es: si se define
mal, la alerta se convierte en ruido y el usuario deja de leerla.

Hay al menos cuatro definiciones posibles y cada una produce un producto distinto:

- Cualquier hallazgo crítico del escaneo.
- Cualquier hallazgo que no estuviera en el escaneo anterior, sin importar su estado.
- Cualquier huella (fingerprint) que no esté entre los hallazgos **activos** del
  escaneo comparable anterior.
- Cualquier hallazgo creado en el escaneo actual.

## Decisión

**"Nueva" = la huella del hallazgo no está entre los hallazgos abiertos del
escaneo comparable anterior.**

Consecuencias de esa definición:

- Un hallazgo que el usuario marcó **Resuelto** y reaparece **sí es nuevo**. Es
  exactamente la regresión que el producto existe para detectar.
- Un hallazgo que ya estaba abierto no vuelve a alertar en cada ejecución.
- El escaneo de referencia es el último `completed` con `partial = false` del mismo
  dominio. Un escaneo cancelado o parcial nunca es referencia.

Reglas de operación:

- Umbral por defecto: **Critical**. El umbral es una constante con ranking, de modo
  que bajarlo sea un cambio de dato y no una reescritura.
- La alerta se **encola al cerrar el escaneo** y se entrega en **menos de 60
  segundos**, medido y registrado en el manual.
- Ventanas perdidas **colapsan en una sola ejecución**: si el planificador estuvo
  caído tres días, al volver corre un escaneo, no tres.
- Solapamiento: si el dominio ya tiene un escaneo en cola o corriendo, la ventana se
  **omite** (no se encola) y se consume, para no duplicar carga sobre el objetivo.
- La zona horaria del producto es **America/Bogotá** para toda presentación de
  fechas de programación.

## Consecuencias

- La alerta significa algo: "apareció algo que no tenías abierto".
- Una reaparición después de Resuelto vuelve a alertar.
- El planificador puede omitir ventanas sin perder la cadencia.
- Cuesta un umbral configurable por programación (`alert_on_new_critical`) y la
  regla de comparabilidad compartida con el historial.

## Alternativas consideradas

- **Alertar por cualquier crítico**: el mismo correo en cada ejecución hasta que el
  usuario lo ignore. Descartada.
- **Comparar contra todos los hallazgos históricos**: una reaparición se vuelve
  invisible. Descartada.
