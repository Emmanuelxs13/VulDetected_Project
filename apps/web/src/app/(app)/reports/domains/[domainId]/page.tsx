import type { Metadata } from 'next';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vuldetected/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';
import { getDomainScanHistory } from '@/features/scans/queries/history';
import { formatProductDateTime } from '@/lib/format/datetime';
import type { HistoryRow } from '@/lib/history/comparability';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reports.history');

  return { title: t('title') };
}

/**
 * Comparative history for one domain (HU-10).
 *
 * ## What the reader is looking at
 *
 * One row per scan, newest first, each row a snapshot: how many findings of each
 * severity were open at that moment. There is deliberately no composite score —
 * a single number would hide which severity moved, and inventing one is exactly
 * what the sprint forbids.
 *
 * ## Why some rows show no change
 *
 * A run that never completed, or one that stopped early, cannot be a baseline.
 * A run whose scan mode or severity catalogue differs from the previous one
 * cannot be compared with it either: the difference would be ours, not the
 * site's. Those rows keep their numbers and say why they are not comparable,
 * which is more honest than dropping them or pretending the delta is zero.
 */
export default async function DomainHistoryPage({
  params,
}: {
  params: Promise<{ domainId: string }>;
}) {
  const { domainId } = await params;
  const t = await getTranslations('reports.history');
  const tScan = await getTranslations('scan');
  const session = await getServerSession();

  if (!session?.user) {
    return (
      <Container size="narrow" className="py-12">
        <EmptyState
          title={t('sessionRequired.title')}
          description={t('sessionRequired.description')}
        />
      </Container>
    );
  }

  const history = await getDomainScanHistory(session.user.id, domainId);
  if (!history) {
    notFound();
  }

  const rows = history.rows;
  const comparable = rows.some((row) => row.delta !== null);

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-text-muted">
            {t('subtitle', { host: history.hostname })}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/reports">{t('back')}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('howToRead.title')}</CardTitle>
          <CardDescription>{t('howToRead.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-text-muted">
          <p>{t('howToRead.snapshots')}</p>
          <p>{t('howToRead.comparability')}</p>
          {!comparable ? <p className="font-medium text-text">{t('noComparablePair')}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('table.title')}</CardTitle>
          <CardDescription>{t('table.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title={t('empty.title')} description={t('empty.description')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('table.date')}</TableHead>
                    <TableHead>{t('table.status')}</TableHead>
                    <TableHead>{t('table.mode')}</TableHead>
                    <TableHead>{t('table.total')}</TableHead>
                    <TableHead>{t('table.risky')}</TableHead>
                    <TableHead>{t('table.delta')}</TableHead>
                    <TableHead>{t('table.report')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <HistoryTableRow key={row.snapshot.scanId} row={row} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </Container>
  );

  function HistoryTableRow({ row }: { row: HistoryRow }) {
    const snapshot = row.snapshot;
    const statusKey = `status.${snapshot.status}` as never;
    const statusLabel = tScan.has(statusKey) ? tScan(statusKey) : snapshot.status;

    return (
      <TableRow>
        <TableCell>
          <Link
            href={`/scans/${snapshot.scanId}`}
            className="text-xs text-primary hover:underline"
          >
            <time dateTime={snapshot.createdAt.toISOString()}>
              {formatProductDateTime(snapshot.createdAt.toISOString())}
            </time>
          </Link>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            <Badge variant={snapshot.status === 'completed' ? 'low' : 'neutral'}>
              {statusLabel}
            </Badge>
            {snapshot.partial ? <Badge variant="neutral">{t('badge.partial')}</Badge> : null}
            {snapshot.isDemo ? <Badge variant="medium">{t('badge.demo')}</Badge> : null}
          </div>
        </TableCell>
        <TableCell className="text-xs text-text-muted">
          {snapshot.scanMode === 'passive' ? t('mode.passive') : t('mode.active')}
          <span className="ml-1 text-text-muted">· {snapshot.severityCatalogVersion}</span>
        </TableCell>
        <TableCell className="tabular text-xs">{row.total}</TableCell>
        <TableCell className="tabular text-xs">{row.risky}</TableCell>
        <TableCell>
          <DeltaBadge row={row} />
        </TableCell>
        <TableCell>
          <a
            href={`/api/scans/${snapshot.scanId}/export/pdf`}
            className="text-xs text-primary hover:underline"
          >
            PDF
          </a>
        </TableCell>
      </TableRow>
    );
  }

  function DeltaBadge({ row }: { row: HistoryRow }) {
    if (row.excluded !== null) {
      const label =
        row.excluded === 'partial' ? t('badge.partialNotComparable') : t('badge.notCompleted');
      return <Badge variant="neutral">{label}</Badge>;
    }

    if (row.delta !== null) {
      if (row.delta > 0) {
        return (
          <Badge variant="high">
            {t('badge.worsened')} (+{row.delta})
          </Badge>
        );
      }
      if (row.delta < 0) {
        return (
          <Badge variant="low">
            {t('badge.improved')} ({row.delta})
          </Badge>
        );
      }
      return <Badge variant="neutral">{t('badge.unchanged')}</Badge>;
    }

    switch (row.reason) {
      case 'mode_changed':
        return <Badge variant="neutral">{t('badge.modeChanged')}</Badge>;
      case 'catalog_changed':
        return <Badge variant="neutral">{t('badge.catalogChanged')}</Badge>;
      case 'demo_mixed':
        return <Badge variant="neutral">{t('badge.demoMixed')}</Badge>;
      case 'first':
        return <Badge variant="neutral">{t('badge.first')}</Badge>;
      default:
        return <Badge variant="neutral">{t('badge.notComparable')}</Badge>;
    }
  }
}
