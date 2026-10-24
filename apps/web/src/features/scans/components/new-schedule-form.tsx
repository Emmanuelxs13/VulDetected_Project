'use client';

import { Button, Field } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { createScheduleAction } from '../schedule-actions';
import { SCAN_INTERVALS } from '../schedule-schema';

export function NewScheduleForm({
  verifiedHosts,
}: {
  verifiedHosts: Array<{ id: string; hostname: string }>;
}) {
  const t = useTranslations('scan');
  const [domainId, setDomainId] = useState(verifiedHosts[0]?.id ?? '');
  const [interval, setInterval] = useState<(typeof SCAN_INTERVALS)[number]>('daily');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    const result = await createScheduleAction({ domainId, interval });
    setBusy(false);
    if (!result.success) {
      setMessage({ type: 'error', text: result.error });
      return;
    }
    setMessage({ type: 'success', text: t('schedules.created') });
    window.location.reload();
  }

  if (verifiedHosts.length === 0) {
    return <p className="text-sm text-text-muted">{t('schedules.domainNotVerified')}</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('form.schedule.domain')}>
          {(control) => (
            <select
              {...control}
              value={domainId}
              onChange={(event) => setDomainId(event.target.value)}
              className="h-10 rounded-md border border-border bg-bg px-3 text-sm text-text"
            >
              {verifiedHosts.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.hostname}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('form.schedule.interval')}>
          {(control) => (
            <select
              {...control}
              value={interval}
              onChange={(event) => setInterval(event.target.value as typeof interval)}
              className="h-10 rounded-md border border-border bg-bg px-3 text-sm text-text"
            >
              <option value="daily">{t('schedules.daily')}</option>
              <option value="weekly">{t('schedules.weekly')}</option>
            </select>
          )}
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" loading={busy}>
          {busy ? t('form.schedule.submitting') : t('form.schedule.submit')}
        </Button>
      </div>
      {message ? (
        <p className={`text-sm ${message.type === 'success' ? 'text-success' : 'text-critical'}`}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
