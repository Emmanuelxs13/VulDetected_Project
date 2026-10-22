import type { Metadata } from 'next';
import { and, desc, domains, eq, findings, scanEvents, scans } from '@vuldetected/db';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
} from '@vuldetected/ui';
import { notFound } from 'next/navigation';

import { getServerSession } from '@/features/auth/session';
import { FindingsList } from '@/features/scans/components/findings-list';
import type { FindingRow } from '@/features/scans/components/findings-list';
import { ScanProgressStream } from '@/features/scans/components/scan-progress-stream';
import type { ScanStreamEvent } from '@/features/scans/components/scan-progress-stream';
import { ScanStatusBadge } from '@/features/scans/components/scan-status';
import type { ScanStatus } from '@/features/scans/components/scan-status';
import { db } from '@/lib/db';

export const metadata: Metadata = { title: 'Detalle del escaneo' };

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

  const session = await getServerSession();

  if (!session?.user) {
    return (
      <Container size="narrow" className="py-12">
        <EmptyState
          title="Sesión no activa"
          description="Inicia sesión para ver el progreso de tus escaneos."
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

  return (
    <Container size="default" className="flex flex-col gap-6 py-12">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Escaneo</h1>
          <ScanStatusBadge status={scan.status as ScanStatus} />
        </div>
        <p className="text-sm text-text-muted">
          Objetivo: <span className="font-mono text-text">{scan.targetUrl}</span>
        </p>
        <p className="text-xs text-text-muted">
          Dominio verificado: <span className="font-mono">{scan.hostname}</span>
        </p>
        {checks.length > 0 ? (
          <p className="text-xs text-text-muted">
            Comprobaciones: <span className="font-mono">{checks.join(', ')}</span>
          </p>
        ) : null}
      </div>

      {scan.error ? (
        <div aria-live="polite" aria-atomic="true">
          <Badge variant="critical">Error: {scan.error}</Badge>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Progreso</CardTitle>
          <CardDescription>
            Los eventos los publica el worker y los escribe la web, que es la única que modifica el
            estado del escaneo.
          </CardDescription>
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
          <CardTitle>Hallazgos</CardTitle>
          <CardDescription>
            En el Sprint 2 todo hallazgo se registra como «Sin clasificar»; la clasificación llega
            en el Sprint 3.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FindingsList findings={findingList} />
        </CardContent>
      </Card>
    </Container>
  );
}
