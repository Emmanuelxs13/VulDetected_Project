# ADR 0003: Design tokens y presupuesto de color

- **Estado:** Aceptada
- **Fecha:** Sprint 1

## Contexto

VulDetected presenta hallazgos de seguridad a tres audiencias con preguntas
distintas:

- un **desarrollador** — ¿cuál es la ruta de código vulnerable, qué cambio?
- un **administrador de sistemas** — ¿qué está expuesto, qué parcheo a nivel de
  infraestructura?
- un **propietario de negocio** — ¿qué tan grave es, y cuánto me cuesta?

Leen los mismos datos, de modo que el lenguaje visual debe codificar la severidad
_una sola vez_, correctamente y con legibilidad — incluso para el aproximadamente 1
en 12 hombres con deficiencia en la visión del color que lo va a mirar. La
urgencia además crea un riesgo real: el color de severidad es exactamente el tipo
de señal que se salpica por todos lados hasta que la interfaz es un arcoíris y
nada se lee como urgente.

Tailwind v4 es CSS-first. Los tokens viven en un bloque `@theme` en CSS, se
emiten como custom properties de CSS y las utilidades se derivan de esas
variables. Eso significa que la capa de tokens y la capa de utilidades son la
misma capa — y es precisamente la razón por la que necesita una regla escrita y no
un "use buen gusto".

## Decisión

### 1. Los tokens semánticos se definen una sola vez, en el `@theme` de Tailwind v4

Un único bloque `@theme` en `packages/ui` declara la paleta completa con nombres
semánticos:

- **Superficies** — `background`, `surface`, `surface-raised`, `surface-overlay`
- **Contenido** — `foreground`, `foreground-muted`, `foreground-subtle`
- **Líneas** — `border`, `border-strong`, `border-subtle`
- **Marca** — una rampa `iris` (el acento del producto)
- **Severidad** — `critical`, `high`, `medium`, `low`, `info`

Los componentes consumen **solo** nombres semánticos (`bg-surface`,
`text-foreground-muted`, `border-border`). Los pasos crudos de la paleta
(`bg-slate-800`, `text-zinc-400`) están prohibidos en el código de componentes.
Por qué esto importa concretamente: con referencias crudas a la paleta, un
componente con `bg-slate-800` fijo es correcto en exactamente un tema, de modo
que re-tematizar significa auditar cada componente en lugar de cambiar un bloque
de CSS.

### 2. Sin salpicado de la variante `dark:`

Un prefijo `dark:` en elementos dispersos significa que el tema se decide en el
_lugar de llamada_, por quien escribió ese componente, y así es como ocurren las
UIs a medio tematizar. El tema se decide en la capa de _tokens_.

- Los colores resuelven a variables de CSS que ya llevan el tema.
- Cambiar de tema es una sola clase o un atributo `data-theme` en `<html>`.
- Los tokens mismos llevan valores `light` y `dark`; los componentes nunca
  ramifican.

Re-tematizar cuesta por lo tanto una edición en un solo archivo, y es imposible
que un componente esté a medio tematizar.

### 3. Presupuesto de color

| Categoría                                    | Porción de la superficie visible                  | Notas                                                                                         |
| -------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Neutros** (superficies, contenido, bordes) | **≈95%**                                          | Lo por defecto. Casi toda pantalla es neutra.                                                 |
| **Marca `iris`**                             | **≤3%**                                           | Acciones primarias, anillos de foco, navegación activa. Acento, no relleno.                   |
| **Colores de severidad**                     | **≤2%**, y **solo donde la severidad es el tema** | Nunca decoración. Nunca un lavado de fondo en una tarjeta entera solo porque es "importante". |

"Solo donde la severidad es el tema" es la restricción operativa: una insignia de
hallazgo Crítico tiene color de severidad; un botón en la misma pantalla no, por
importante que se sienta el botón. El color de severidad es un recurso escaso, y
su significado se destruye en el momento en que decora cosas.

### 4. La paleta de severidad reutiliza los pasos 9 y 10 de la escala de Radix

Los colores de severidad se toman de las escalas de Radix en el paso **9**
(bordes, rellenos de íconos, chips) y el paso **10** (el color de texto/
foreground saturado), elegidos para que queden en un contraste de aproximadamente
6:1 contra `background` y `surface` de Radix.

Por qué pasos de Radix y no valores hex elegidos a mano: Radix es la base de las
primitivas de UI, y toda superficie de Radix del producto se deriva de las mismas
escalas de 12 pasos. Tomar los colores de severidad de esas mismas rampas
significa que el par foreground/background viene garantizado de un solo sistema
coherente en lugar de dos. Los pasos 9 y 10 son específicamente los pasos que
Radix mismo usa para bordes y foregrounds sólidos, de modo que heredamos su
disciplina de contraste.

