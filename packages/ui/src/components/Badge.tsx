import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { SeverityIcon, type SeverityIconName } from './icons';

/**
 * Severity badge — the component that encodes severity once, for the whole
 * product (ADR 0003 §5).
 *
 * Three redundant channels, all mandatory:
 *   1. colour  — the severity hue on the icon and the border
 *   2. shape   — a distinct glyph per severity (octagon, triangle, diamond, …)
 *   3. text    — the severity word, required; there is no icon-only mode
 *
 * The label itself is rendered in `--color-text`, not in the severity hue: the
 * medium amber step reaches only 1.7:1 on a light surface, which would make the
 * most important word in the product the least readable one. The hue stays on
 * the icon and the border, where it is a 3:1 non-text signal.
 */
export const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-xs font-medium',
  {
    variants: {
      variant: {
        critical: 'border-critical/40 bg-critical-tint text-text',
        high: 'border-high/40 bg-high-tint text-text',
        medium: 'border-medium/40 bg-medium-tint text-text',
        low: 'border-low/40 bg-low-tint text-text',
        info: 'border-info/40 bg-info-tint text-text',
        unknown: 'border-unknown/40 bg-unknown-tint text-text',
        neutral: 'border-border-strong bg-surface-raised text-text-muted',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

const ICON_COLOR: Record<SeverityIconName, string> = {
  critical: 'text-critical',
  high: 'text-high',
  medium: 'text-medium',
  low: 'text-low',
  info: 'text-info',
  unknown: 'text-unknown',
  neutral: 'text-text-subtle',
};

export interface BadgeProps
  extends Omit<ComponentProps<'span'>, 'children'>, VariantProps<typeof badgeVariants> {
  /** The severity word. Required — a badge without a label communicates nothing. */
  children: ReactNode;
  /** Force tabular figures on/off. Defaults to on when `children` is a number. */
  tabular?: boolean;
}

export function Badge({ className, variant, children, tabular, ...props }: BadgeProps) {
  const severity: SeverityIconName = variant ?? 'neutral';
  const numeric = typeof children === 'number';
  const withTabular = tabular ?? numeric;

  return (
    <span
      className={cn(badgeVariants({ variant }), withTabular && 'tabular', className)}
      data-severity={severity}
      {...props}
    >
      <SeverityIcon severity={severity} className={cn('h-3 w-3 shrink-0', ICON_COLOR[severity])} />
      {children}
    </span>
  );
}
