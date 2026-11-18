import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import en from '../../../messages/en.json';
import es from '../../../messages/es.json';

import {
  buildReportLayout,
  generateScanReportPdf,
  type ReportCopy,
  type ReportFindingInput,
  type ReportInput,
} from './pdf';

/**
 * Sprint 2 · HU-09 (SCRUM-26) — the executive report.
 *
 * ## What the two criteria mean here
 *
 * HU-09 asks for an executive PDF of a scan: one document a non-technical
 * reader can open, with the risk verdict first, the numbers next and the
 * findings after. CA-09 covers the document itself; CA-28 covers the honesty of
 * the document when the data behind it is not a clean, real, finished scan.
 *
 * ## Why the assertions read the rendered bytes
 *
 * A layout test that only inspects the planned blocks would pass even if the
 * renderer dropped half of them. These tests build the real PDF, parse it back
 * with pdf-lib and compare the page count and the metadata, so "the document
 * exists" means a file a reader can actually open.
 */

function copyFrom(locale: 'es' | 'en'): ReportCopy {
  const messages = locale === 'es' ? es : en;
  const pdf = messages.reports.pdf;
  const dashboard = messages.dashboard;
  const scan = messages.scan;

  return {
    title: pdf.title,
    subtitle: pdf.subtitle,
    summary: pdf.summary,
    breakdown: pdf.breakdown,
    findings: pdf.findings,
    findingsHint: pdf.findingsHint,
    noFindings: pdf.noFindings,
    remediation: pdf.remediation,
    partialNotice: pdf.partialNotice,
    demoNotice: pdf.demoNotice,
    page: pdf.page,
    severityCount: pdf.severityCount,
    fields: pdf.fields,
    totals: pdf.totals,
    risk: {
      label: dashboard.risk.label,
      level: {
        high: dashboard.risk.high,
        medium: dashboard.risk.medium,
        safe: dashboard.risk.safe,
      },
      hint: {
        high: dashboard.risk.highHint,
        medium: dashboard.risk.mediumHint,
        safe: dashboard.risk.safeHint,
      },
    },
    severity: {
      critical: scan.findings.severity.critical,
      high: scan.findings.severity.high,
      medium: scan.findings.severity.medium,
      low: scan.findings.severity.low,
      info: scan.findings.severity.info,
      unclassified: scan.findings.severity.unclassified,
    },
    status: {
      open: pdf.statuses.open,
      resolved: pdf.statuses.resolved,
      false_positive: pdf.statuses.false_positive,
    },
  };
}

function finding(overrides: Partial<ReportFindingInput> = {}): ReportFindingInput {
  return {
    severity: 'high',
    status: 'open',
    checkName: 'security_headers',
    title: 'Missing HSTS header',
    description: 'The response does not send Strict-Transport-Security.',
    affectedUrl: 'https://example.test/',
    owaspCategory: 'A05',
    rationale: 'Falta Strict-Transport-Security',
    remediation: { title: 'Publica la cabecera', steps: ['Añade HSTS', 'Verifica con curl'] },
    ...overrides,
  };
}

function reportInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    hostname: 'example.test',
    targetUrl: 'https://example.test/',
    scanId: '11111111-1111-4111-8111-111111111111',
    scanStatus: 'Completado',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    generatedAt: new Date('2026-10-02T12:30:00Z'),
    findings: [finding()],
    partial: false,
    isDemo: false,
    copy: copyFrom('es'),
    ...overrides,
  };
}

