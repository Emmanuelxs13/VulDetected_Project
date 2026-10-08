import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { InboxIcon } from './icons';

export interface EmptyStateProps extends Omit<ComponentProps<'div'>, 'title'> {
  /** Replaces the default neutral glyph. Keep it neutral — severity is not decoration. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Primary way out: a Button, a link, or a short instruction. */
  action?: ReactNode;
}

/**
 * Empty dashboard / no findings yet.
 *
 * Tells the reader what is missing, why it is not an error, and what to do next.
 * Deliberately a dashed neutral border rather than an illustration — a decorative
 * hero would fight the 95% neutral budget.
 */
export function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center',
        className,
      )}
      {...props}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-raised text-text-subtle">
        {icon ?? <InboxIcon className="h-4 w-4" />}
      </span>
      <p className="text-sm font-medium text-text">{title}</p>
      {description ? (
        <p className="max-w-prose text-xs leading-5 text-text-muted">{description}</p>
      ) : null}
      {children}
      {action ? <div className="mt-2 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
