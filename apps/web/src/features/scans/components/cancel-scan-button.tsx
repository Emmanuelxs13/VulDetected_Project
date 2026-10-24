'use client';

import { useState, useTransition } from 'react';
import { Button } from '@vuldetected/ui';

import { cancelScanAction } from '@/features/scans/actions';

export function CancelScanButton({ scanId }: { scanId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelScanAction(scanId);
            setMessage(result.success ? 'Cancellation requested.' : result.error);
          })
        }
      >
        {pending ? 'Cancelling…' : 'Cancel scan'}
      </Button>
      {message ? <span className="text-xs text-text-muted">{message}</span> : null}
    </div>
  );
}
