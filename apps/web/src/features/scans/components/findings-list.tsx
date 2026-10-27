import { getTranslations } from 'next-intl/server';
import {
  Badge,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vuldetected/ui';
import Link from 'next/link';

import { getSeverityVariant as getSeverityBadgeVariant } from '@/lib/severity/classify';
import { FindingStatusControl } from './finding-status-control';

/** One finding, flattened for the table. */
export interface FindingRow {
  id: string;
  severity: string;
  status: 'open' | 'false_positive' | 'resolved';
  checkName: string;
  title: string;
  description: string;
  affectedUrl: string;
  scanId?: string;
}

export async function FindingsList({
  findings,
  emptyTitle,
  emptyDescription,
}: {
  findings: FindingRow[];
  /** Overrides the scan-detail empty copy when the list is not scoped to one scan. */
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const t = await getTranslations('scan');

  if (findings.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? t('findings.empty.title')}
        description={emptyDescription ?? t('findings.empty.description')}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('findings.table.severity')}</TableHead>
          <TableHead>{t('findings.table.check')}</TableHead>
          <TableHead>{t('findings.table.finding')}</TableHead>
          <TableHead>{t('findings.table.status')}</TableHead>
          <TableHead>{t('findings.table.affectedUrl')}</TableHead>
          <TableHead>
            <span className="sr-only">{t('findings.table.actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {findings.map((finding) => (
          <TableRow key={finding.id}>
            <TableCell>
              <Badge variant={getSeverityBadgeVariant(finding.severity)}>
                {finding.severity === 'unclassified'
                  ? t('findings.severity.unclassified')
                  : t.has(`findings.severity.${finding.severity}` as never)
                    ? t(`findings.severity.${finding.severity}` as never)
                    : finding.severity}
              </Badge>
            </TableCell>
            <TableCell>
              <span className="font-mono text-xs">{finding.checkName}</span>
            </TableCell>
            <TableCell title={finding.description}>
              <span className="text-xs">{finding.title}</span>
            </TableCell>
            <TableCell>
              <FindingStatusControl findingId={finding.id} status={finding.status} />
            </TableCell>
            <TableCell>
              <span className="break-all font-mono text-xs">{finding.affectedUrl}</span>
            </TableCell>
            <TableCell>
              {finding.scanId ? (
                <Link
                  href={`/scans/${finding.scanId}/findings/${finding.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  {t('findings.viewDetails')}
                </Link>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
