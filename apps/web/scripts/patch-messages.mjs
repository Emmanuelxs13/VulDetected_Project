// One-off message maintenance for Sprint 3. Run with: node scripts/patch-messages.mjs
// Kept in the repo so the edit is reviewable; it is idempotent.
import { readFileSync, writeFileSync } from 'node:fs';

const files = {
  en: 'messages/en.json',
  es: 'messages/es.json',
};

const patches = {
  en: {
    scan: {
      detail: {
        findings: {
          description:
            'Every finding carries a severity computed by a documented rule. Open a finding to see the evidence and how to fix it.',
        },
      },
      findings: {
        filter: { all: 'All' },
        pagination: {
          label: 'Findings pagination',
          next: 'Next page',
          first: 'First page',
        },
        detail: {
          evidence: 'Evidence',
          evidenceDescription: 'What the check observed, exactly as the worker recorded it.',
        },
        rationale: {
          cookieOther: 'Cookie attribute issue outside the specific rules',
        },
      },
    },
    dashboard: {
      filterAll: 'All',
      filterDescription: 'Filter by severity. Counts cover every finding you own.',
      scansDescription: 'The 20 most recent scans of the domains you verified.',
      trend: {
        title: 'Posture trend',
        description:
          'High and critical findings in the newest completed scan of each domain, compared with the scan before it.',
        empty: 'No completed scans yet, so there is no trend to show.',
        riskyFindings: 'high/critical',
        improved: 'Improved',
        worsened: 'Worsened',
        unchanged: 'Unchanged',
        firstScan: 'First scan',
        table: { domain: 'Domain', latest: 'Latest scan', delta: 'Change' },
      },
    },
  },
  es: {
    scan: {
      detail: {
        findings: {
          description:
            'Cada hallazgo tiene una severidad calculada con una regla documentada. Abra un hallazgo para ver la evidencia y cómo corregirlo.',
        },
      },
      findings: {
        filter: { all: 'Todos' },
        pagination: {
          label: 'Paginación de hallazgos',
          next: 'Página siguiente',
          first: 'Primera página',
        },
        detail: {
          evidence: 'Evidencia',
          evidenceDescription: 'Lo que observó la comprobación, tal como lo registró el worker.',
        },
        rationale: {
          cookieOther: 'Problema de atributo de cookie fuera de las reglas específicas',
        },
      },
    },
    dashboard: {
      filterAll: 'Todos',
      filterDescription: 'Filtre por severidad. Los conteos incluyen todos sus hallazgos.',
      scansDescription: 'Los 20 escaneos más recientes de los dominios que verificó.',
      trend: {
        title: 'Tendencia de postura',
        description:
          'Hallazgos altos y críticos del último escaneo completado de cada dominio, frente al anterior.',
        empty: 'Todavía no hay escaneos completados, así que no hay tendencia que mostrar.',
        riskyFindings: 'altos/críticos',
        improved: 'Mejoró',
        worsened: 'Empeoró',
        unchanged: 'Sin cambios',
        firstScan: 'Primer escaneo',
        table: { domain: 'Dominio', latest: 'Último escaneo', delta: 'Cambio' },
      },
    },
  },
};

/**
 * Keys that are currently plain strings but become objects in this patch.
 * `dashboard.trend` was a placeholder added before the trend existed; nothing
 * read it, so it is replaced rather than kept alongside the real section.
 */
const promotedKeys = new Set(['trend']);

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (typeof target[key] === 'string') {
        if (!promotedKeys.has(key)) {
          throw new Error(`key ${key} is already a string; pick another name`);
        }
        delete target[key];
      }
      target[key] ??= {};
      merge(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

for (const [locale, path] of Object.entries(files)) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  merge(json, patches[locale]);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`${path} patched`);
}
