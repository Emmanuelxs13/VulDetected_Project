/**
 * Transactional email templates.
 *
 * ## Why the copy lives here and not in `messages/*.json`
 *
 * `next-intl` resolves messages inside a request, from the request's locale.
 * These messages are rendered when a row is enqueued — sometimes from a worker
 * with no request at all — and the recipient's language comes from their
 * profile, not from the browser that happens to be calling. A plain two-locale
 * dictionary next to the templates is the honest tool for that, and the
 * `Record<MailLocale, …>` shape makes a missing translation a type error.
 *
 * ## Why every interpolated value is escaped
 *
 * Hostnames, URLs and finding titles are user-controlled. A finding title comes
 * from the scanner, and a target URL comes from the account owner; neither may
 * be able to inject markup into a message this product sends. `escapeHtml`
 * is applied to every value, without exceptions, and links are only rendered
 * when the URL parses as http(s).
 */

export type MailLocale = 'es' | 'en';

/**
 * Better Auth's default lifetimes, written down because the templates promise
 * them to the reader. If the library default ever changes, the email would start
 * lying, so the numbers live next to the copy that quotes them and are asserted
 * in the template test.
 */
export const VERIFICATION_TTL_HOURS = 24;
export const RESET_TTL_MINUTES = 60;

/** Severity buckets the summary shows. `unclassified` is counted in `other`. */
export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  other: number;
  total: number;
}

export interface CriticalFindingSummary {
  title: string;
  affectedUrl: string;
}

export interface MailTemplateData {
  verify_email: { url: string; expiresInHours: number };
  reset_password: { url: string; expiresInMinutes: number };
  scan_completed: {
    hostname: string;
    targetUrl: string;
    scanUrl: string;
    counts: SeverityCounts;
  };
  new_critical_finding: {
    hostname: string;
    scanUrl: string;
    findings: CriticalFindingSummary[];
  };
}

export type MailTemplate = keyof MailTemplateData;

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns the URL when it is an http(s) absolute URL, otherwise `null`.
 *
 * A link built from an unvalidated string is a phishing primitive: `javascript:`
 * in an `href` is inert in most mail clients but not all, and a `data:` URL is
 * worse. Since the only URLs this module renders are ones the app itself built,
 * refusing anything else costs nothing and closes the question.
 */
function safeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

interface ShellInput {
  title: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  fallbackLinkLabel?: string;
  footnote?: string;
}

/**
 * One HTML shell for every template.
 *
 * Inline styles and a single column: mail clients strip `<style>` blocks and cut
 * wide tables, so the layout has to survive being flattened. The CTA is rendered
 * twice — a button for clients that render CSS, and the raw URL underneath for
 * the ones that do not and for readers who do not trust buttons in email.
 */
function renderShell(input: ShellInput): { html: string; text: string } {
  const ctaUrl = input.cta ? safeHttpUrl(input.cta.url) : null;

  const html = [
    `<div style="margin:0;padding:24px 12px;background:#f5f6f8;font-family:${FONT_STACK};color:#1f2430;">`,
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">`,
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(input.title)}</h1>`,
    ...input.paragraphs.map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(paragraph)}</p>`,
    ),
    input.cta && ctaUrl
      ? `<p style="margin:24px 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#3d5afe;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px;">${escapeHtml(input.cta.label)}</a></p>`
      : '',
    input.cta && ctaUrl && input.fallbackLinkLabel
      ? `<p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#5b6273;word-break:break-all;">${escapeHtml(input.fallbackLinkLabel)}<br /><a href="${escapeHtml(ctaUrl)}" style="color:#3d5afe;">${escapeHtml(ctaUrl)}</a></p>`
      : '',
    input.footnote
      ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#5b6273;">${escapeHtml(input.footnote)}</p>`
      : '',
    `<p style="margin:16px 0 0;font-size:12px;color:#8b93a7;">VulDetected</p>`,
    `</div></div>`,
  ].join('');

  const text = [
    input.title,
    '',
    ...input.paragraphs,
    '',
    ...(ctaUrl ? [ctaUrl, ''] : []),
    ...(input.footnote ? [input.footnote, ''] : []),
    '— VulDetected',
  ].join('\n');

  return { html, text };
}

