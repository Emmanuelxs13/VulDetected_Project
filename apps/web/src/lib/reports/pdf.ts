/**
 * Executive PDF report for one scan.
 *
 * ## WHY THIS IS A MODULE AND NOT THE ROUTE
 *
 * The route's job is authentication, ownership and the query. The document's job
 * is layout. Keeping them apart is what makes the layout testable in plain Node:
 * the tests below feed findings directly and assert on the produced bytes and on
 * the page plan, with no HTTP, no session and no database.
 *
 * ## WHY THE LAYOUT IS BUILT BEFORE ANYTHING IS DRAWN
 *
 * The footer says "page N of M", and M is not known while streaming pages. So the
 * document is planned first (every line measured and paginated in memory) and
 * only then rendered. The plan is also the honest answer to "was anything
 * dropped?": whatever is in the plan is drawn, and a test asserts every finding
 * reached it. The previous implementation broke out of its loops near the bottom
 * of a single page, so a scan with more findings than fitted produced a PDF that
 * silently omitted the rest.
 *
 * ## WHY THE COPY ARRIVES AS AN ARGUMENT
 *
 * `TRAFFIC_LIGHT_LABELS` is Spanish-only product copy, but the document has
 * twenty more labels. Hardcoding them here would put UI copy outside the i18n
 * catalogue, so the route resolves them and passes a `ReportCopy`. The three risk
 * labels are still the roadmap strings in Spanish; a test pins them to
 * `TRAFFIC_LIGHT_LABELS` so no screen can invent a fourth wording.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { SEVERITY_ORDER, type Severity } from '@/lib/severity/classify';
import { OWASP_TOP10_2021 } from '@/lib/severity/owasp';
import { computeTrafficLight, type TrafficLightLevel } from '@/lib/severity/traffic-light';

/** A4 in PostScript points, the size every printer and reader expects. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Baseline of the first line on a page. */
const CONTENT_TOP = PAGE_HEIGHT - 64;
/** Content never crosses this line; the footer lives below it. */
const CONTENT_BOTTOM = 78;
/** Multiplier from font size to line box. 1.42 keeps descenders clear. */
const LINE_FACTOR = 1.42;

/** One finding, flattened by the route from the database row and its rule. */
export interface ReportFindingInput {
  severity: Severity;
  status: 'open' | 'resolved' | 'false_positive';
  checkName: string;
  title: string;
  description: string;
  affectedUrl: string;
  /** OWASP Top 10 (2021) code, or `null` when the check is not mapped. */
  owaspCategory: string | null;
  /** Already translated: the classifier's explanation of this finding. */
  rationale: string;
  /** Developer guidance, present for the rules that have a registry entry. */
  remediation?: { title: string; steps: readonly string[] };
}

export interface ReportRiskCopy {
  label: string;
  level: Record<TrafficLightLevel, string>;
  hint: Record<TrafficLightLevel, string>;
}

/** Every fixed string the document draws, resolved by the caller's locale. */
export interface ReportCopy {
  title: string;
  subtitle: string;
  summary: string;
  breakdown: string;
  findings: string;
  findingsHint: string;
  noFindings: string;
  remediation: string;
  /** Template with `{current}` and `{total}`. */
  page: string;
  /** Template with `{severity}` and `{count}`. */
  severityCount: string;
  fields: {
    domain: string;
    target: string;
    scanId: string;
    scanStatus: string;
    createdAt: string;
    generatedAt: string;
    affectedUrl: string;
    rule: string;
    owasp: string;
    rationale: string;
  };
  totals: { open: string; total: string };
  risk: ReportRiskCopy;
  severity: Record<Severity, string>;
  status: Record<'open' | 'resolved' | 'false_positive', string>;
}

export interface ReportInput {
  hostname: string;
  targetUrl: string;
  scanId: string;
  scanStatus: string;
  createdAt: Date;
  generatedAt: Date;
  findings: readonly ReportFindingInput[];
  copy: ReportCopy;
}

export type ReportTextTone = 'ink' | 'muted' | 'risk-high' | 'risk-medium' | 'risk-safe';

export type ReportBlock =
  | {
      kind: 'text';
      text: string;
      size: number;
      bold: boolean;
      tone: ReportTextTone;
      indent: number;
      height: number;
    }
  | { kind: 'gap'; height: number }
  | {
      kind: 'risk';
      level: TrafficLightLevel;
      label: string;
      hintLines: readonly string[];
      height: number;
    };

