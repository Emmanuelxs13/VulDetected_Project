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

/** One finding, flattened for the table. */
export interface FindingRow {
  id: string;
  severity: string;
  checkName: string;
  title: string;
  description: string;
  affectedUrl: string;
  scanId?: string;
}

export async function FindingsList({ findings }: { findings: FindingRow[] }) {
  const t = await getTranslations('scan');

  if (findings.length === 0) {
    return (
      <EmptyState title={t('findings.empty.title')} description={t('findings.empty.description')} />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('findings.table.severity')}</TableHead>
          <TableHead>{t('findings.table.check')}</TableHead>
          <TableHead>{t('findings.table.finding')}</TableHead>
          <TableHead>{t('findings.table.affectedUrl')}</TableHead>
          <TableHead></TableHead>
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
