import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Determinate progress only.
 *
 * There is deliberately no indeterminate mode: an animated bar that does not
 * know the total is a lie about work in flight, and the product is read by
 * people who have to decide whether to wait. Unknown-duration work uses
 * `Spinner` or `Skeleton` instead, which are honest about being unknown.
 */
export const progressVariants = cva(
  'h-full rounded-full transition-[width] duration-200 ease-out',
  {
    variants: {
      tone: {
        brand: 'bg-brand',
        critical: 'bg-critical',
        high: 'bg-high',
        medium: 'bg-medium',
        low: 'bg-low',
      },
    },
    defaultVariants: {
      tone: 'brand',
    },
  },
);

export interface ProgressProps
  extends Omit<ComponentProps<'div'>, 'children'>, VariantProps<typeof progressVariants> {
  /** Completion percentage, 0–100. Values outside the range are clamped. */
  value: number;
  /** What is progressing. Also the accessible name of the bar. */
  label: string;
  /** Show the percentage next to the label. */
  showValue?: boolean;
}

export function Progress({
  className,
  tone,
  value,
  label,
  showValue = true,
  ...props
}: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('flex flex-col gap-1.5', className)}
      {...props}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-text-muted">{label}</span>
        {showValue ? (
          <span className="tabular text-xs font-medium text-text-muted">
            {Math.round(clamped)}%
          </span>
        ) : null}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full border border-border-subtle bg-surface">
        <div className={cn(progressVariants({ tone }))} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
