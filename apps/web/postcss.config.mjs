/**
 * Tailwind CSS v4 via the dedicated PostCSS plugin.
 *
 * There is no `tailwind.config.js` in this project by design: the theme lives in
 * `@vuldetected/ui`'s `styles.css` (`@theme static`), so the design system's
 * tokens are the single source of truth and a JS config could only drift from
 * them. See `docs/adr/0003-design-tokens-and-color-budget.md`.
 *
 * `globals.css` imports `@tailwindcss/postcss`'s own stylesheet only through
 * `packages/ui`, so this plugin must never be given a second `tailwindcss`
 * import — duplicate preflight, duplicate theme variables.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
