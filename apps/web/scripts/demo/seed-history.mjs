/**
 * `pnpm demo:seed-history` — six months of comparable scan history.
 *
 * ## Why the rows are real rows
 *
 * The comparative history screen (HU-10, CA-10/CA-29) has to be demonstrated
 * against the real query, the real schema and the real chart. Generating the
 * chart's data points in the browser would prove the chart component renders
 * arrays, which nobody doubts. Writing real `scans` and `findings` rows proves
 * the aggregation, the comparability rules and the demo labelling together.
 *
 * ## Why every row carries `is_demo = true`
 *
 * Invented history must never be indistinguishable from measured history. The
 * flag is on the row, so the UI badge, the export and any future query read the
 * same source of truth. `PRUEBA_SPRINT_2.md` states this explicitly.
 *
 * ## What this seeded history is NOT allowed to prove
 *
 * It is chart data. It is never the baseline for a "new vulnerability" claim
 * (CA-12) and never evidence that a scan found something. Those require two real
 * scans of the real fixture, one before and one after a change. The finding keys
 * here follow the canonical rule in `lib/findings/newness.ts`, but a real scan's
 * keys depend on the URLs and parameters it actually visits, so the two sets are
 * not expected to overlap. Keeping that boundary explicit is the difference
 * between a demo and a fiction.
 *
 * ## Why the trend improves
 *
 * The point of a comparative history is that it shows a direction. These scans
 * model a team that fixes things: the critical and high findings are resolved
 * progressively, the low ones linger. A flat line would demo the chart and prove
 * nothing about the product.
 */
import { createHash } from 'node:crypto';

import { openDb, requireDemoMode } from './_shared.mjs';

const SCRIPT = 'demo:seed-history';

requireDemoMode(SCRIPT);

const DEMO_EMAIL = 'demo.pro@vuldetected.local';
const HOSTNAME = '127-0-0-1.nip.io';
const TARGET_URL = `http://${HOSTNAME}:8099`;
const SCAN_COUNT = 13; // biweekly across six months
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The finding catalog the seeded history is drawn from.
 *
 * `resolvedFrom` is the scan index (0 = oldest) from which the finding stops
 * appearing. That is how a real remediation programme looks: work lands, the
 * finding disappears from the next scan, and if it comes back it comes back as a
 * new occurrence.
 *
 * `discriminator` separates findings that share a check and a URL. Six missing
 * headers on one page are six findings, not one, and the canonical key rule only
 * keeps them apart because of this field.
 */
const CATALOG = [
  {
    checkName: 'sqli',
    title: 'Inyección SQL en parámetro de búsqueda',
    description: 'La aplicación refleja un error de base de datos ante una comilla simple.',
    severity: 'critical',
    owasp: 'A03',
    path: '/?q=',
    discriminator: 'q',
    resolvedFrom: 5,
  },
  {
    checkName: 'sensitive_files',
    title: 'Archivo de configuración expuesto',
    description: 'Un archivo con credenciales responde con estado 200.',
    severity: 'critical',
    owasp: 'A02',
    path: '/.env',
    discriminator: '/.env',
    resolvedFrom: 3,
  },
  {
    checkName: 'security_headers',
    title: 'Cabecera Strict-Transport-Security ausente',
    description: 'La respuesta no declara HSTS, así que el navegador puede degradar a HTTP.',
    severity: 'high',
    owasp: 'A05',
    path: '/',
    discriminator: 'strict-transport-security',
    resolvedFrom: 7,
  },
  {
    checkName: 'cookies',
    title: 'Cookie de sesión sin atributo Secure',
    description: 'La cookie de sesión viaja también por HTTP sin cifrar.',
    severity: 'high',
    owasp: 'A07',
    path: '/',
    discriminator: 'session|secure',
    resolvedFrom: 9,
  },
  {
    checkName: 'xss',
    title: 'Cross-site scripting reflejado',
    description: 'El parámetro se refleja sin escapar en el HTML de respuesta.',
    severity: 'high',
    owasp: 'A03',
    path: '/?q=',
    discriminator: 'q',
    resolvedFrom: 10,
  },
  {
    checkName: 'security_headers',
    title: 'Cabecera Content-Security-Policy ausente',
    description: 'Sin CSP el navegador no restringe el origen de los scripts.',
    severity: 'medium',
    owasp: 'A05',
    path: '/',
    discriminator: 'content-security-policy',
    resolvedFrom: 99,
  },
  {
    checkName: 'cors',
    title: 'CORS refleja cualquier origen',
    description: 'El servidor responde con el origen solicitante en Access-Control-Allow-Origin.',
    severity: 'medium',
    owasp: 'A05',
    path: '/',
    discriminator: null,
    resolvedFrom: 99,
  },
  {
    checkName: 'directory_listing',
    title: 'Listado de directorios habilitado',
    description: 'El servidor devuelve un índice navegable para un directorio sin index.html.',
    severity: 'low',
    owasp: 'A05',
    path: '/uploads/',
    discriminator: '/uploads/',
    resolvedFrom: 99,
  },
];