interface Copy {
  verifyEmailSubject: string;
  verifyEmailTitle: string;
  verifyEmailBody: (hours: number) => string;
  verifyEmailCta: string;
  verifyEmailFootnote: string;

  resetSubject: string;
  resetTitle: string;
  resetBody: (minutes: number) => string;
  resetCta: string;
  resetFootnote: string;

  scanSubject: (hostname: string) => string;
  scanTitle: string;
  scanBody: (hostname: string) => string;
  scanSummaryLabel: string;
  scanNoFindings: string;
  scanCta: string;
  severityLabels: Record<keyof Omit<SeverityCounts, 'total'>, string>;

  criticalSubject: (hostname: string) => string;
  criticalTitle: string;
  criticalBody: (hostname: string, count: number) => string;
  criticalCta: string;

  fallbackLink: string;
}

const COPY: Record<MailLocale, Copy> = {
  es: {
    verifyEmailSubject: 'Confirma tu correo en VulDetected',
    verifyEmailTitle: 'Confirma tu correo',
    verifyEmailBody: (hours) =>
      `Abre el enlace para confirmar tu dirección y activar todas las funciones de tu cuenta. Caduca en ${hours} horas.`,
    verifyEmailCta: 'Confirmar correo',
    verifyEmailFootnote: 'Si no creaste esta cuenta, ignora este mensaje.',

    resetSubject: 'Restablece tu contraseña de VulDetected',
    resetTitle: 'Restablece tu contraseña',
    resetBody: (minutes) =>
      `Usa el enlace para elegir una contraseña nueva. Caduca en ${minutes} minutos y solo se puede usar una vez.`,
    resetCta: 'Elegir contraseña nueva',
    resetFootnote:
      'Si no pediste el cambio, no hagas nada: tu contraseña actual sigue siendo válida.',

    scanSubject: (hostname) => `Escaneo completado: ${hostname}`,
    scanTitle: 'Escaneo completado',
    scanBody: (hostname) =>
      `Terminamos de analizar ${hostname}. Este es el resumen de hallazgos abiertos.`,
    scanSummaryLabel: 'Hallazgos abiertos',
    scanNoFindings: 'No se encontraron hallazgos abiertos en este escaneo.',
    scanCta: 'Ver el informe',
    severityLabels: {
      critical: 'Críticos',
      high: 'Altos',
      medium: 'Medios',
      low: 'Bajos',
      other: 'Sin clasificar',
    },

    criticalSubject: (hostname) => `Hallazgo crítico en ${hostname}`,
    criticalTitle: 'Hallazgo crítico detectado',
    criticalBody: (hostname, count) =>
      count === 1
        ? `El último escaneo de ${hostname} encontró un hallazgo crítico que conviene atender cuanto antes.`
        : `El último escaneo de ${hostname} encontró ${count} hallazgos críticos que conviene atender cuanto antes.`,
    criticalCta: 'Revisar los hallazgos',

    fallbackLink: 'Si el botón no funciona, copia este enlace en tu navegador:',
  },
  en: {
    verifyEmailSubject: 'Confirm your email on VulDetected',
    verifyEmailTitle: 'Confirm your email',
    verifyEmailBody: (hours) =>
      `Open the link to confirm your address and unlock every feature of your account. It expires in ${hours} hours.`,
    verifyEmailCta: 'Confirm email',
    verifyEmailFootnote: 'If you did not create this account, ignore this message.',

    resetSubject: 'Reset your VulDetected password',
    resetTitle: 'Reset your password',
    resetBody: (minutes) =>
      `Use the link to choose a new password. It expires in ${minutes} minutes and can be used once.`,
    resetCta: 'Choose a new password',
    resetFootnote: 'If you did not request this change, do nothing: your current password still works.',

    scanSubject: (hostname) => `Scan completed: ${hostname}`,
    scanTitle: 'Scan completed',
    scanBody: (hostname) =>
      `We finished analysing ${hostname}. This is the summary of open findings.`,
    scanSummaryLabel: 'Open findings',
    scanNoFindings: 'This scan found no open findings.',
    scanCta: 'Open the report',
    severityLabels: {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      other: 'Unclassified',
    },

    criticalSubject: (hostname) => `Critical finding on ${hostname}`,
    criticalTitle: 'Critical finding detected',
    criticalBody: (hostname, count) =>
      count === 1
        ? `The latest scan of ${hostname} found a critical finding that should be addressed soon.`
        : `The latest scan of ${hostname} found ${count} critical findings that should be addressed soon.`,
    criticalCta: 'Review the findings',

    fallbackLink: 'If the button does not work, paste this link into your browser:',
  },
};

