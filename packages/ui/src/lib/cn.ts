import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names and resolve Tailwind conflicts.
 *
 * `clsx` handles the conditional part (`cond && 'x'`, objects, arrays) and
 * `tailwind-merge` makes the last conflicting utility win, so a consumer can
 * override a component variant from the call site:
 *
 *   <Button variant="secondary" className="px-6" />  // px-6 wins
 *
 * `tailwind-merge` is configured for Tailwind v4, which is what generates the
 * utilities from `styles/tokens.css`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
