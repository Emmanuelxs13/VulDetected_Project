import type { ReactElement, SVGProps } from 'react';

/**
 * Severity and status glyphs.
 *
 * ADR 0003 §5 (never color-only): every severity is encoded three times —
 * colour, a *distinct shape*, and the severity word. The shapes below are the
 * second channel: octagon (critical), triangle (high), diamond (medium),
 * circle (low), rounded square (info), dashed circle (unknown). They differ in
 * silhouette, so they survive color-vision deficiency and monochrome output.
 *
 * All glyphs are decorative here (`aria-hidden`): the accompanying text label is
 * what a screen reader announces.
 */

export type SeverityIconName =
  'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown' | 'neutral';

const GLYPH_BASE = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

type GlyphProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

export function OctagonExclamationIcon(props: GlyphProps) {
  return (
    <svg {...GLYPH_BASE} aria-hidden focusable={false} {...props}>
      <path d="M5.4 1.6h5.2L14.4 5.4v5.2l-3.8 3.8H5.4l-3.8-3.8V5.4z" />
      <path d="M8 4.7v4" />
      <path d="M8 11.3h.01" />
    </svg>
  );
}

export function TriangleExclamationIcon(props: GlyphProps) {
  return (
    <svg {...GLYPH_BASE} aria-hidden focusable={false} {...props}>
      <path d="M8 1.9 14.7 13.5H1.3z" />
      <path d="M8 6.2v3.4" />
      <path d="M8 11.6h.01" />
    </svg>
  );
}

export function DiamondIcon(props: GlyphProps) {
  return (
    <svg {...GLYPH_BASE} aria-hidden focusable={false} {...props}>
      <path d="M8 1.6 14.4 8 8 14.4 1.6 8z" />
    </svg>
  );
}

export function CircleCheckIcon(props: GlyphProps) {
  return (
    <svg {...GLYPH_BASE} aria-hidden focusable={false} {...props}>
      <circle cx="8" cy="8" r="6.1" />
      <path d="m5.3 8.2 1.9 1.9 3.6-4" />
    </svg>
  );
}

export function RoundedSquareInfoIcon(props: GlyphProps) {
  return (
    <svg {...GLYPH_BASE} aria-hidden focusable={false} {...props}>
      <rect x="2" y="2" width="12" height="12" rx="3" />
      <path d="M8 7.3v3.9" />
      <path d="M8 4.9h.01" />
    </svg>
  );
}

export function DashedCircleQuestionIcon(props: GlyphProps) {
  return (
    <svg {...GLYPH_BASE} aria-hidden focusable={false} {...props}>
      <circle cx="8" cy="8" r="6.1" strokeDasharray="2.6 2.4" />
      <path d="M6.5 6.4A1.6 1.6 0 0 1 9.6 7.4c0 1.1-1.6 1.1-1.6 2.4" />
      <path d="M8 12h.01" />
    </svg>
  );
}

export function MinusIcon(props: GlyphProps) {
  return (
    <svg {...GLYPH_BASE} aria-hidden focusable={false} {...props}>
      <circle cx="8" cy="8" r="6.1" strokeDasharray="2.6 2.4" />
      <path d="M5.4 8h5.2" />
    </svg>
  );
}

const SEVERITY_GLYPHS: Record<SeverityIconName, (props: GlyphProps) => ReactElement> = {
  critical: OctagonExclamationIcon,
  high: TriangleExclamationIcon,
  medium: DiamondIcon,
  low: CircleCheckIcon,
  info: RoundedSquareInfoIcon,
  unknown: DashedCircleQuestionIcon,
  neutral: MinusIcon,
};

export function SeverityIcon({ severity, ...props }: GlyphProps & { severity: SeverityIconName }) {
  const Glyph = SEVERITY_GLYPHS[severity];
  return <Glyph {...props} />;
}

export function InfoIcon(props: GlyphProps) {
  return (
    <svg {...GLYPH_BASE} aria-hidden focusable={false} {...props}>
      <circle cx="8" cy="8" r="6.1" />
      <path d="M8 7.3v3.9" />
      <path d="M8 4.9h.01" />
    </svg>
  );
}

export function WarningIcon(props: GlyphProps) {
  return TriangleExclamationIcon(props);
}

export function InboxIcon(props: GlyphProps) {
  return (
    <svg {...GLYPH_BASE} aria-hidden focusable={false} {...props}>
      <path d="M2.2 9.4h3.3l1 2h3l1-2h3.3" />
      <path d="M4 3.4h8l1.8 6v3.2H2.2V9.4z" />
    </svg>
  );
}
