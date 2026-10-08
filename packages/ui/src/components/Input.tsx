import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const inputVariants = cva(
  'flex w-full rounded-md border border-border bg-surface-raised text-sm text-text transition-[background-color,border-color,color] duration-150 ease-out placeholder:text-text-subtle focus-ring disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-surface aria-[invalid=true]:border-critical',
  {
    variants: {
      size: {
        sm: 'h-8 px-2',
        md: 'h-9 px-2.5',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

/** `size` is the control height here, so the native `size?: number` is dropped. */
export type InputProps = Omit<ComponentProps<'input'>, 'size'> & VariantProps<typeof inputVariants>;

/**
 * Text input. Spreads every native input prop (`type`, `value`, `onChange`,
 * `autoComplete`, ARIA attributes, `ref`) so no behaviour has to be re-declared.
 */
export function Input({ className, size, type = 'text', ...props }: InputProps) {
  return <input type={type} className={cn(inputVariants({ size }), className)} {...props} />;
}