/**
 * Canonical finding identity: `sha256(domain | check | normalizedUrl[| disc])`.
 *
 * Mirrors `computeFindingKey` in `apps/web/src/lib/findings/newness.ts`. It is
 * duplicated here because the script runs on plain Node and cannot import a
 * TypeScript module; the unit suite owns the real implementation and this copy
 * exists only to produce plausible, unique, stable keys for chart data.
 */
function normalizeFindingUrl(rawUrl) {
  const trimmed = rawUrl.trim();
  if (trimmed === '') return '';

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  url.hash = '';
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = '';
  }

  const params = [...url.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [name, value] of params) {
    url.searchParams.append(name, value);
  }

  return url.toString();
}

function findingKey(domainId, entry, affectedUrl) {
  const parts = [domainId, entry.checkName, normalizeFindingUrl(affectedUrl)];
  if (entry.discriminator) parts.push(entry.discriminator);
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

const sql = openDb();

try {
  const users = await sql`
    select id from users where email = ${DEMO_EMAIL} limit 1
  `;
  if (users.length === 0) {
    console.error(
      `[${SCRIPT}] ${DEMO_EMAIL} does not exist. Run \`pnpm seed:demo\` (or \`pnpm demo:reset\`) first.`,
    );
    process.exit(1);
  }
  const userId = users[0].id;

  // `domains_normalized_hostname_key` is GLOBAL, not per user (design D2), so
  // the conflict target is the hostname alone. Targeting (user_id, hostname)
  // would raise "no unique constraint matching" at runtime.
  const domainRows = await sql`
    insert into domains (user_id, hostname, normalized_hostname, verified, verified_at)
    values (${userId}, ${HOSTNAME}, ${HOSTNAME}, true, now())
    on conflict (normalized_hostname) do update
      set verified = true, verified_at = coalesce(domains.verified_at, now())
    returning id
  `;
  const domainId = domainRows[0].id;

  const removed = await sql`
    delete from scans where domain_id = ${domainId} and is_demo = true
  `;
  if (removed.count > 0) {
    console.log(`  removed ${removed.count} previously seeded demo scans`);
  }

  const now = Date.now();
  let insertedScans = 0;
  let insertedFindings = 0;

  await sql.begin(async (tx) => {
    for (let index = 0; index < SCAN_COUNT; index += 1) {
      const ageDays = (SCAN_COUNT - 1 - index) * 14;
      const createdAt = new Date(now - ageDays * DAY_MS);
      const startedAt = new Date(createdAt.getTime() + 2_000);
      const finishedAt = new Date(createdAt.getTime() + 42_000);

      const scanRows = await tx`
        insert into scans (
          domain_id, target_url, source, status, checks, started_at, finished_at,
          created_at, updated_at, is_demo, scan_mode, severity_catalog_version
        ) values (
          ${domainId}, ${TARGET_URL}, 'schedule', 'completed',
          ${tx.json([
            'security_headers',
            'tls',
            'cookies',
            'redirects',
            'xss',
            'sqli',
            'open_redirect',
            'cors',
            'directory_listing',
            'sensitive_files',
          ])},
          ${startedAt}, ${finishedAt}, ${createdAt}, ${finishedAt},
          true, 'active', '1.0'
        )
        returning id
      `;
      const scanId = scanRows[0].id;
      insertedScans += 1;

      for (const entry of CATALOG) {
        if (index >= entry.resolvedFrom) continue;
        const affectedUrl = `${TARGET_URL}${entry.path}`;
        await tx`
          insert into findings (
            scan_id, finding_key, severity, status, check_name, owasp_category,
            is_new, title, description, affected_url, evidence, created_at, updated_at
          ) values (
            ${scanId},
            ${findingKey(domainId, entry, affectedUrl)},
            ${entry.severity}, 'open', ${entry.checkName}, ${entry.owasp},
            ${index === 0},
            ${entry.title}, ${entry.description}, ${affectedUrl},
            ${tx.json({ seeded: true, discriminator: entry.discriminator })},
            ${createdAt}, ${createdAt}
          )
        `;
        insertedFindings += 1;
      }
    }
  });

  console.log(`  domain              ${HOSTNAME} (${domainId})`);
  console.log(`  scans               ${insertedScans} (biweekly, last 6 months, is_demo=true)`);
  console.log(`  findings            ${insertedFindings}`);
  console.log(`\n[${SCRIPT}] Seeded history ready. Every row is marked is_demo=true.`);
} finally {
  await sql.end();
}