export interface ReportPage {
  blocks: ReportBlock[];
}

interface Measurer {
  width(text: string, size: number, bold: boolean): number;
}

/**
 * Characters that `WinAnsiEncoding` cannot represent but that appear in real
 * finding data (copied from web pages, so typographic quotes and dashes are
 * everywhere). `drawText` throws on anything else, and a report that fails
 * because a title contains a curly quote is not a report.
 */
const WIN_ANSI_REPLACEMENTS: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201A': ',',
  '\u201C': '"',
  '\u201D': '"',
  '\u201E': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2212': '-',
  '\u2026': '...',
  '\u00A0': ' ',
  '\u2022': '-',
  '\u00B7': '-',
  '\u20AC': 'EUR',
  '\u2192': '->',
  '\u2190': '<-',
  '\u2264': '<=',
  '\u2265': '>=',
};

function toWinAnsi(input: string): string {
  let out = '';
  for (const char of input) {
    if (char === '\n' || char === '\r' || char === '\t') {
      out += ' ';
      continue;
    }

    const mapped = WIN_ANSI_REPLACEMENTS[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }

    const code = char.codePointAt(0) ?? 0x3f;
    const printable = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
    out += printable ? char : '?';
  }

  return out;
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

function formatDate(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

async function createMeasurer(): Promise<Measurer> {
  const doc = await PDFDocument.create();
  const [regular, bold] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);

  return {
    width: (text, size, isBold) => (isBold ? bold : regular).widthOfTextAtSize(text, size),
  };
}

/**
 * Greedy word wrap, with a hard split for tokens wider than the column (long
 * URLs and hashes have no spaces). Nothing is truncated: a word that does not fit
 * continues on the next line.
 */
function wrapText(
  text: string,
  size: number,
  bold: boolean,
  maxWidth: number,
  measurer: Measurer,
): string[] {
  const normalized = toWinAnsi(text).replace(/\s+/g, ' ').trim();
  if (normalized === '') {
    return [];
  }

  const lines: string[] = [];
  let current = '';

  for (const word of normalized.split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (measurer.width(candidate, size, bold) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current !== '') {
      lines.push(current);
      current = '';
    }

    if (measurer.width(word, size, bold) <= maxWidth) {
      current = word;
      continue;
    }

    let chunk = '';
    for (const char of word) {
      const next = chunk + char;
      if (measurer.width(next, size, bold) <= maxWidth) {
        chunk = next;
      } else {
        if (chunk !== '') {
          lines.push(chunk);
        }
        chunk = char;
      }
    }
    current = chunk;
  }

  if (current !== '') {
    lines.push(current);
  }

  return lines;
}

/**
 * Vertical cursor over a list of pages. It owns the "does this fit?" decision so
 * no caller can forget it, which is exactly how the old version lost findings.
 */
class ReportPaginator {
  readonly pages: ReportPage[] = [{ blocks: [] }];
  private cursor = CONTENT_TOP;

  get current(): ReportPage {
    const page = this.pages[this.pages.length - 1];
    if (!page) {
      throw new Error('Report paginator has no page');
    }
    return page;
  }

  private get remaining(): number {
    return this.cursor - CONTENT_BOTTOM;
  }

  break(): void {
    if (this.current.blocks.length > 0) {
      this.pages.push({ blocks: [] });
      this.cursor = CONTENT_TOP;
    }
  }

  /** Starts a new page when a block of `height` would cross the footer. */
  ensure(height: number): void {
    if (this.remaining < height) {
      this.break();
    }
  }

  push(block: ReportBlock): void {
    this.ensure(block.height);
    this.current.blocks.push(block);
    this.cursor -= block.height;
  }
}

const SEVERITY_RANK = new Map<Severity, number>(
  SEVERITY_ORDER.map((severity, index) => [severity, index] as const),
);

/** Worst first. Stable, so the query's own order breaks ties. */
function orderFindings(findings: readonly ReportFindingInput[]): ReportFindingInput[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_RANK.get(a.severity) ?? 99) - (SEVERITY_RANK.get(b.severity) ?? 99),
  );
}

/**
 * Plans every page: all text is measured and wrapped, and a page break is
 * inserted only when the next block would not fit. This is the whole document.
 */
