/**
 * Automated contrast verification for the severity palette.
 *
 * This is the automated check ADR 0003 §4 requires: "This is a guarantee to be
 * verified, not an assumption." Ratio maths from a colour library is a starting
 * point; what matters is the severity step against the surface it is actually
 * rendered on, in both themes.
 *
 * It intentionally does NOT assert or throw. It produces a report; a unit test
 * that fails the build on a violation is still pending (see README).
 */

export type SeverityKey = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown';

export type ThemeName = 'light' | 'dark';

/** Severity steps per theme — mirrors the `--color-<severity>` tokens. */
export const SEVERITY_ON_SURFACE: Readonly<
  Record<SeverityKey, Readonly<Record<ThemeName, string>>>
> = {
  critical: { light: '#E5484D', dark: '#E93D42' },
  high: { light: '#F76808', dark: '#F76B15' },
  medium: { light: '#FFB224', dark: '#F5A623' },
  low: { light: '#46A758', dark: '#3B9A4D' },
  info: { light: '#0091FF', dark: '#0587E0' },
  unknown: { light: '#6E7887', dark: '#6E7887' },
};

/** Surfaces a severity badge or alert can be rendered on — mirrors tokens.css. */
export const SURFACES: Readonly<
  Record<ThemeName, Readonly<Record<'surface' | 'surface-raised' | 'bg', string>>>
> = {
  light: { surface: '#F7F8FA', 'surface-raised': '#FFFFFF', bg: '#FFFFFF' },
  dark: { surface: '#171B21', 'surface-raised': '#272D36', bg: '#0E1116' },
};

/** WCAG 2.1 minimum contrast ratios. */
export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;

/** WCAG 2.1 §1.4.3 relative luminance of an sRGB colour. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 2.1 §1.4.3 contrast ratio between two sRGB colours, 1 → 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastReportEntry {
  /** Human-readable pair, e.g. `critical / surface (dark)`. */
  pair: string;
  severity: SeverityKey;
  theme: ThemeName;
  surface: 'surface' | 'surface-raised' | 'bg';
  foreground: string;
  background: string;
  /** Ratio rounded to two decimals. */
  ratio: number;
  /** WCAG 2.1 AA for normal text (>= 4.5). */
  passesAA: boolean;
  /** WCAG 2.1 AA for large text and non-text contrast (>= 3). */
  passesAALarge: boolean;
}

/**
 * Every severity step against every surface it can appear on, in both themes.
 *
 * Callers that want a build gate should assert on `passesAA`; this function
 * itself only reports.
 */
export function assertSeverityContrast(): ContrastReportEntry[] {
  const report: ContrastReportEntry[] = [];

  for (const severity of Object.keys(SEVERITY_ON_SURFACE) as SeverityKey[]) {
    for (const theme of Object.keys(SURFACES) as ThemeName[]) {
      const foreground = SEVERITY_ON_SURFACE[severity][theme];
      const surfaces = SURFACES[theme];

      for (const surface of Object.keys(surfaces) as (keyof typeof surfaces)[]) {
        const background = surfaces[surface];
        const ratio = round(contrastRatio(foreground, background));

        report.push({
          pair: `${severity} / ${surface} (${theme})`,
          severity,
          theme,
          surface,
          foreground,
          background,
          ratio,
          passesAA: ratio >= AA_NORMAL_TEXT,
          passesAALarge: ratio >= AA_LARGE_TEXT,
        });
      }
    }
  }

  return report;
}

/** Human-readable one-liner for a report row. */
export function describeContrast(entry: ContrastReportEntry): string {
  return `${entry.pair}: ${entry.ratio.toFixed(2)}:1 — AA ${entry.passesAA ? 'pass' : 'FAIL'}, AA-large ${
    entry.passesAALarge ? 'pass' : 'FAIL'
  }`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.trim().replace(/^#/, '');
  const short = /^([\da-f])([\da-f])([\da-f])$/i.exec(normalized);
  const full = /^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(normalized);

  const parts = full
    ? [full[1], full[2], full[3]]
    : short
      ? [short[1], short[2], short[3]].map((part) => `${part}${part}`)
      : null;

  if (!parts) {
    throw new TypeError(`Expected a hex colour like #E5484D or #E54, received: ${hex}`);
  }

  return {
    r: Number.parseInt(parts[0] ?? '', 16),
    g: Number.parseInt(parts[1] ?? '', 16),
    b: Number.parseInt(parts[2] ?? '', 16),
  };
}
