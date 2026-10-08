import { cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const textareaVariants = cva(
  'flex w-full resize-y rounded-md border border-border bg-surface-raised px-2.5 py-2 text-sm leading-5 text-text transition-[background-color,border-color,color] duration-150 ease-out placeholder:text-text-subtle focus-ring disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-surface aria-[invalid=true]:border-critical',
);

export type TextareaProps = ComponentProps<'textarea'>;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return <textarea rows={rows} className={cn(textareaVariants(), className)} {...props} />;
}