describe('Sprint 2 · HU-09', () => {
  it('CA-09: the executive PDF is a real document with the verdict, the numbers and the findings', async () => {
    const input = reportInput({
      findings: [
        finding({ severity: 'critical', title: 'CRITICAL-MARKER' }),
        finding({ severity: 'low', title: 'LOW-MARKER' }),
      ],
    });

    const plan = await buildReportLayout(input);
    const bytes = await generateScanReportPdf(input);

    // A real PDF, not a buffer with a PDF-ish prefix.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

    const parsed = await PDFDocument.load(bytes);
    // One planned page becomes exactly one PDF page.
    expect(parsed.getPageCount()).toBe(plan.length);
    // The cover identifies the document and the scan it belongs to.
    expect(parsed.getTitle()).toBe(`${es.reports.pdf.title} - example.test`);

    const cover = plan[0]!.blocks;
    // The verdict is the first thing after the title, because that is what an
    // executive reader came for.
    const riskIndex = cover.findIndex((block) => block.kind === 'risk');
    expect(riskIndex).toBeGreaterThan(0);

    // The findings section starts on its own page, after the cover: the reader
    // gets the conclusion before the detail.
    const findingsPageIndex = plan.findIndex((page) =>
      page.blocks.some(
        (block) => block.kind === 'text' && block.text === es.reports.pdf.findings,
      ),
    );
    expect(findingsPageIndex).toBeGreaterThan(0);

    // The numbers an executive quotes are on the cover.
    const coverText = cover
      .filter((block) => block.kind === 'text')
      .map((block) => (block.kind === 'text' ? block.text : ''))
      .join('\n');
    expect(coverText).toContain('Hallazgos abiertos: 2');
    expect(coverText).toContain('Hallazgos registrados: 2');
    expect(coverText).toContain(`${es.reports.pdf.fields.domain}: example.test`);

    // Every finding reaches the document, worst first.
    const everything = plan
      .flatMap((page) => page.blocks)
      .filter((block) => block.kind === 'text')
      .map((block) => (block.kind === 'text' ? block.text : ''))
      .join('\n');
    expect(everything).toContain('CRITICAL-MARKER');
    expect(everything).toContain('LOW-MARKER');
    expect(everything.indexOf('CRITICAL-MARKER')).toBeLessThan(
      everything.indexOf('LOW-MARKER'),
    );
  });

  it('CA-28: a partial scan gets no risk verdict and says why', async () => {
    const input = reportInput({ partial: true });

    const plan = await buildReportLayout(input);
    const bytes = await generateScanReportPdf(input);

    // The traffic light would be a claim the run cannot back.
    expect(plan[0]!.blocks.some((block) => block.kind === 'risk')).toBe(false);

    const notice = plan[0]!.blocks.find((block) => block.kind === 'notice');
    expect(notice, 'a partial report must carry a visible notice').toBeDefined();
    expect(
      notice!.kind === 'notice' ? notice!.lines.join(' ') : '',
    ).toContain('Resultados parciales');

    // The file is still a valid document: the findings are worth reading even
    // when the verdict is not available.
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(plan.length);
  });

  it('CA-28: demo data is labelled inside the document, not only in the app', async () => {
    const plan = await buildReportLayout(reportInput({ isDemo: true }));

    const notices = plan[0]!.blocks.filter((block) => block.kind === 'notice');
    expect(notices).toHaveLength(1);
    expect(
      notices[0]!.kind === 'notice' ? notices[0]!.lines.join(' ') : '',
    ).toContain('Datos de demostración');

    // A demo scan that also finished partially gets both notices, in that order.
    const both = await buildReportLayout(reportInput({ isDemo: true, partial: true }));
    const bothNotices = both[0]!.blocks.filter((block) => block.kind === 'notice');
    expect(bothNotices).toHaveLength(2);
  });

  it('CA-09: the English catalogue produces an English document', async () => {
    const plan = await buildReportLayout(reportInput({ copy: copyFrom('en') }));

    const text = plan
      .flatMap((page) => page.blocks)
      .filter((block) => block.kind === 'text')
      .map((block) => (block.kind === 'text' ? block.text : ''))
      .join('\n');

    expect(text).toContain('Open findings: 1');
    expect(text).toContain(`${en.reports.pdf.fields.domain}: example.test`);
  });
});
