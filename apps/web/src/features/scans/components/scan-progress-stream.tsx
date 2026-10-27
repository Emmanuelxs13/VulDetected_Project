'use client';

import { Progress } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { estimateScanProgress, formatDuration } from '@/lib/scan-progress';

import { isTerminalStatus, ScanStatusBadge } from './scan-status';
import type { ScanStatus } from './scan-status';

/** One row of `scan_events`, as the stream delivers it. */
export interface ScanStreamEvent {
  id: number;
  seq: number;
  type: string;
  payload: unknown;
  createdAt: string;
}

type Connection = 'connecting' | 'live' | 'lost';

/**
 * Live progress for one scan.
 *
 * ## WHY SSE AND NOT A POLLING LOOP IN THE BROWSER
 *
 * The server owns the cursor (`scan_events.id` is monotonic by construction,
 * design D2) and the page reconnection policy. A browser-side `setInterval`
 * would have to reimplement both, and every open tab would issue its own
 * query per second against the same table.
 *
 * ## WHY THE SERVER RENDERS NOTHING
 *
 * The stream carries events, not markup. The status badge, the progress bar
 * and the feed are derived here from the events that arrived, so the page
 * stays a server component and only this island is interactive.
 */
export function ScanProgressStream({
  scanId,
  checks,
  initialEvents,
  initialStatus,
}: {
  scanId: string;
  checks: string[];
  initialEvents: ScanStreamEvent[];
  initialStatus: ScanStatus;
}) {
  const router = useRouter();
  const t = useTranslations('scan');
  const [events, setEvents] = useState<ScanStreamEvent[]>(initialEvents);
  const [status, setStatus] = useState<ScanStatus>(initialStatus);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [mounted, setMounted] = useState(false);

  // Local time is only rendered after hydration: the server and the browser
  // may sit in different time zones, and a formatted clock that differs
  // between them is a hydration mismatch.
  useEffect(() => setMounted(true), []);

  const alreadyTerminal = isTerminalStatus(initialStatus);

  useEffect(() => {
    // A scan that already finished has nothing left to stream.
    if (alreadyTerminal) {
      setConnection('live');
      return;
    }

    const cursor =
      initialEvents.length > 0 ? Math.max(...initialEvents.map((event) => event.id)) : 0;

    const source = new EventSource(
      `/api/scans/${encodeURIComponent(scanId)}/events?cursor=${cursor}`,
    );

    source.onopen = () => setConnection('live');

    source.addEventListener('scan.event', (message) => {
      const event = parseEvent((message as MessageEvent<string>).data);
      if (!event) {
        return;
      }
      setEvents((current) =>
        current.some((existing) => existing.id === event.id) ? current : [...current, event],
      );
      setStatus((current) => statusFromEvent(event, current));
    });

    source.addEventListener('scan.done', (message) => {
      const done = parseDone((message as MessageEvent<string>).data);
      source.close();
      setConnection('live');
      if (done) {
        setStatus(done);
      }
      // The findings are written by the final callback, so the server has to
      // re-render the page for them to appear.
      router.refresh();
    });

    source.onerror = () => {
      // `EventSource` reconnects on its own; this only tells the reader that
      // the feed is momentarily behind.
      setConnection('lost');
    };

    return () => source.close();
  }, [alreadyTerminal, initialEvents, router, scanId]);

  /**
   * Progress, percentage and ETA all come from one pure function so a reload
   * and a live update cannot disagree: both feed it the same events and the
   * same expected check list.
   */
  const estimate = useMemo(() => estimateScanProgress(events, checks), [events, checks]);
  const total = estimate.total;
  const percent = estimate.percent;

  const connectionLabels: Record<Connection, string> = {
    connecting: t('progress.connection.connecting'),
    live: t('progress.connection.live'),
    lost: t('progress.connection.lost'),
  };

  /**
   * One sentence under the bar: how far along the scan is, and — while it runs
   * — how long the remaining checks should take. `estimateScanProgress` returns
   * `null` until one check has finished, because averaging zero samples would
   * be a guess dressed as a measurement.
   */
  const eta =
    status === 'running'
      ? estimate.remainingMs !== null
        ? t('progress.estimate.remaining', { duration: formatDuration(estimate.remainingMs) })
        : total > 0
          ? t('progress.estimate.waiting')
          : null
      : null;

  const summary = total > 0 ? t('progress.summary', { completed: estimate.completed, total }) : null;

  function describeEvent(event: ScanStreamEvent): string {
    const check = readCheckName(event.payload);

    switch (event.type) {
      case 'scan.started':
        return t('progress.event.started');
      case 'scan.completed':
        return t('progress.event.completed');
      case 'scan.failed':
        return t('progress.event.failed');
      case 'scan.cancelled':
        return t('progress.event.cancelled');
      case 'check.started':
        return t('progress.event.checkStarted', { check: check ?? '—' });
      case 'check.completed':
        return t('progress.event.checkCompleted', { check: check ?? '—' });
      case 'scan.progress':
        return t('progress.event.progress');
      default:
        return event.type;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ScanStatusBadge status={status} />
        <span className="text-xs text-text-muted">{connectionLabels[connection]}</span>
      </div>

      {total > 0 ? (
        <Progress value={percent} label={t('progress.checksCompleted')} showValue />
      ) : null}

      {summary || eta ? (
        <p className="text-xs text-text-muted" aria-live="polite">
          {summary}
          {summary && eta ? ' · ' : null}
          {eta}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-text-muted">{t('progress.events')}</span>
        {events.length === 0 ? (
          <p className="text-xs text-text-muted">{t('progress.noEvents')}</p>
        ) : (
          <ul aria-live="polite" className="flex flex-col">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-1 last:border-b-0"
              >
                <span className="text-xs text-text">{describeEvent(event)}</span>
                <time
                  className="tabular shrink-0 text-xs text-text-muted"
                  dateTime={event.createdAt}
                >
                  {formatTime(event.createdAt, mounted)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The status the event implies, if any. */
function statusFromEvent(event: ScanStreamEvent, current: ScanStatus): ScanStatus {
  switch (event.type) {
    case 'scan.started':
      return 'running';
    case 'scan.completed':
      return 'completed';
    case 'scan.failed':
      return 'failed';
    case 'scan.cancelled':
      return 'cancelled';
    default:
      return current;
  }
}

/** The check a progress event refers to, if it names one. */
function readCheckName(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'check' in payload) {
    const value = (payload as { check: unknown }).check;
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

function parseEvent(data: string): ScanStreamEvent | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === 'object' && parsed !== null && 'id' in parsed && 'type' in parsed) {
      return parsed as ScanStreamEvent;
    }
    return null;
  } catch {
    return null;
  }
}

function parseDone(data: string): ScanStatus | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === 'object' && parsed !== null && 'status' in parsed) {
      const status = (parsed as { status: unknown }).status;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return status;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Timestamp rendering.
 *
 * Before hydration the UTC slice of the ISO string is rendered, because it is
 * identical on the server and on the client. After hydration the local time
 * is shown, which is what the reader actually wants.
 */
function formatTime(iso: string, mounted: boolean): string {
  if (!mounted) {
    return `${iso.slice(11, 19)} UTC`;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
