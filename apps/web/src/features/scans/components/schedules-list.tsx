'use client';

import { Button } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { deleteScheduleAction, updateScheduleAction } from '../schedule-actions';

export function SchedulesList({
  schedules,
}: {
  schedules: Array<{
    id: string;
    domainId: string;
    hostname: string;
    interval: string;
    enabled: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
  }>;
}) {
  const t = useTranslations('scan');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(schedule: (typeof schedules)[number]) {
    setError(null);
    setBusy(schedule.id);
    const result = await updateScheduleAction({
      scheduleId: schedule.id,
      enabled: !schedule.enabled,
    });
    setBusy(null);
    if (!result.success) {
      setError(t('schedules.error'));
      return;
    }
    window.location.reload();
  }

  async function remove(scheduleId: string) {
    setError(null);
    setBusy(scheduleId);
    const result = await deleteScheduleAction(scheduleId);
    setBusy(null);
    if (!result.success) {
      setError(t('schedules.error'));
      return;
    }
    window.location.reload();
  }

  if (schedules.length === 0) {
    return <p className="text-sm text-text-muted">{t('schedules.empty')}</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {error ? (
        <p className="pb-4 text-sm text-critical" role="alert">
          {error}
        </p>
      ) : null}
      {schedules.map((schedule) => (
        <div key={schedule.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex flex-col">
            <span className="font-mono text-sm">{schedule.hostname}</span>
            <span className="text-xs text-text-muted">
              {schedule.interval === 'weekly' ? t('schedules.weekly') : t('schedules.daily')} ·{' '}
              {schedule.enabled ? t('schedules.enabled') : t('schedules.paused')}
            </span>
            <span className="text-xs text-text-muted">
              {t('schedules.nextRun')}:{' '}
              {schedule.nextRunAt ? schedule.nextRunAt.replace('T', ' ').slice(0, 16) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              loading={busy === schedule.id}
              onClick={() => toggle(schedule)}
            >
              {schedule.enabled ? t('schedules.pause') : t('schedules.resume')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={busy === schedule.id}
              onClick={() => remove(schedule.id)}
            >
              {t('schedules.delete')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
