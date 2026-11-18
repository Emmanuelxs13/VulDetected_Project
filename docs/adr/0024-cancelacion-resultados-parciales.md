# ADR 0024: Cancelar un escaneo conserva los resultados parciales, marcados como parciales

Fecha: 2026-11-18
Estado: Aceptada
Decisores: Equipo VulDetected

## Contexto

**HU-06** (CA-20, CA-21, CA-22, CA-12) pide poder cancelar un escaneo, que el
trabajador se detenga y que el usuario reciba un correo.

La implementación previa tenía un defecto silencioso: al cancelar, la acción
escribía `cancelled` primero, y la llamada de retorno del trabajador se negaba a
tocar una fila cancelada. Resultado: **todo lo que el trabajador ya había
encontrado se descartaba**. El usuario cancelaba y perdía el trabajo hecho.

Conservar esos hallazgos tiene un riesgo simétrico: un escaneo interrumpido no es
una pasada completa sobre el objetivo. Si entra al historial como si lo fuera,
"cancelar" se convierte en una forma de mejorar la gráfica.

## Decisión

1. La cancelación se permite en **cola y en ejecución**. En estado terminal, se
   rechaza.
2. El trabajador se detiene en **≤ 10 segundos**, medido y registrado en el manual.
3. Los hallazgos ya producidos **se conservan**.
4. La fila mantiene su estado de ciclo de vida (`cancelled`) y además lleva
   `partial = true`. **No** se agrega un sexto estado: `partial` es una propiedad de
   comparabilidad, no una etapa del ciclo de vida.
5. `partial = true` se calcula de dos formas: cancelación (siempre parcial) y
   ejecución incompleta (`checks_run` menor que `checks`).
6. Toda consulta de comparación (historial, tendencia, línea base de "vulnerabilidad
   nueva", semáforo) **excluye** las filas parciales.
7. La pantalla del escaneo muestra una insignia "Parcial" y **oculta el semáforo**,
   porque un semáforo sobre una pasada incompleta es una afirmación que no se
   sostiene.
8. El correo de cancelación se encola desde la **acción de cancelar** — el único
   camino que produce un escaneo cancelado — y no desde la llamada de retorno. Así
   funciona también para un escaneo en cola que nunca llegó a ejecutarse, y no puede
   enviarse dos veces.

## Consecuencias

- Cancelar no destruye trabajo hecho.
- Cancelar no altera el historial ni las alertas.
- El correo es determinista y no depende de que el trabajador responda.
- Cuesta una columna, una insignia y un filtro en cada consulta de comparación.

## Alternativas consideradas

- **Descartar los hallazgos al cancelar**: es lo que había; destruye trabajo del
  usuario. Descartada.
- **Agregar un estado `partial` al enum**: confunde ciclo de vida con
  comparabilidad, y obliga a revisar cada transición de estado. Descartada.
