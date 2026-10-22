'use client';

import { Badge, Spinner } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';

/**
 * Scan lifecycle vocabulary (design D9).
 *
 * ## WHY THE LABELS LIVE HERE AND NOT IN THE PAGE
 *
 * The same status is rendered in the list, in the detail header and in the
 * live stream. If each of those spelled the status on its own, the three
 * would drift within a sprint, and a user would see "En cola" in one place and
 * "queued" in another. The mapping is written once, here.
 *
 * ## WHY THIS FILE IS NOW A CLIENT COMPONENT
 *
 * The labels come from `next-intl`, and `useTranslations` is a client hook.
 * The badge is rendered from a server page and from a client stream, and a
 * server component may render a client component, so marking it `'use client'`
 * keeps both call sites working without duplicating the mapping.
 */
export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Severity mapping for the scan status.
 *
 * `completed` is `low` (the success green of the design system), `failed` is
 * `critical`, `cancelled` is `unknown` because it is neither a success nor an
 * alarm, and the two in-flight states are `neutral`/`info` — they are work in
 * progress, not outcomes. Severity colour has to mean the same thing every
 * time it appears (ADR 0003 §5).
 */
const STATUS_VARIANT: Record<ScanStatus, 'neutral' | 'info' | 'low' | 'critical' | 'unknown'> = {
  queued: 'neutral',
  running: 'info',
  completed: 'low',
  failed: 'critical',
  cancelled: 'unknown',
};

/** True for the states the scan never leaves on its own. */
export function isTerminalStatus(status: ScanStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/** True while the scan is still working. */
export function isActiveStatus(status: ScanStatus): boolean {
  return status === 'queued' || status === 'running';
}

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const t = useTranslations('scan.status');
  const active = isActiveStatus(status);

  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={STATUS_VARIANT[status]}>{t(status)}</Badge>
      {/*
        The spinner sits NEXT TO the badge, not inside it: the badge already
        carries the severity glyph, and two glyphs in the same 20px pill would
        be noise instead of signal.
      */}
      {active ? <Spinner className="h-3 w-3 text-text-muted" /> : null}
    </span>
  );
}
