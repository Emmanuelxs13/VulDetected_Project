import 'server-only';

import { and, domains, eq, findings, scans } from '@vuldetected/db';
import { NextResponse } from 'next/server';

import { getServerSession } from '@/features/auth/session';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The normalised export shape (HU-12, CA-17).
 *
 * Field names are stable and tool-independent on purpose: a consumer parses the
 * same seven keys whether the finding came from the built-in checks, Nuclei or
 * ZAP. The JSON and the CSV share this exact list, so a header mismatch cannot
 * make one format silently disagree with the other.
 */
const EXPORT_FIELDS = [
  'id',
  'title',
  'severity',
  'endpoint',
  'evidence',
  'status',
  'detected_at',
] as const;

type ExportField = (typeof EXPORT_FIELDS)[number];
type ExportRow = Record<ExportField, unknown>;

/**
 * CSV escaping (RFC 4180).
 *
 * A field is quoted when it contains a comma, a double quote, a CR or an LF,
 * and embedded quotes are doubled. `\r` matters as much as `\n`: a field with a
 * lone carriage return would otherwise shift every later column by one.
 */
function csvEscape(value: unknown): string {
  const str =
    typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toRow(finding: {
  id: string;
  title: string;
  severity: string | null;
  affectedUrl: string;
  evidence: unknown;
  status: string;
  createdAt: Date;
}): ExportRow {
  return {
    id: finding.id,
    title: finding.title,
    // CA-17: when the classifier produced nothing, the exported value is the
    // literal `unclassified` rather than an empty cell or a guess.
    severity: finding.severity ?? 'unclassified',
    endpoint: finding.affectedUrl,
    evidence: finding.evidence ?? {},
    status: finding.status,
    detected_at: finding.createdAt.toISOString(),
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scanRows = await db()
    .select({ id: scans.id })
    .from(scans)
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(and(eq(scans.id, scanId), eq(domains.userId, session.user.id)))
    .limit(1);

  if (scanRows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const findingRows = await db()
    .select({
      id: findings.id,
      title: findings.title,
      severity: findings.severity,
      affectedUrl: findings.affectedUrl,
      evidence: findings.evidence,
      status: findings.status,
      createdAt: findings.createdAt,
    })
    .from(findings)
    .where(eq(findings.scanId, scanId))
    .orderBy(findings.createdAt);

  const rows = findingRows.map(toRow);

  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'csv';

  if (format === 'json') {
    // CA-17 + CA-19: an empty scan still yields a valid document with an empty
    // array, never an error and never a null.
    const body = JSON.stringify(
      { scanId, exportedAt: new Date().toISOString(), findings: rows },
      null,
      2,
    );
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="scan-${scanId}.json"`,
      },
    });
  }

  const header = EXPORT_FIELDS.join(',');
  const lines = rows.map((row) => EXPORT_FIELDS.map((field) => csvEscape(row[field])).join(','));
  const csv = [header, ...lines].join('\r\n') + '\r\n';

  /**
   * UTF-8 with BOM (CA-18).
   *
   * Excel on Windows decodes a BOM-less UTF-8 CSV as the ANSI code page, which
   * turns `Inyección` into mojibake. The BOM is the only signal it honours. The
   * charset is declared in the header for every other consumer.
   */
  const body = '\uFEFF' + csv;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="scan-${scanId}.csv"`,
    },
  });
}
