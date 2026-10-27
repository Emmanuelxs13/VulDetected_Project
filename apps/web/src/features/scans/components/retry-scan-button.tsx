'use client';

import { Button } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { retryScanAction } from '@/features/scans/actions';
import { isScanErrorCode, SCAN_ERROR_KEYS } from '@/features/scans/error-codes';

/**
 * Re-runs a failed or cancelled scan.
 *
 * ## WHY A RETRY IS A NEW SCAN, NOT A RESET
 *
 * The events and findings of the previous attempt are history, not scratch
 * state. The action queues a fresh row with the same target, so the old attempt
 * stays readable and this navigation lands on a progress stream that starts
 * from zero instead of replaying the previous run's events.
 */
export function RetryScanButton({ scanId }: { scanId: string }) {
  const t = useTranslations('scan');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await retryScanAction(scanId);
            if (result.success) {
              router.push(`/scans/${result.data.scanId}`);
              return;
            }
            setError(isScanErrorCode(result.error) ? t(SCAN_ERROR_KEYS[result.error]) : result.error);
          })
        }
      >
        {pending ? t('actions.retryPending') : t('actions.retry')}
      </Button>
      {error ? (
        <span role="status" className="text-xs text-text-muted">
          {error}
        </span>
      ) : null}
    </div>
  );
}
