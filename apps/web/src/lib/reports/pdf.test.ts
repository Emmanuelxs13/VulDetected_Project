import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { TRAFFIC_LIGHT_LABELS } from '@/lib/severity/traffic-light';
import en from '../../../messages/en.json';
import es from '../../../messages/es.json';

import {
  buildReportLayout,
  generateScanReportPdf,
  type ReportCopy,
  type ReportFindingInput,
  type ReportInput,
  type ReportPage,
} from './pdf';

/**
 * The copy is assembled from the same two catalogues the route reads, so a key
 * renamed in `messages/` breaks these tests instead of producing a PDF full of
 * `reports.pdf.fields.domain`.
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
    findings: [],
    copy: copyFrom('es'),
    ...overrides,
  };
}

/** Everything a reader would see, in reading order. */
function allText(pages: readonly ReportPage[]): string {
  return pages
    .flatMap((page) => page.blocks)
    .map((block) => {
      if (block.kind === 'text') return block.text;
      if (block.kind === 'risk') return [block.label, ...block.hintLines].join(' ');
      return '';
    })
    .join('\n');
}

describe('buildReportLayout', () => {
  it('prints the roadmap risk labels that the dashboard uses', () => {
    // The Spanish catalogue is the canonical wording; the PDF must not invent a
    // fourth label for a state the rest of the product already names.
    expect(es.dashboard.risk.high).toBe(TRAFFIC_LIGHT_LABELS.high);
    expect(es.dashboard.risk.medium).toBe(TRAFFIC_LIGHT_LABELS.medium);
    expect(es.dashboard.risk.safe).toBe(TRAFFIC_LIGHT_LABELS.safe);
  });

  it('shows the computed level on the cover, not a stored one', async () => {
    const withHigh = await buildReportLayout(reportInput({ findings: [finding()] }));
    const highBand = withHigh[0]?.blocks.find((block) => block.kind === 'risk');
    expect(highBand).toMatchObject({ kind: 'risk', level: 'high', label: 'Riesgo Alto' });

    const safe = await buildReportLayout(
      reportInput({ findings: [finding({ severity: 'low' })] }),
    );
    expect(safe[0]?.blocks.find((block) => block.kind === 'risk')).toMatchObject({
      level: 'safe',
      label: 'Seguro / Riesgo Bajo',
    });
  });

  it('counts only open findings on the cover', async () => {
    const pages = await buildReportLayout(
      reportInput({
        findings: [
          finding({ severity: 'high', status: 'open' }),
          finding({ severity: 'critical', status: 'resolved' }),
          finding({ severity: 'medium', status: 'false_positive' }),
        ],
      }),
    );
    const text = allText(pages);

    expect(text).toContain('Hallazgos abiertos: 1');
    expect(text).toContain('Hallazgos registrados: 3');
  });

  it('orders findings from critical to informational', async () => {
    const pages = await buildReportLayout(
      reportInput({
        findings: [
          finding({ severity: 'low', title: 'LOW-MARKER' }),
          finding({ severity: 'critical', title: 'CRITICAL-MARKER' }),
          finding({ severity: 'medium', title: 'MEDIUM-MARKER' }),
        ],
      }),
    );
    const text = allText(pages);

    expect(text.indexOf('CRITICAL-MARKER')).toBeLessThan(text.indexOf('MEDIUM-MARKER'));
    expect(text.indexOf('MEDIUM-MARKER')).toBeLessThan(text.indexOf('LOW-MARKER'));
  });

  it('keeps every finding in a report that spans many pages', async () => {
    const findings = Array.from({ length: 120 }, (_, index) =>
      finding({ title: `FINDING-${String(index).padStart(4, '0')}` }),
    );
    const pages = await buildReportLayout(reportInput({ findings }));
    const text = allText(pages);

    expect(pages.length).toBeGreaterThan(3);
    for (const item of findings) {
      expect(text, `missing ${item.title}`).toContain(item.title);
    }
  });

  it('wraps instead of truncating long descriptions', async () => {
    const tail = 'COLETILLA-FINAL-NO-TRUNCAR';
    const description = `${'Una descripción larga que debe fluir entre líneas. '.repeat(60)}${tail}`;
    const pages = await buildReportLayout(
      reportInput({ findings: [finding({ description })] }),
    );

    expect(pages.length).toBeGreaterThan(1);
    expect(allText(pages)).toContain(tail);
  });

  it('wraps a URL with no spaces instead of cutting it', async () => {
    const url = `https://example.test/${'segmento/'.repeat(40)}TAIL-SEGMENT`;
    const pages = await buildReportLayout(
      reportInput({ findings: [finding({ affectedUrl: url })] }),
    );

    expect(allText(pages)).toContain('TAIL-SEGMENT');
  });

  it('includes remediation only for critical and high findings', async () => {
    const pages = await buildReportLayout(
      reportInput({
        findings: [
          finding({
            severity: 'high',
            title: 'HIGH-ONE',
            remediation: { title: 'HIGH-REMEDIATION', steps: ['PASO-ALTO'] },
          }),
          finding({
            severity: 'medium',
            title: 'MEDIUM-ONE',
            remediation: { title: 'MEDIUM-REMEDIATION', steps: ['PASO-MEDIO'] },
          }),
        ],
      }),
    );
    const text = allText(pages);

    expect(text).toContain('HIGH-REMEDIATION');
    expect(text).toContain('PASO-ALTO');
    // A fix list on every informational finding buries the two that matter.
    expect(text).not.toContain('MEDIUM-REMEDIATION');
    expect(text).not.toContain('PASO-MEDIO');
  });

  it('explains an empty scan without pretending it is an error', async () => {
    const pages = await buildReportLayout(reportInput());
    const text = allText(pages);

    expect(text).toContain(copyFrom('es').noFindings);
    expect(pages[0]?.blocks.find((block) => block.kind === 'risk')).toMatchObject({
      level: 'safe',
    });
  });

  it('survives characters the PDF font cannot encode', async () => {
    // Titles come from scanned pages, so they can contain anything. `drawText`
    // throws on unencodable input, and losing the whole report to an emoji is
    // not an acceptable failure mode.
    const pages = await buildReportLayout(
      reportInput({
        findings: [
          finding({
            title: 'Ошибка безопасности \u{1F512}',
            description: 'Cabecera ausente — revisar “CSP” y ‘HSTS’',
          }),
        ],
      }),
    );
    const text = allText(pages);

    expect(text).toContain('?');
    expect(text).toContain('"CSP"');
    expect(text).not.toContain('\u{1F512}');
  });
});

describe('generateScanReportPdf', () => {
  it('produces a valid PDF with one page per planned page', async () => {
    const findings = Array.from({ length: 40 }, (_, index) =>
      finding({ title: `FINDING-${index}`, description: 'Descripción de prueba.' }),
    );
    const input = reportInput({ findings });
    const layout = await buildReportLayout(input);
    const bytes = await generateScanReportPdf(input);

    // `%PDF-` is the signature every reader checks before anything else.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(layout.length);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });

  it('renders an empty scan as a document, not as an error', async () => {
    const bytes = await generateScanReportPdf(reportInput());
    const parsed = await PDFDocument.load(bytes);

    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(parsed.getTitle()).toContain('example.test');
  });

  it('renders the English catalogue when the caller asks for it', async () => {
    const input = reportInput({ copy: copyFrom('en'), findings: [finding()] });
    const layout = await buildReportLayout(input);
    const text = allText(layout);

    expect(text).toContain('High risk');
    expect(text).toContain('Open findings: 1');

    const parsed = await PDFDocument.load(await generateScanReportPdf(input));
    expect(parsed.getPageCount()).toBe(layout.length);
  });
});
