import type { Metadata } from 'next';
import { and, desc, domains, eq, findings, scanEvents, scans } from '@vuldetected/db';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
} from '@vuldetected/ui';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';
import { FindingsList } from '@/features/scans/components/findings-list';
import type { FindingRow } from '@/features/scans/components/findings-list';
import { ScanProgressStream } from '@/features/scans/components/scan-progress-stream';
import type { ScanStreamEvent } from '@/features/scans/components/scan-progress-stream';
import { ScanStatusBadge } from '@/features/scans/components/scan-status';
import type { ScanStatus } from '@/features/scans/components/scan-status';
import { db } from '@/lib/db';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scan');

  return { title: t('metadata.detailTitle') };
}

/**
 * Detail of one scan: live progress and findings.
 *
 * ## WHY THE SCAN IS FILTERED BY THE OWNER
 *
 * The scan is reached through the domain it belongs to, and the domain
 * through the account that proved ownership of it. A scan id is not a secret,
 * so the read has to prove the same link the write did: this page shows a
 * scan only to the account that owns the domain behind it.
 *
 * ## WHY THE EVENTS ARE RENDERED SERVER-SIDE FIRST
 *
 * The stream only carries what happens AFTER the page loads. The events
 * already stored are read here and handed to the client component as its
 * starting point, so a reload shows the full history instead of an empty
 * feed, and the stream resumes from the last event it has already seen.
 */
export default async function ScanDetailPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const t = await getTranslations('scan');

  const session = await getServerSession();

  if (!session?.user) {
    return (
      <Container size="narrow" className="py-12">
        <EmptyState
          title={t('detail.sessionRequired.title')}
          description={t('detail.sessionRequired.description')}
        />
      </Container>
    );
  }

  const userId = session.user.id;

  const scanRows = await db()
    .select({
      id: scans.id,
      targetUrl: scans.targetUrl,
      status: scans.status,
      checks: scans.checks,
      error: scans.error,
      createdAt: scans.createdAt,
      startedAt: scans.startedAt,
      finishedAt: scans.finishedAt,
      hostname: domains.normalizedHostname,
    })
    .from(scans)
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(and(eq(scans.id, scanId), eq(domains.userId, userId)))
    .limit(1);

  const scan = scanRows[0];
  if (!scan) {
    notFound();
  }

  const [eventRows, findingRows] = await Promise.all([
    db()
      .select({
        id: scanEvents.id,
        seq: scanEvents.seq,
        type: scanEvents.type,
        payload: scanEvents.payload,
        createdAt: scanEvents.createdAt,
      })
      .from(scanEvents)
      .where(eq(scanEvents.scanId, scanId))
      .orderBy(scanEvents.id)
      .limit(100),
    db()
      .select({
        id: findings.id,
        severity: findings.severity,
        checkName: findings.checkName,
        title: findings.title,
        description: findings.description,
        affectedUrl: findings.affectedUrl,
      })
      .from(findings)
      .where(eq(findings.scanId, scanId))
      .orderBy(desc(findings.createdAt)),
  ]);

  const initialEvents: ScanStreamEvent[] = eventRows.map((event) => ({
    id: event.id,
    seq: event.seq,
    type: event.type,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
  }));

  const findingList: FindingRow[] = findingRows.map((finding) => ({
    id: finding.id,
    severity: finding.severity,
    checkName: finding.checkName,
    title: finding.title,
    description: finding.description,
    affectedUrl: finding.affectedUrl,
  }));

  const checks = Array.isArray(scan.checks) ? (scan.checks as string[]) : [];

  // The stored value is a machine code (`enqueue_failed`, the worker's own
  // reason string, …). It is never rendered: the reader gets a translated
  // message and the raw value stays in the database for diagnostics.
  const errorMessage = scan.error
    ? scan.error === 'enqueue_failed'
      ? t('errors.submitFailed')
      : t('status.failed')
    : null;

  return (
    <Container size="default" className="flex flex-col gap-6 py-12">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t('detail.title')}</h1>
          <ScanStatusBadge status={scan.status as ScanStatus} />
        </div>
        <p className="text-sm text-text-muted">
          {t('detail.targetLabel')} <span className="font-mono text-text">{scan.targetUrl}</span>
        </p>
        <p className="text-xs text-text-muted">
          {t('detail.verifiedDomainLabel')} <span className="font-mono">{scan.hostname}</span>
        </p>
        {checks.length > 0 ? (
          <p className="text-xs text-text-muted">
            {t('detail.checksLabel')} <span className="font-mono">{checks.join(', ')}</span>
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <div aria-live="polite" aria-atomic="true">
          <Badge variant="critical">{errorMessage}</Badge>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.progress.title')}</CardTitle>
          <CardDescription>{t('detail.progress.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ScanProgressStream
            scanId={scan.id}
            checks={checks}
            initialEvents={initialEvents}
            initialStatus={scan.status as ScanStatus}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('detail.findings.title')}</CardTitle>
              <CardDescription>{t('detail.findings.description')}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="ghost" size="sm">
                <a href={`/api/scans/${scan.id}/export?format=csv`}>{t('export.csv')}</a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={`/api/scans/${scan.id}/export?format=json`}>{t('export.json')}</a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FindingsList findings={findingList} />
        </CardContent>
      </Card>
    </Container>
  );
}
