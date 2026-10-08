import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { Spinner } from './Spinner';

/**
 * Variant strings are merged with `tailwind-merge` by `cn()` at render time, so
 * a variant that overrides a base utility (the 12px label on `size="sm"`) wins,
 * and a consumer class from the call site wins over both.
 */
export const buttonVariants = cva(
  // Elevation comes from borders and surface steps — no drop shadows, and no
  // transitions on transform/shadow, so a button never appears to float.
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-[background-color,border-color,color] duration-150 ease-out focus-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-text-on-brand hover:bg-brand-strong active:bg-iris-700',
        secondary:
          'border border-border-strong bg-surface-raised text-text hover:bg-surface hover:border-border-strong',
        ghost: 'text-text-muted hover:bg-surface hover:text-text',
        danger: 'bg-critical text-text-on-solid hover:bg-critical-strong',
      },
      size: {
        // Density rule: 32 / 36 / 40px, on the 8px rhythm.
        sm: 'h-8 px-2.5 text-xs',
        md: 'h-9 px-3',
        lg: 'h-10 px-4',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
      fullWidth: false,
    },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a `<button>` (Radix `Slot`). */
  asChild?: boolean;
  /** Shows a spinner, sets `aria-busy`, and blocks interaction. */
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  className,
  variant,
  size,
  fullWidth,
  loading = false,
  asChild = false,
  disabled,
  type,
  ref,
  children,
  ...props
}: ButtonProps) {
  const classes = buttonVariants({ variant, size, fullWidth, className });
  const blocked = Boolean(disabled) || loading;

  if (asChild) {
    // The consumer owns the child element, so `disabled` is not available here;
    // the ARIA state and the loading attribute still have to be conveyed.
    return (
      <Slot
        ref={ref}
        className={classes}
        aria-busy={loading || undefined}
        aria-disabled={blocked || undefined}
        data-loading={loading ? '' : undefined}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={blocked}
      aria-busy={loading || undefined}
      data-loading={loading ? '' : undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
