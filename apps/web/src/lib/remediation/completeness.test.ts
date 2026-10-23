import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { CRITICAL_HIGH_RULES, remediationRegistry } from './registry';

/**
 * Sprint 3 exit criteria enforced by fail-fast assertions:
 *
 *   - every Critical/High rule has remediation content for all three audiences
 *   - every code sample parses (no pasted-from-memory garbage)
 *
 * These run in the normal `pnpm test` gate, so a missing entry or a broken
 * snippet fails the build instead of shipping.
 */

function syntacticErrors(language: string, code: string): string[] {
  if (language === 'typescript' || language === 'javascript') {
    const result = ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve },
      reportDiagnostics: true,
    });
    return (result.diagnostics ?? []).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    );
  }

  if (language === 'nginx') {
    // No nginx parser is available, so check the structural invariants every
    // directive needs: balanced braces and an even number of double quotes.
    const errors: string[] = [];
    const braces = [...code].reduce(
      (depth, char) => (char === '{' ? depth + 1 : char === '}' ? depth - 1 : depth),
      0,
    );
    if (braces !== 0) errors.push(`unbalanced braces (${braces})`);
    const quotes = (code.match(/"/g) ?? []).length;
    if (quotes % 2 !== 0) errors.push(`unbalanced double quotes (${quotes})`);
    if (code.trim().length === 0) errors.push('empty snippet');
    return errors;
  }

  return [`unknown language: ${language}`];
}

describe('remediation registry', () => {
  it('has a unique rule key per entry', () => {
    const keys = remediationRegistry.map((entry) => entry.ruleKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every Critical/High rule content for all three audiences', () => {
    for (const ruleKey of CRITICAL_HIGH_RULES) {
      const entry = remediationRegistry.find((candidate) => candidate.ruleKey === ruleKey);
      expect(entry, `missing remediation for ${ruleKey}`).toBeDefined();
      if (!entry) continue;

      expect(entry.severity === 'critical' || entry.severity === 'high').toBe(true);
      for (const guide of [entry.developerGuide, entry.sysadminGuide, entry.businessGuide]) {
        expect(guide.title.length).toBeGreaterThan(0);
        expect(guide.steps.length).toBeGreaterThan(0);
      }
      expect(entry.codeFixes.length).toBeGreaterThan(0);
      expect(entry.version.length).toBeGreaterThan(0);
    }
  });

  it('emits code samples that parse', () => {
    for (const entry of remediationRegistry) {
      for (const fix of entry.codeFixes) {
        const errors = syntacticErrors(fix.language, fix.code);
        expect(errors, `${entry.ruleKey} / ${fix.label}: ${errors.join('; ')}`).toEqual([]);
      }
    }
  });
});
