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
export function FindingsList({ findings }: { findings: FindingRow[] }) {
  if (findings.length === 0) {
    return (
      <EmptyState
        title="Sin hallazgos"
        description="Este escaneo no registró hallazgos. Un escaneo completado sin hallazgos es un resultado válido, no un error."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Severidad</TableHead>
          <TableHead>Comprobación</TableHead>
          <TableHead>Hallazgo</TableHead>
          <TableHead>URL afectada</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {findings.map((finding) => (
          <TableRow key={finding.id}>
            <TableCell>
              <Badge variant="unknown">{severityLabel(finding.severity)}</Badge>
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
function severityLabel(severity: string): string {
  return severity === 'unclassified' ? 'Sin clasificar' : severity;
}
