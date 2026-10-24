'use client';

import { useState, useTransition } from 'react';
import { Button } from '@vuldetected/ui';

import { updateFindingStatusAction } from '@/features/scans/finding-actions';

export function FindingStatusControl({
  findingId,
  status,
}: {
  findingId: string;
  status: 'open' | 'false_positive' | 'resolved';
}) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();

  function update(next: 'open' | 'false_positive' | 'resolved') {
    startTransition(async () => {
      const result = await updateFindingStatusAction(findingId, next);
      if (result.ok) setCurrent(next);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={current === 'resolved' ? 'secondary' : 'ghost'} disabled={pending} onClick={() => update('resolved')}>
        Resolved
      </Button>
      <Button size="sm" variant={current === 'false_positive' ? 'secondary' : 'ghost'} disabled={pending} onClick={() => update('false_positive')}>
        False positive
      </Button>
      {current !== 'open' ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => update('open')}>
          Reopen
        </Button>
      ) : null}
    </div>
  );
}
