# `@vuldetected/ui`

The VulDetected design system: Tailwind CSS v4 CSS-first tokens plus Radix-based
primitives. Source-export package — there is **no build step**; the consuming app
transpiles the TypeScript directly.

Binding decision: [`docs/adr/0003`](../../docs/adr/0003-design-tokens-and-color-budget.md).
If a component and ADR 0003 disagree, ADR 0003 wins.

---

## The token contract

Every colour in the product is declared exactly once, in
[`src/styles/tokens.css`](./src/styles/tokens.css), under a semantic name.

**Three rules, in order of importance:**

1. **Components reference semantic names only.** `bg-surface`, `text-text-muted`,
   `border-border`, `bg-critical`. A raw ramp step (`bg-ink-900`) or a hex literal
   in a component is a defect, not a style choice.
2. **No `dark:` variant, anywhere.** Theme is decided at the token layer. There is
   no `dark:` class in `src/components`, and adding one defeats the whole system:
   re-theming then costs an audit of every component instead of one edit.
3. **No component may hardcode a hex value.** Colours live in tokens.css. If a new
   colour is genuinely needed, add a token there and record why.

### How theme switching works

`tokens.css` uses CSS `color-scheme` + `light-dark()`. Every semantic token
carries both themes in one declaration:

```css
--color-surface: light-dark(var(--color-ink-50), var(--color-ink-900));
```

`light-dark()` resolves to its second argument when the used `color-scheme` is
`dark`, and `color-scheme` is driven by exactly one switch:

| `<html>`             | resolved `color-scheme` |
| -------------------- | ----------------------- |
| `data-theme="dark"`  | `dark` (explicit)       |
| `data-theme="light"` | `light` (explicit)      |
| attribute absent     | `prefers-color-scheme`  |

Because the switch is `color-scheme`, the browser's native form controls,
scrollbars and `<canvas>` behaviour follow the theme for free.

The app toggles the attribute; the design system never branches.

### Semantic tokens available to components

| Group      | Tokens                                                                                 |
| ---------- | -------------------------------------------------------------------------------------- |
| Surfaces   | `bg`, `surface`, `surface-raised`, `surface-overlay`                                   |
| Content    | `text`, `text-muted`, `text-subtle`, `text-on-solid`, `text-on-brand`                  |
| Lines      | `border`, `border-strong`, `border-subtle`                                             |
| Brand      | `brand` (iris-500), `brand-strong` (iris-600), `brand-subtle` (iris-300), `brand-tint` |
| Severity   | `critical`, `high`, `medium`, `low`, `info`, `unknown` — each with a `-tint` pair      |
| Ramps      | `ink-50…950`, `iris-300…700`, and each severity's `-strong` step                       |
| Typography | `font-sans` / `font-mono` (Geist, supplied by `apps/web` through `next/font`)          |

Utilities: `.tabular` (tabular figures for numeric columns) and `.focus-ring`
(2px `outline` at 2px offset, drawn _outside_ the control so it stays visible on
a same-hue fill). Base layer also sets `border-color` defaults, `::selection`,
scrollbars, and a `prefers-reduced-motion` block that removes transitions and
animations.

**Spacing:** the 4px Tailwind step, laid out on the 8px rhythm (8 / 16 / 24 / 32 /
48). Table rows and button heights are locked to 32 / 36 / 40px.

---

## Consuming from `apps/web`

1. Import the stylesheet **once**, from the app's root/global CSS:

   ```css
   /* apps/web/src/app/globals.css */
   @import '@vuldetected/ui/styles.css';
   ```

   `styles.css` already contains `@import 'tailwindcss'`, so do **not** import
   `tailwindcss` a second time in the app — duplicate preflight and duplicate
   theme variables are the result.

2. Register the package as a source of class names. This package already ships
   `@source "../components/**/*.{ts,tsx}"` inside `styles.css`, which resolves
   relative to the stylesheet, so this normally needs **no** extra step. If the
   app compiles CSS from a different location, register the path explicitly:

   ```css
   @source '../../../../packages/ui/src';
   ```

   This matters: **Tailwind v4 does not scan `node_modules` by default.** Without
   a registered source, every class in this package compiles away silently and
   the app renders unstyled primitives — no error, just missing CSS. Verify by
   checking that a `bg-surface-raised` rule exists in the built stylesheet.

3. Add `"@vuldetected/ui": "workspace:*"` to the app's dependencies, and make
   sure Next.js transpiles it (workspaces are symlinked into `node_modules`, so
   `transpilePackages: ['@vuldetected/ui']` is required for `.tsx` sources under
   Node's module rules).

4. Import components by name — no deep imports:

   ```tsx
   import { Badge, Button, Card, Table } from '@vuldetected/ui';
   ```

---

## Severity, and the contrast check that is still pending

`src/lib/contrast.ts` implements WCAG 2.1 `relativeLuminance()` and
`contrastRatio()`, the `SEVERITY_ON_SURFACE` map, and
`assertSeverityContrast()` — a report over every severity step against every
surface it can be rendered on, in both themes.

**This is the automated contrast check ADR 0003 §4 requires, and the unit test
that fails the build on a violation is still pending.** The utility itself only
reports; it never asserts and never throws.

Measured today, with the pinned palette:

- severity hue **as text** fails WCAG AA in the light theme for all six
  severities (worst: `medium` at 1.70:1 on `surface`);
- the same hues **as icon/border colour** clear the 3:1 non-text bar in the dark
  theme, but `high` (2.85:1), `low` (2.85:1) and `medium` (1.70:1) do not clear it
  on the light `surface`.

The components therefore keep the **severity word in `--color-text`** (16:1) and
carry the hue on the icon, the border and a 12% tint. Severity is still encoded
three times (colour, distinct glyph, word), so the hue is a redundant channel and
not the one carrying the meaning. Closing the remaining non-text gap needs a
per-severity adjustment to the pinned palette — an owner decision, tracked in
`docs/decisions-pending.md`, not something a component can fix.

---

## Component inventory

`Alert` · `Badge` · `Button` · `Card` (+ header/title/description/content/footer) ·
`Container` · `EmptyState` · `Field` · `Input` · `Label` · `Progress` · `Skeleton` ·
`Spinner` · `Table` (+ header/body/row/head/cell/caption) · `Textarea` ·
severity and status icons.

Conventions that hold for all of them:

- React 19: `ref` is an ordinary prop; no `forwardRef`.
- Every component spreads the remaining props onto its DOM element.
- `className` is merged with `cn()` (`clsx` + `tailwind-merge`), so a call-site
  utility wins over a variant.
- Variant APIs are `class-variance-authority` and are exported
  (`buttonVariants`, `badgeVariants`, …) for composing new primitives.
- `Badge` always renders a distinct glyph **and** the severity word — there is no
  icon-only mode (WCAG 1.4.1, ADR 0003 §5).
- `Progress` is determinate only; unknown-duration work uses `Spinner`/`Skeleton`.
  The architecture forbids fake progress.
- No gradients, no `backdrop-blur`, no drop shadows. Elevation is a border plus a
  surface step.
