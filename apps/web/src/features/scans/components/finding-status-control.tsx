'use client';

import { useState, useTransition } from 'react';
import { Button } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';

import { updateFindingStatusAction } from '@/features/scans/finding-actions';

/**
 * Triages one finding in place.
 *
 * "Resolved" and "False positive" are different facts and stay different: a
 * dismissed finding is not a fixed one, and collapsing them would make the
 * posture light improve for work that never happened. The server is the
 * authority on what was written; the local state only reflects the last
 * accepted answer so the buttons do not flicker back while the page revalidates.
 */
export function FindingStatusControl({
  findingId,
  status,
}: {
  findingId: string;
  status: 'open' | 'false_positive' | 'resolved';
}) {
  const t = useTranslations('scan');
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
      <Button
        size="sm"
        variant={current === 'resolved' ? 'secondary' : 'ghost'}
        disabled={pending}
        onClick={() => update('resolved')}
      >
        {t('findings.status.resolved')}
      </Button>
      <Button
        size="sm"
        variant={current === 'false_positive' ? 'secondary' : 'ghost'}
        disabled={pending}
        onClick={() => update('false_positive')}
      >
        {t('findings.status.falsePositive')}
      </Button>
      {current !== 'open' ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => update('open')}>
          {t('findings.status.reopen')}
        </Button>
      ) : null}
    </div>
  );
}
