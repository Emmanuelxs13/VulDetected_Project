import 'server-only';

import { and, domains, eq, findings, scans } from '@vuldetected/db';
import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';
import { db } from '@/lib/db';
import { getRemediation } from '@/lib/remediation/registry';
import {
  classifyFinding,
  type Severity,
} from '@/lib/severity/classify';
import {
  generateScanReportPdf,
  type ReportFindingInput,
  type ReportInput,
} from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';

/**
 * Executive PDF for one scan.
 *
 * ## WHY THERE IS NO PLAN CHECK
 *
 * The Free plan runs the whole product; plans differ in capacity, not in
 * features (see `lib/plans.ts`). This route used to answer 403 for `free`, which
 * made the one deliverable buyers evaluate the product with unavailable during
 * the trial. The limits that do exist are numeric and enforced where work is
 * created, not here.
 *
 * ## WHY THE ROUTE DOES NOT BUILD THE DOCUMENT
 *
 * Layout lives in `lib/reports/pdf.ts`, which is pure and tested without a
 * database. This handler only resolves the caller's identity, proves ownership,
 * reads the rows and supplies the translated copy.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The scan is reached through the domain it belongs to, and the domain
  // through the account that proved ownership of it. A scan id is not a secret.
  const scanRows = await db()
    .select({
      id: scans.id,
      targetUrl: scans.targetUrl,
      status: scans.status,
      createdAt: scans.createdAt,
      hostname: domains.normalizedHostname,
    })
    .from(scans)
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(and(eq(scans.id, scanId), eq(domains.userId, session.user.id)))
    .limit(1);

  const scan = scanRows[0];
  if (!scan) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [tPdf, tScan, tDashboard] = await Promise.all([
    getTranslations('reports.pdf'),
    getTranslations('scan'),
    getTranslations('dashboard'),
  ]);

  const findingRows = await db()
    .select({
      severity: findings.severity,
      status: findings.status,
      checkName: findings.checkName,
      title: findings.title,
      description: findings.description,
      affectedUrl: findings.affectedUrl,
      evidence: findings.evidence,
      owaspCategory: findings.owaspCategory,
    })
    .from(findings)
    .where(eq(findings.scanId, scanId))
    .orderBy(findings.createdAt);

  const reportFindings: ReportFindingInput[] = findingRows.map((row) => {
    const classification = classifyFinding(
      row.checkName,
      (row.evidence ?? {}) as Record<string, unknown>,
      row.title,
    );
    const remediation = getRemediation(row.checkName);

    // The classifier returns a vocabulary key, not a sentence. Rendering it raw
    // would print `missingHsts` in an executive document.
    const rationaleKey = `findings.rationale.${classification.rationale}` as never;
    const rationale = tScan.has(rationaleKey) ? tScan(rationaleKey) : classification.rationale;

    return {
      severity: row.severity,
      status: row.status,
      checkName: row.checkName,
      title: row.title,
      description: row.description,
      affectedUrl: row.affectedUrl,
      owaspCategory: row.owaspCategory,
      rationale,
      remediation: remediation
        ? { title: remediation.developerGuide.title, steps: remediation.developerGuide.steps }
        : undefined,
    };
  });

  const scanStatusKey = `status.${scan.status}` as never;
  const scanStatus = tScan.has(scanStatusKey) ? tScan(scanStatusKey) : scan.status;

  const severityCopy: Record<Severity, string> = {
    critical: tScan('findings.severity.critical'),
    high: tScan('findings.severity.high'),
    medium: tScan('findings.severity.medium'),
    low: tScan('findings.severity.low'),
    info: tScan('findings.severity.info'),
    unclassified: tScan('findings.severity.unclassified'),
  };

  const input: ReportInput = {
    hostname: scan.hostname,
    targetUrl: scan.targetUrl,
    scanId: scan.id,
    scanStatus,
    createdAt: scan.createdAt,
    generatedAt: new Date(),
    findings: reportFindings,
    copy: {
      title: tPdf('title'),
      subtitle: tPdf('subtitle'),
      summary: tPdf('summary'),
      breakdown: tPdf('breakdown'),
      findings: tPdf('findings'),
      findingsHint: tPdf('findingsHint'),
      noFindings: tPdf('noFindings'),
      remediation: tPdf('remediation'),
      page: tPdf('page'),
      severityCount: tPdf('severityCount'),
      fields: {
        domain: tPdf('fields.domain'),
        target: tPdf('fields.target'),
        scanId: tPdf('fields.scanId'),
        scanStatus: tPdf('fields.scanStatus'),
        createdAt: tPdf('fields.createdAt'),
        generatedAt: tPdf('fields.generatedAt'),
        affectedUrl: tPdf('fields.affectedUrl'),
        rule: tPdf('fields.rule'),
        owasp: tPdf('fields.owasp'),
        rationale: tPdf('fields.rationale'),
      },
      totals: {
        open: tPdf('totals.open'),
        total: tPdf('totals.total'),
      },
      risk: {
        label: tDashboard('risk.label'),
        level: {
          high: tDashboard('risk.high'),
          medium: tDashboard('risk.medium'),
          safe: tDashboard('risk.safe'),
        },
        hint: {
          high: tDashboard('risk.highHint'),
          medium: tDashboard('risk.mediumHint'),
          safe: tDashboard('risk.safeHint'),
        },
      },
      severity: severityCopy,
      status: {
        open: tPdf('statuses.open'),
        resolved: tPdf('statuses.resolved'),
        false_positive: tPdf('statuses.false_positive'),
      },
    },
  };

  const pdfBytes = await generateScanReportPdf(input);

  const safeHost = scan.hostname.replace(/[^a-z0-9.-]/gi, '_');
  const filename = `vuldetected-${safeHost}-${scan.id.slice(0, 8)}.pdf`;

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // The document contains the account's own findings: no shared cache may
      // keep a copy.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