**Esto es una garantía por verificar, no un supuesto.** La aritmética de ratios
de una librería de colores es un punto de partida, no una prueba: lo que importa
es el par _renderizado_ contra la superficie _efectivamente renderizada_, en ambos
temas. El Sprint 1 entrega por lo tanto una prueba automatizada de contraste que
calcula los ratios WCAG de cada token de severidad contra cada token de superficie
donde puede aparecer, en claro y en oscuro. Una violación hace fallar la
compilación. Asumir el contraste y descubrirlo después en producción es el modo
de fallo que esta regla existe para prevenir.

### 5. Nunca solo color (WCAG 1.4.1)

Cada insignia de severidad lleva **tres** canales redundantes:

- **color** — el tono de la severidad,
- **ícono** — un glifo distinto por severidad (triángulo relleno, triángulo de
  advertencia, escudo, círculo de información),
- **texto** — la palabra de la severidad misma (`Critical`, `High`, `Medium`,
  `Low`, `Info`).

Quite cualquiera de los canales y aun así se lee correctamente. Consecuencias: la
severidad sobrevive al daltonismo, sobrevive a la impresión en monocromo y a la
degradación de capturas de pantalla, y sobrevive a la busquedad con grep y al
anuncio de los lectores de pantalla. El texto es innegociable — `bg-red-500` sin
etiqueta no comunica nada a un lector de pantalla.

## Consecuencias

**Beneficios aceptados**

- Una sola edición re-tematiza todo el producto.
- El color de severidad es consistente en toda la UI, y eso es lo que lo vuelve
  aprendible — un usuario que aprende "ámbar significa Medium" en el panel lo
  lee correctamente en una página de detalle de hallazgo.
- La accesibilidad la hace cumplir una prueba en lugar de revisarla a ojo, en
  ambos temas.
- Las pantallas se mantienen tranquilas: una superficie 95% neutra mantiene
  significativos los pocos elementos con color.

**Costos aceptados**

- La nomenclatura semántica es más verbosa que los pasos crudos de la paleta.
  `text-foreground-muted` es más largo que `text-zinc-400`. Se aplica con una
  regla de ESLint, porque una regla que nadie aplica es una preferencia.
- El tematizado queda limitado a la paridad claro/oscuro. Variaciones de tema a
  mitad de vuelo requieren tokens semánticos nuevos en lugar de una clase de
  utilidad única — deliberadamente más lento, porque la alternativa es que
  vuelva el problema del `dark:` disperso.
- La prueba de contraste es un costo real: cada token semántico nuevo debe
  declarar las superficies donde puede aparecer, o la prueba no sabe qué
  verificar. Tokens nuevos implican una actualización deliberada de la prueba.
- Los pasos 9/10 pueden necesitar ajuste por severidad una vez que existan
  componentes reales. La regla es el origen del ajuste, y la prueba es cómo se
  valida.

## Alternativas consideradas

### Tematizado utility-first con variantes `dark:` por componente

Rechazada. Decisión en el lugar de llamada; los bugs de tema se vuelven bugs de
componente; auditar cada componente en cada cambio de tema. Ése es el modo de
fallo por defecto y es exactamente lo que prohíbe la regla 2.

### Tematizado CSS-in-JS en tiempo de ejecución (p. ej. un theme provider con valores computados)

Rechazada. Mueve la fuente de verdad de los tokens fuera de CSS hacia
JavaScript, lo que significa que el sistema de diseño solo es visible cuando la
app arranca. Eso hace más difíciles las pruebas de regresión visual, la
consistencia del SSR y la documentación estática de la paleta, sin ninguna
ganancia, dado que Tailwind v4 ya resuelve los tokens a variables de CSS.

### Una paleta de marca más grande

Rechazada. Más colores de marca no crean una marca más fuerte; la diluyen y
vuelven inalcanzable el presupuesto de ≤3%. Una sola rampa de acento, usada con
parcimonia, es más fuerte que cinco usadas en todos lados.

### Colores de severidad fuera de las rampas de Radix

Rechazada por las razones de la regla 4: dos sistemas de color que coexisten
invitan a casi-aciertos que pasan un vistazo casual y fallan una auditoría. Los
cambios de menos de un segundo por severidad valen menos que una relación
garantizada de un solo sistema.

### Solo íconos, sin color

Rechazada como único canal. Los íconos solos son ambiguos de un vistazo — un
triángulo es "advertencia" pero no "qué tan malo". Ícono más texto más color es
redundante a propósito; la redundancia es la estrategia de accesibilidad.
