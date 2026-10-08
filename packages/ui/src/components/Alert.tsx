import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';
import {
  CircleCheckIcon,
  InfoIcon,
  OctagonExclamationIcon,
  TriangleExclamationIcon,
} from './icons';

export const alertVariants = cva('flex gap-3 rounded-md border p-3', {
  variants: {
    variant: {
      info: 'border-info/40 bg-info-tint',
      success: 'border-low/40 bg-low-tint',
      warning: 'border-medium/40 bg-medium-tint',
      critical: 'border-critical/50 bg-critical-tint',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

const ALERT_ICON: Record<
  NonNullable<VariantProps<typeof alertVariants>['variant']>,
  { icon: (props: { className?: string }) => ReactNode; color: string }
> = {
  info: { icon: InfoIcon, color: 'text-info' },
  success: { icon: CircleCheckIcon, color: 'text-low' },
  warning: { icon: TriangleExclamationIcon, color: 'text-medium' },
  critical: { icon: OctagonExclamationIcon, color: 'text-critical' },
};

export interface AlertProps
  extends Omit<ComponentProps<'div'>, 'title'>, VariantProps<typeof alertVariants> {
  title: ReactNode;
  description?: ReactNode;
  /** Replaces the default status glyph when a more specific one is needed. */
  icon?: ReactNode;
  /**
   * `critical` announces assertively (`role="alert"`); everything else is
   * polite (`role="status"`). Both are non-modal and do not interrupt typing.
   */
  live?: 'auto' | 'polite' | 'assertive';
}

export function Alert({
  className,
  variant,
  title,
  description,
  icon,
  live = 'auto',
  children,
  ...props
}: AlertProps) {
  const resolved = variant ?? 'info';
  const role: 'status' | 'alert' =
    live === 'auto'
      ? resolved === 'critical'
        ? 'alert'
        : 'status'
      : live === 'assertive'
        ? 'alert'
        : 'status';
  const Glyph = ALERT_ICON[resolved].icon;

  return (
    <div role={role} className={cn(alertVariants({ variant }), className)} {...props}>
      <span className={cn('mt-px h-4 w-4 shrink-0', ALERT_ICON[resolved].color)}>
        {icon ?? <Glyph className="h-4 w-4" />}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-medium text-text">{title}</p>
        {description ? <p className="text-xs leading-5 text-text-muted">{description}</p> : null}
        {children ? <div className="text-xs leading-5 text-text-muted">{children}</div> : null}
      </div>
    </div>
  );
}