export async function buildReportLayout(input: ReportInput): Promise<ReportPage[]> {
  const measurer = await createMeasurer();
  const { copy } = input;
  const paginator = new ReportPaginator();
  const trafficLight = computeTrafficLight(
    input.findings.map((finding) => ({ severity: finding.severity, status: finding.status })),
  );

  const text = (
    value: string,
    size: number,
    options: { bold?: boolean; tone?: ReportTextTone; indent?: number } = {},
  ): void => {
    const bold = options.bold ?? false;
    const indent = options.indent ?? 0;
    const lines = wrapText(value, size, bold, CONTENT_WIDTH - indent, measurer);

    for (const line of lines) {
      paginator.push({
        kind: 'text',
        text: line,
        size,
        bold,
        tone: options.tone ?? 'ink',
        indent,
        height: size * LINE_FACTOR,
      });
    }
  };

  const gap = (height: number): void => {
    paginator.push({ kind: 'gap', height });
  };

  /** A heading never sits alone at the bottom of a page. */
  const heading = (value: string, size = 13): void => {
    paginator.ensure(size * LINE_FACTOR * 4);
    if (paginator.current.blocks.length > 0) {
      gap(10);
    }
    text(value, size, { bold: true });
    gap(4);
  };

  // ---------------------------------------------------------------- cover ---
  text(copy.title, 20, { bold: true });
  gap(3);
  text(formatTemplate(copy.subtitle, { host: input.hostname }), 11, { tone: 'muted' });
  gap(14);

  const hintLines = wrapText(
    copy.risk.hint[trafficLight.level],
    9,
    false,
    CONTENT_WIDTH - 24,
    measurer,
  );
  const bandHeight = 12 + 20 + 6 + Math.max(1, hintLines.length) * 13 + 12;
  paginator.push({
    kind: 'risk',
    level: trafficLight.level,
    label: copy.risk.level[trafficLight.level],
    hintLines,
    height: bandHeight,
  });
  gap(16);

  heading(copy.summary);
  text(`${copy.fields.domain}: ${input.hostname}`, 9.5);
  text(`${copy.fields.target}: ${input.targetUrl}`, 9.5);
  text(`${copy.fields.scanId}: ${input.scanId}`, 9.5);
  text(`${copy.fields.scanStatus}: ${input.scanStatus}`, 9.5);
  text(`${copy.fields.createdAt}: ${formatDate(input.createdAt)}`, 9.5);
  text(`${copy.fields.generatedAt}: ${formatDate(input.generatedAt)}`, 9.5);
  gap(8);

  text(`${copy.totals.open}: ${trafficLight.openFindings}`, 10, { bold: true });
  text(`${copy.totals.total}: ${input.findings.length}`, 10);
  gap(6);

  heading(copy.breakdown, 11);
  for (const severity of SEVERITY_ORDER) {
    text(
      formatTemplate(copy.severityCount, {
        severity: copy.severity[severity],
        count: trafficLight.counts[severity],
      }),
      9.5,
    );
  }

  // ------------------------------------------------------------- findings ---
  paginator.break();
  paginator.ensure(80);
  text(copy.findings, 16, { bold: true });
  gap(3);
  text(copy.findingsHint, 9, { tone: 'muted' });
  gap(4);

  const ordered = orderFindings(input.findings);
  if (ordered.length === 0) {
    text(copy.noFindings, 10, { tone: 'muted' });
    return paginator.pages;
  }

  ordered.forEach((finding, index) => {
    if (index > 0) {
      gap(10);
    }
    // Keep the header and a few lines of the body together: a finding title
    // alone at the bottom of a page reads as an empty section.
    paginator.ensure(110);

    text(`${index + 1}. ${finding.title}`, 11, { bold: true });
    text(`${copy.severity[finding.severity]} \u00b7 ${copy.status[finding.status]}`, 9, {
      tone: 'muted',
    });
    text(`${copy.fields.affectedUrl}: ${finding.affectedUrl}`, 8.5, { tone: 'muted' });

    const owasp = finding.owaspCategory ? OWASP_TOP10_2021[finding.owaspCategory] : undefined;
    const rule = owasp
      ? `${copy.fields.rule}: ${finding.checkName} \u00b7 ${copy.fields.owasp} ${owasp.code} ${owasp.title}`
      : `${copy.fields.rule}: ${finding.checkName}`;
    text(rule, 8.5, { tone: 'muted' });
    text(`${copy.fields.rationale}: ${finding.rationale}`, 8.5, { tone: 'muted' });
    gap(2);

    text(finding.description, 9);

    // Remediation is the actionable half of the report, and it is only drawn
    // for the findings that need action. Low and informational findings are
    // listed for the record; giving each one a fix list buries the real work.
    if (
      (finding.severity === 'critical' || finding.severity === 'high') &&
      finding.remediation
    ) {
      gap(4);
      text(`${copy.remediation}: ${finding.remediation.title}`, 9, { bold: true });
      for (const step of finding.remediation.steps) {
        text(`- ${step}`, 8.5, { tone: 'muted', indent: 10 });
      }
    }
  });

  return paginator.pages;
}

