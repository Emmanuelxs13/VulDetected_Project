'use client';

import { Button } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cancelScanAction } from '@/features/scans/actions';
import { isScanErrorCode, SCAN_ERROR_KEYS } from '@/features/scans/error-codes';

/**
 * Cancels a queued or running scan.
 *
 * ## WHY THE BUTTON REFRESHES INSTEAD OF TRUSTING ITS OWN STATE
 *
 * The server writes `cancelled` synchronously, so a refresh shows the real
 * badge. Keeping a local "cancelled" flag would create a second source of truth
 * that disagrees with the database the moment another tab — or the worker's
 * final callback — touches the same scan.
 *
 * A failure keeps the button rendered and explains why, because "no longer
 * cancellable" usually means the scan just finished and the page is stale.
 */
export function CancelScanButton({ scanId }: { scanId: string }) {
  const t = useTranslations('scan');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await cancelScanAction(scanId);
            if (result.success) {
              router.refresh();
              return;
            }
            setError(isScanErrorCode(result.error) ? t(SCAN_ERROR_KEYS[result.error]) : result.error);
          })
        }
      >
        {pending ? t('actions.cancelPending') : t('actions.cancel')}
      </Button>
      {error ? (
        <span role="status" className="text-xs text-text-muted">
          {error}
        </span>
      ) : null}
    </div>
  );
}
