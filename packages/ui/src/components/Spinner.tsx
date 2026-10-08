import type { SVGProps } from 'react';
import { cn } from '../lib/cn';

const SPINNER_BASE = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
} as const;

export interface SpinnerProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  className?: string;
}

/**
 * Indeterminate activity indicator.
 *
 * Only used for a genuinely unknown duration (a request in flight). Data
 * progress uses `Progress`, which is determinate — the architecture forbids fake
 * progress bars. Respects `prefers-reduced-motion` (see `styles/tokens.css`),
 * where it renders static rather than disappearing.
 */
export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <svg
      {...SPINNER_BASE}
      aria-hidden
      focusable={false}
      className={cn('h-4 w-4 shrink-0 animate-spin', className)}
      {...props}
    >
      <circle cx="8" cy="8" r="6.2" strokeOpacity={0.25} />
      <path d="M14.2 8A6.2 6.2 0 0 0 8 1.8" />
    </svg>
  );
}
