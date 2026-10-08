# ADR 0003: Design tokens and color budget

- **Status:** Accepted
- **Date:** Sprint 1

## Context

VulDetected presents security findings to three audiences with different
questions:

- a **developer** — what is the vulnerable code path, what do I change?
- a **sysadmin** — what is exposed, what do I patch at the infrastructure level?
- a **business owner** — how bad is it, and what does it cost me?

They read the same data, so the visual language has to encode severity _once_,
correctly, and legibly — including for the roughly 1 in 12 men with a color
vision deficiency who will be looking at it. Urgency also creates a real risk:
severity color is exactly the kind of signal that gets sprinkled around until the
interface is a rainbow and nothing reads as urgent anymore.

Tailwind v4 is CSS-first. Tokens live in a `@theme` block in CSS, are emitted as
CSS custom properties, and utilities derive from those variables. That means the
token layer and the utility layer are the same layer — which is precisely why it
needs a written rule rather than "be tasteful."

## Decision

### 1. Semantic tokens are defined once, in Tailwind v4 `@theme`

A single `@theme` block in `packages/ui` declares the whole palette as semantic
names:

- **Surfaces** — `background`, `surface`, `surface-raised`, `surface-overlay`
- **Content** — `foreground`, `foreground-muted`, `foreground-subtle`
- **Lines** — `border`, `border-strong`, `border-subtle`
- **Brand** — one `iris` ramp (the product accent)
- **Severity** — `critical`, `high`, `medium`, `low`, `info`

Components consume **only** semantic names (`bg-surface`, `text-foreground-muted`,
`border-border`). Raw palette steps (`bg-slate-800`, `text-zinc-400`) are banned
in component code. Why this matters concretely: with raw palette references, a
component that hardcodes `bg-slate-800` is correct in exactly one theme, so
re-theming means auditing every component instead of changing one block of CSS.

### 2. No `dark:` variant sprinkling

A `dark:` prefix on scattered elements means theme is decided at the _call site_,
by whoever wrote that component, which is how half-themed UIs happen. Theme is
decided at the _token_ layer.

- Colors resolve to CSS variables that already carry the theme.
- Theme switching is a single class or `data-theme` attribute on `<html>`.
- Tokens themselves carry `light` and `dark` values; components never branch.

Re-theming therefore costs one edit in one file, and it is impossible for a
component to be half-themed.

### 3. Color budget

| Category                                  | Share of visible surface                            | Notes                                                                                     |
| ----------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Neutrals** (surfaces, content, borders) | **≈95%**                                            | The default. Nearly every screen is neutral.                                              |
| **Brand `iris`**                          | **≤3%**                                             | Primary actions, focus rings, active nav. Accent, not fill.                               |
| **Severity colors**                       | **≤2%**, and **only where severity is the subject** | Never decoration. Never a background wash on a whole card just because it is "important". |

"Only where severity is the subject" is the operative constraint: a Critical
finding badge is severity-colored; a button on the same screen is not, no matter
how important the button feels. Severity color is a scarce resource, and its
meaning is destroyed the moment it decorates things.

### 4. Severity palette reuses Radix scale steps 9 and 10

Severity colors are drawn from the Radix scales at step **9** (borders, icon
fills, chips) and step **10** (the saturated foreground/text color), chosen so
they sit at roughly 6:1 contrast against Radix `background` and `surface`.

Why Radix steps rather than hand-picked hex values: Radix is the base of the UI
primitives, and every Radix surface in the product derives from the same 12-step
scales. Pulling severity colors from those same ramps means the foreground/background
pair is guaranteed to come from one coherent system instead of two. Step 9/10 are
specifically the steps Radix itself uses for borders and solid foregrounds, so
we inherit its contrast discipline.

**This is a guarantee to be verified, not an assumption.** Ratio math from a color
library is a starting point, not proof: what matters is the _rendered_ pair
against the _actual_ rendered surface, in both themes. Sprint 1 therefore ships an
automated contrast test that computes WCAG ratios for every severity token against
every surface token it can appear on, in light and dark. A violation fails the
build. Assuming contrast and then discovering it in production is the failure mode
this rule exists to prevent.

### 5. Never color-only (WCAG 1.4.1)

Every severity badge carries **three** redundant channels:

- **color** — the severity hue,
- **icon** — a distinct glyph per severity (filled triangle, warning triangle,
  shield, info circle),
- **text** — the severity word itself (`Critical`, `High`, `Medium`, `Low`,
  `Info`).

Drop any one channel and it still reads correctly. Consequences: severity survives
color-blindness, survives monochrome printing and screenshot degradation, and
survives grep-ability and screen-reader announcement. Text is non-negotiable —
`bg-red-500` with no label communicates nothing to a screen reader.

## Consequences

**Accepted benefits**

- One edit re-themes the entire product.
- Severity color is consistent across the whole UI, which is what makes it
  learnable — a user who learns "amber means Medium" in the dashboard reads it
  correctly on a finding detail page.
- Accessibility is enforced by a test instead of reviewed by eye, in both themes.
- Screens stay calm: a 95%-neutral surface keeps the few colored elements
  meaningful.

**Accepted costs**

- Semantic naming is more verbose than raw palette steps. `text-foreground-muted`
  is longer than `text-zinc-400`. Enforced with an ESLint rule, because a rule
  nobody enforces is a preference.
- Theming is constrained to light/dark parity. Mid-flight theme variations
  require new semantic tokens rather than a one-off utility class — deliberately
  slower, because the alternative is the scattered `dark:` problem returning.
- The contrast test is a real cost: every new semantic token must declare the
  surfaces it may appear on, or the test cannot know what to check. New tokens
  mean a deliberate test update.
- Step 9/10 may need per-severity adjustment once real components exist. The
  rule is the source of the adjustment, and the test is how it is validated.

## Alternatives considered

### Utility-first theming with `dark:` variants per component

Rejected. Decision at the call site; theme bugs become component bugs; auditing
every component for every theme change. This is the default failure mode and it is
exactly what rule 2 forbids.

### Runtime CSS-in-JS theming (e.g. a theme provider with computed values)

Rejected. It moves the token source of truth out of CSS into JavaScript, which
means the design system is only visible when the app boots. That makes visual
regression tests, SSR consistency, and static documentation of the palette all
harder for no gain, given Tailwind v4 already resolves tokens to CSS variables.

### A larger brand palette

Rejected. More brand colors do not create a stronger brand; they dilute it and
make the ≤3% budget unachievable. One accent ramp, used sparingly, is stronger
than five used everywhere.

### Severity colors outside the Radix ramps

Rejected for the reasons in rule 4: two coexisting color systems invite
near-misses that pass a casual eye and fail an audit. Sub-second changes per
severity are worth less than a guaranteed, single-system relationship.

### Icons alone, without color

Rejected as the sole channel. Icons alone are ambiguous at a glance — a triangle
is "warning" but not "how bad". Icons plus text plus color is redundant on
purpose; redundancy is the accessibility strategy.
