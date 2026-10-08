import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export interface ContainerProps extends ComponentProps<'div'> {
  /** Cap the content width. Defaults to 1280px (Tailwind `max-w-7xl`). */
  size?: 'narrow' | 'default' | 'wide';
}

const SIZE: Record<NonNullable<ContainerProps['size']>, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-7xl',
  wide: 'max-w-[100rem]',
};

/**
 * Centred content column with responsive gutters (16 / 24 / 32px — the 8px
 * rhythm). Every page renders its main column through this so the left edge of
 * the content is identical on every screen.
 */
export function Container({ className, size = 'default', ...props }: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', SIZE[size], className)} {...props} />
  );
}
