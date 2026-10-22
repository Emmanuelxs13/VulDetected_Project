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

/** One finding, flattened for the table. */
export interface FindingRow {
  id: string;
  severity: string;
  checkName: string;
  title: string;
  description: string;
  affectedUrl: string;
}

/**
 * Findings of one scan.
 *
 * ## WHY EVERY SEVERITY READS "SIN CLASIFICAR"
 *
 * Sprint 2 writes exactly one severity value: `unclassified` (DM-3). The
 * classification rules land in Sprint 3, so the badge shows the honest label
 * instead of a colour that would imply a triage decision nobody made. The
 * `unknown` variant of the badge is the design system's vocabulary for that
 * (ADR 0003).
 */
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
        </TableRow>
      </TableHeader>
      <TableBody>
        {findings.map((finding) => (
          <TableRow key={finding.id}>
            <TableCell>
              <Badge variant="unknown">
                {severityLabel(finding.severity, t('findings.severity.unclassified'))}
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Severity label.
 *
 * Only `unclassified` is written in Sprint 2. Any other value is a future
 * Sprint 3 severity and is shown verbatim rather than guessed at.
 */
function severityLabel(severity: string, unclassifiedLabel: string): string {
  return severity === 'unclassified' ? unclassifiedLabel : severity;
}
