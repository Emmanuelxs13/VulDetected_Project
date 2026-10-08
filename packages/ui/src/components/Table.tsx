import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Dense data table.
 *
 * Density rule: every row is 32px (`h-8`). Security findings are read as
 * lists — a 40px row turns a 25-finding table into a scroll marathon.
 */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />;
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('border-b border-border', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-b-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'h-8 border-b border-border-subtle transition-colors duration-150 hover:bg-surface',
        className,
      )}
      {...props}
    />
  );
}

export interface TableHeadProps extends ComponentProps<'th'> {
  /** Right-align the column and switch it to tabular figures. */
  numeric?: boolean;
}

export function TableHead({ className, numeric = false, ...props }: TableHeadProps) {
  return (
    <th
      scope="col"
      className={cn(
        'h-8 whitespace-nowrap px-3 text-xs font-medium uppercase tracking-wide text-text-muted',
        numeric ? 'text-right tabular' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export interface TableCellProps extends ComponentProps<'td'> {
  /** Right-align the cell and switch it to tabular figures. */
  numeric?: boolean;
}

export function TableCell({ className, numeric = false, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        'h-8 px-3 align-middle text-text',
        numeric ? 'text-right tabular' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption className={cn('p-3 text-xs text-text-muted', className)} {...props} />;
}