const TONE_COLORS = {
  ink: rgb(0.09, 0.11, 0.13),
  muted: rgb(0.42, 0.45, 0.5),
  'risk-high': rgb(0.72, 0.11, 0.11),
  'risk-medium': rgb(0.72, 0.47, 0.05),
  'risk-safe': rgb(0.07, 0.45, 0.26),
} satisfies Record<ReportTextTone, ReturnType<typeof rgb>>;

const RISK_FILL: Record<TrafficLightLevel, ReturnType<typeof rgb>> = {
  high: rgb(0.99, 0.92, 0.92),
  medium: rgb(0.99, 0.96, 0.87),
  safe: rgb(0.92, 0.97, 0.93),
};

const RISK_EDGE: Record<TrafficLightLevel, ReturnType<typeof rgb>> = {
  high: TONE_COLORS['risk-high'],
  medium: TONE_COLORS['risk-medium'],
  safe: TONE_COLORS['risk-safe'],
};

/**
 * Renders the plan into A4 pages. One planned page becomes exactly one PDF page,
 * which is what lets the tests assert the page count from the plan.
 */
export async function generateScanReportPdf(input: ReportInput): Promise<Uint8Array> {
  const pages = await buildReportLayout(input);
  const doc = await PDFDocument.create();

  const [regular, bold] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);

  doc.setTitle(`${input.copy.title} - ${input.hostname}`);
  doc.setAuthor('VulDetected');
  doc.setCreator('VulDetected');
  doc.setProducer('VulDetected');
  doc.setCreationDate(input.generatedAt);

  pages.forEach((planned, pageIndex) => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let cursor = CONTENT_TOP;

    for (const block of planned.blocks) {
      switch (block.kind) {
        case 'gap':
          cursor -= block.height;
          break;

        case 'text': {
          page.drawText(block.text, {
            x: MARGIN + block.indent,
            y: cursor - block.size,
            size: block.size,
            font: block.bold ? bold : regular,
            color: TONE_COLORS[block.tone],
          });
          cursor -= block.height;
          break;
        }

        case 'risk': {
          const top = cursor;
          page.drawRectangle({
            x: MARGIN,
            y: top - block.height,
            width: CONTENT_WIDTH,
            height: block.height,
            color: RISK_FILL[block.level],
            borderColor: RISK_EDGE[block.level],
            borderWidth: 1,
          });
          page.drawText(block.label, {
            x: MARGIN + 12,
            y: top - 12 - 14,
            size: 16,
            font: bold,
            color: RISK_EDGE[block.level],
          });
          block.hintLines.forEach((line, index) => {
            page.drawText(line, {
              x: MARGIN + 12,
              y: top - 12 - 20 - 6 - 9 - index * 13,
              size: 9,
              font: regular,
              color: TONE_COLORS.muted,
            });
          });
          cursor -= block.height;
          break;
        }
      }
    }

    const footerY = 46;
    page.drawLine({
      start: { x: MARGIN, y: footerY },
      end: { x: PAGE_WIDTH - MARGIN, y: footerY },
      thickness: 0.5,
      color: rgb(0.82, 0.84, 0.87),
    });

    const left = toWinAnsi(`VulDetected \u00b7 ${input.hostname}`).slice(0, 90);
    page.drawText(left, {
      x: MARGIN,
      y: 30,
      size: 8,
      font: regular,
      color: TONE_COLORS.muted,
    });

    const pageLabel = formatTemplate(input.copy.page, {
      current: pageIndex + 1,
      total: pages.length,
    });
    page.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageLabel, 8),
      y: 30,
      size: 8,
      font: regular,
      color: TONE_COLORS.muted,
    });
  });

  return doc.save();
}
