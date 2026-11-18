import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import en from '../../../messages/en.json';
import es from '../../../messages/es.json';

/**
 * Guards the two i18n mistakes that compile fine and ship broken UI:
 *
 *   1. a `t('some.key')` whose key does not exist — next-intl renders the key
 *      path (or throws in production) instead of the sentence;
 *   2. a key added to one locale and forgotten in the other, which silently
 *      falls back and leaves half the UI in the wrong language.
 *
 * Keys built with a template literal are skipped: those are the ones the code
 * already guards with `t.has` (severity/status vocabularies).
 */

type Tree = Record<string, unknown>;

function flatten(tree: Tree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flatten(value as Tree, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

function get(tree: Tree, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') {
      return (node as Tree)[part];
    }
    return undefined;
  }, tree);
}

function has(tree: Tree, path: string): boolean {
  return get(tree, path) !== undefined;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('i18n messages', () => {
  it('has the same keys in every locale', () => {
    const english = flatten(en as Tree).sort();
    const spanish = flatten(es as Tree).sort();
    expect(spanish).toEqual(english);
  });

  it('resolves every statically referenced key', () => {
    // Resolved from this file, not `process.cwd()`: the suite runs both from
    // `apps/web` (package script) and from the repository root (Turborepo),
    // and a cwd-relative path only works for the first.
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const missing: string[] = [];
    let checked = 0;

    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, 'utf8');
      const namespaces = [...source.matchAll(/getTranslations\(\s*'([^']+)'/g)].map((m) => m[1]);
      if (namespaces.length === 0) {
        continue;
      }

      for (const match of source.matchAll(/(?<![\w.])t\(\s*'([^']+)'/g)) {
        const key = match[1];
        checked += 1;
        const resolved = namespaces.some((namespace) => has(en as Tree, `${namespace}.${key}`));
        if (!resolved) {
          missing.push(`${file}: ${namespaces.join('|')}.${key}`);
        }
      }
    }

    // A floor, so a refactor that stops scanning silently cannot turn this test
    // into a no-op that always passes.
    expect(checked).toBeGreaterThan(50);
    expect(missing).toEqual([]);
  });

  it('never formats a placeholder message with t(), only with t.raw()', () => {
    /**
     * `t('subtitle')` on `"Resultado del escaneo de {host}"` does not return the
     * template: ICU formatting fails for the missing value and next-intl hands
     * back its fallback, the joined key. The caller then prints
     * `reports.pdf.subtitle` on the page, with no exception and a 200 response.
     *
     * That is how the executive PDF shipped with its subtitle, page footer and
     * severity counts replaced by key names: the unit test fed the renderer the
     * template directly, so it never went through the translator.
     *
     * A single-argument call is the whole trigger — a call that passes values is
     * fine. Anything that carries `{...}` must be read with `t.raw()`.
     */
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const offenders: string[] = [];
    let checked = 0;

    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, 'utf8');
      const namespaces = [
        ...[...source.matchAll(/getTranslations\(\s*'([^']+)'/g)].map((m) => m[1]),
        ...[...source.matchAll(/useTranslations\(\s*'([^']+)'/g)].map((m) => m[1]),
      ];
      if (namespaces.length === 0) {
        continue;
      }

      // `t(...)`, `tScan(...)`, `tPdf(...)`, `credentialsT(...)` — but not
      // `trim(...)` and not `t.has(...)`. The call must be closed immediately,
      // which is what distinguishes it from a call that supplies values.
      for (const match of source.matchAll(
        /(?<![\w.])(t(?:[A-Z][A-Za-z]*)?|credentialsT)\(\s*'([^']+)'\s*\)/g,
      )) {
        const key = match[2];
        const message = namespaces
          .map((namespace) => get(en as Tree, `${namespace}.${key}`))
          .find((value) => typeof value === 'string');

        if (typeof message !== 'string') {
          continue; // The missing-key test above already reports this one.
        }

        checked += 1;
        if (message.includes('{')) {
          offenders.push(`${file}: ${match[1]}('${key}') -> ${JSON.stringify(message)}`);
        }
      }
    }

    expect(checked).toBeGreaterThan(5);
    expect(offenders).toEqual([]);
  });
});