function severityLines(counts: SeverityCounts, copy: Copy): string[] {
  const order: Array<keyof Omit<SeverityCounts, 'total'>> = [
    'critical',
    'high',
    'medium',
    'low',
    'other',
  ];
  return order
    .filter((key) => counts[key] > 0)
    .map((key) => `${copy.severityLabels[key]}: ${counts[key]}`);
}

/**
 * Renders one message for one locale.
 *
 * Exhaustive by construction: adding a template to `MailTemplateData` fails the
 * `switch` (the `never` branch) until a renderer exists, which is cheaper than
 * discovering at runtime that a new notification renders an empty body.
 */
export function renderMail<T extends MailTemplate>(
  template: T,
  locale: MailLocale,
  data: MailTemplateData[T],
): RenderedMail {
  const copy = COPY[locale];

  switch (template) {
    case 'verify_email': {
      const payload = data as MailTemplateData['verify_email'];
      const shell = renderShell({
        title: copy.verifyEmailTitle,
        paragraphs: [copy.verifyEmailBody(payload.expiresInHours)],
        cta: { label: copy.verifyEmailCta, url: payload.url },
        fallbackLinkLabel: copy.fallbackLink,
        footnote: copy.verifyEmailFootnote,
      });
      return { subject: copy.verifyEmailSubject, ...shell };
    }

    case 'reset_password': {
      const payload = data as MailTemplateData['reset_password'];
      const shell = renderShell({
        title: copy.resetTitle,
        paragraphs: [copy.resetBody(payload.expiresInMinutes)],
        cta: { label: copy.resetCta, url: payload.url },
        fallbackLinkLabel: copy.fallbackLink,
        footnote: copy.resetFootnote,
      });
      return { subject: copy.resetSubject, ...shell };
    }

    case 'scan_completed': {
      const payload = data as MailTemplateData['scan_completed'];
      const lines = severityLines(payload.counts, copy);
      const shell = renderShell({
        title: copy.scanTitle,
        paragraphs: [
          copy.scanBody(payload.hostname),
          lines.length > 0 ? `${copy.scanSummaryLabel}: ${lines.join(' · ')}` : copy.scanNoFindings,
        ],
        cta: { label: copy.scanCta, url: payload.scanUrl },
        fallbackLinkLabel: copy.fallbackLink,
      });
      return { subject: copy.scanSubject(payload.hostname), ...shell };
    }

    case 'new_critical_finding': {
      const payload = data as MailTemplateData['new_critical_finding'];
      const list = payload.findings
        .slice(0, 10)
        .map((finding) => `• ${finding.title} — ${finding.affectedUrl}`)
        .join('\n');
      const shell = renderShell({
        title: copy.criticalTitle,
        paragraphs: [copy.criticalBody(payload.hostname, payload.findings.length), list],
        cta: { label: copy.criticalCta, url: payload.scanUrl },
        fallbackLinkLabel: copy.fallbackLink,
      });
      return { subject: copy.criticalSubject(payload.hostname), ...shell };
    }

    default: {
      const exhaustive: never = template;
      throw new Error(`No renderer for mail template "${String(exhaustive)}".`);
    }
  }
}

/** Locale from a user profile, defaulting to Spanish (the product's primary). */
export function mailLocaleOf(value: string | null | undefined): MailLocale {
  return value === 'en' ? 'en' : 'es';
}
