import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export type LabelProps = ComponentProps<typeof LabelPrimitive.Root>;

/**
 * Form label built on Radix Label, which adds the correct activation behaviour
 * (clicking the label focuses and activates the control, including custom
 * controls) instead of a bare `<label for>`.
 */
export function Label({ className, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      className={cn('select-none text-xs font-medium text-text-muted', className)}
      {...props}
    />
  );
}
