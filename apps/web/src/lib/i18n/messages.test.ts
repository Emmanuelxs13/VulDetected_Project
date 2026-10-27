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

function has(tree: Tree, path: string): boolean {
  return (
    path.split('.').reduce<unknown>((node, part) => {
      if (node && typeof node === 'object') {
        return (node as Tree)[part];
      }
      return undefined;
    }, tree) !== undefined
  );
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
});
