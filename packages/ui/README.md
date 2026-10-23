# `@vuldetected/ui`

Sistema de diseño de VulDetected: tokens CSS-first de Tailwind CSS v4 más primitivos basados en Radix. Paquete de exportación de código fuente — **sin paso de compilación**; la aplicación consumidora transpila el TypeScript directamente.

Decisión de enlace: [`docs/adr/0003`](../../docs/adr/0003-design-tokens-and-color-budget.md).
Si un componente y ADR 0003 entran en contradicción, prevalece ADR 0003.

---

## Contrato de tokens

Todos los colores del producto se declaran exactamente una vez, en
[`src/styles/tokens.css`](./src/styles/tokens.css), con un nombre semántico.

**Tres reglas, en orden de importancia:**

1. **Los componentes solo hacen referencia a nombres semánticos.** `bg-surface`, `text-text-muted`,
   `border-border`, `bg-critical`. Un paso de rampa en bruto (`bg-ink-900`) o un valor hexadecimal en un componente es un defecto, no una elección de estilo.
2. **Sin variante `dark:`, en ninguna parte.** El tema se decide a nivel de tokens. No hay clases `dark:` en `src/components`, y añadirlas destruye todo el sistema:
   cambiar de tema pasaría a costar una auditoría de todos los componentes en lugar de una única edición.
3. **Ningún componente puede tener codificado un valor hexadecimal.** Los colores residen en `tokens.css`. Si realmente se necesita un nuevo color, se añade un token allí y se registra el motivo.

### Cómo funciona el cambio de tema

`tokens.css` utiliza `color-scheme` + `light-dark()` de CSS. Cada token semántico contiene ambos temas en una única declaración:

```css
--color-surface: light-dark(var(--color-ink-50), var(--color-ink-900));
```

`light-dark()` resuelve a su segundo argumento cuando el `color-scheme` utilizado es `dark`, y `color-scheme` se controla mediante un único selector:

| `<html>`             | `color-scheme` resuelto |
| -------------------- | ----------------------- |
| `data-theme="dark"`  | `dark` (explícito)      |
| `data-theme="light"` | `light` (explícito)     |
| atributo ausente     | `prefers-color-scheme`  |

Dado que el selector es `color-scheme`, los controles nativos del navegador,
las barras de desplazamiento y el comportamiento de `<canvas>` siguen el tema automáticamente.

La aplicación cambia ese atributo; el sistema de diseño nunca hace ramificaciones.

### Tokens semánticos disponibles para los componentes

| Grupo       | Tokens                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| Superficies | `bg`, `surface`, `surface-raised`, `surface-overlay`                                    |
| Contenido   | `text`, `text-muted`, `text-subtle`, `text-on-solid`, `text-on-brand`                   |
| Líneas      | `border`, `border-strong`, `border-subtle`                                              |
| Marca       | `brand` (iris-500), `brand-strong` (iris-600), `brand-subtle` (iris-300), `brand-tint`  |
| Severidad   | `critical`, `high`, `medium`, `low`, `info`, `unknown` — cada uno con su par `-tint`    |
| Rampas      | `ink-50…950`, `iris-300…700` y cada `-strong` de severidad                              |
| Tipografía  | `font-sans` / `font-mono` (Geist, proporcionado por `apps/web` a través de `next/font`) |

Utilidades: `.tabular` (figuras tabulares para columnas numéricas) y `.focus-ring`
(2px de `outline` con desplazamiento de 2px, dibujado _fuera_ del control para que siga visible sobre un relleno del mismo tono). La capa base también establece los valores por defecto de `border-color`, `::selection`, barras de desplazamiento y un bloque para `prefers-reduced-motion` que elimina transiciones y animaciones.

**Espaciado:** paso de 4px de Tailwind, organizado en ritmo de 8px (8 / 16 / 24 / 32 / 48). Las filas de tabla y las alturas de los botones se fijan a 32 / 36 / 40px.

---

## Consumo desde `apps/web`

1. Importar la hoja de estilos **una sola vez**, desde el CSS global o raíz de la aplicación:

   ```css
   /* apps/web/src/app/globals.css */
   @import '@vuldetected/ui/styles.css';
   ```

   `styles.css` ya contiene `@import 'tailwindcss'`, por lo que **no** debe importarse
   `tailwindcss` de nuevo en la aplicación — de lo contrario se producen preflight duplicados y variables de tema duplicadas.

