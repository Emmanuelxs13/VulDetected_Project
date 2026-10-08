import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Loading placeholder. Pairs with the real layout so the page does not jump
 * when content arrives — a skeleton that does not match the final layout is
 * worse than a spinner.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-border-subtle', className)}
      {...props}
    />
  );
}

/** Skeleton sized as a table row (32px, the density rule). */
export function SkeletonRow({ className, ...props }: ComponentProps<'div'>) {
  return <Skeleton className={cn('h-8 w-full rounded-none', className)} {...props} />;
}