2. Registrar el paquete como fuente de nombres de clases. Este paquete ya incluye
   `@source "../components/**/*.{ts,tsx}"` dentro de `styles.css`, lo que se resuelve relativo a la hoja de estilos, por lo que normalmente **no** es necesario ningún paso adicional. Si la aplicación compila CSS desde una ubicación distinta, registre la ruta explícitamente:

   ```css
   @source '../../../../packages/ui/src';
   ```

   Esto es importante: **Tailwind v4 no analiza `node_modules` por defecto.** Sin una fuente registrada, todas las clases de este paquete se eliminan silenciosamente durante la compilación y la aplicación muestra primitivos sin estilos — no aparece ningún error, solo CSS ausente. Verifique comprobando que existe una regla `bg-surface-raised` en la hoja de estilos compilada.

3. Añadir `"@vuldetected/ui": "workspace:*"` a las dependencias de la aplicación y asegurarse de que Next.js transpile el paquete (los workspaces están enlazados por symlink en `node_modules`, por lo que `transpilePackages: ['@vuldetected/ui']` es necesario para las fuentes `.tsx` que siguen las reglas de módulos de Node).

4. Importar los componentes por nombre — sin importaciones profundas:

   ```tsx
   import { Badge, Button, Card, Table } from '@vuldetected/ui';
   ```

---

## Severidad y la comprobación de contraste pendiente

`src/lib/contrast.ts` implementa `relativeLuminance()` y `contrastRatio()` de WCAG 2.1,
el mapa `SEVERITY_ON_SURFACE` y `assertSeverityContrast()` — un informe sobre cada paso de severidad frente a cada superficie en la que puede renderizarse, en ambos temas.

**Esto es la comprobación automatizada de contraste que requiere ADR 0003 §4, y la prueba unitaria que debe hacer fallar la compilación ante una violación aún está pendiente.** La utilidad solo informa; nunca afirma ni lanza excepciones.

Valores medidos actualmente, con la paleta fijada:

- El tono de severidad **como texto** no cumple AA de WCAG en el tema claro para las seis severidades (peor: `medium` con 1,70:1 sobre `surface`);
- El mismo tono **como color de icono o borde** supera la barra de 3:1 para contenido no textual en el tema oscuro, pero `high` (2,85:1), `low` (2,85:1) y `medium` (1,70:1) no la superan sobre `surface` en el tema claro.

Por ello, los componentes mantienen **la palabra de severidad con `--color-text`** (16:1) y aplican el tono al icono, al borde y a un tinte del 12 %. La severidad sigue codificándose de tres formas (color, glifo distinto y palabra), de modo que el tono es un canal redundante y no es el que transmite el significado. Cerrar la brecha restante para contenido no textual requiere un ajuste por severidad de la paleta fijada — decisión del propietario, registrada en `docs/decisions-pending.md`, no algo que pueda corregir un componente.

---

## Inventario de componentes

`Alert` · `Badge` · `Button` · `Card` (+ header/title/description/content/footer) ·
`Container` · `EmptyState` · `Field` · `Input` · `Label` · `Progress` · `Skeleton` ·
`Spinner` · `Table` (+ header/body/row/head/cell/caption) · `Textarea` ·
iconos de severidad y de estado.

Convenciones que se aplican a todos ellos:

- React 19: `ref` es una propiedad normal; no se utiliza `forwardRef`.
- Todos los componentes propagan el resto de propiedades al elemento DOM correspondiente.
- `className` se combina con `cn()` (`clsx` + `tailwind-merge`), de modo que una utilidad indicada en la llamada tiene prioridad sobre una variante.
- Las APIs de variantes son `class-variance-authority` y se exportan
  (`buttonVariants`, `badgeVariants`, …) para componer nuevos primitivos.
- `Badge` siempre muestra un glifo distinto **y** la palabra de severidad — no existe un modo solo con icono (WCAG 1.4.1, ADR 0003 §5).
- `Progress` es únicamente determinado; el trabajo de duración desconocida utiliza `Spinner`/`Skeleton`.
  La arquitectura prohíbe el progreso falso.
- Sin degradados, sin `backdrop-blur`, sin sombras proyectadas. La elevación se representa mediante un borde más un paso de superficie.
