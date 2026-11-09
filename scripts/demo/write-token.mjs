/**
 * Writes the current ownership token into the fixture site's `token.txt`.
 *
 * Usage (from the repo root):
 *
 *   node scripts/demo/write-token.mjs <token>
 *   # or pipe the token from the database:
 *   node scripts/demo/write-token.mjs "$(psql ... -tAc 'select value ...')"
 *
 * The fixture re-reads the file on every request, so no restart is needed: the
 * next `GET /.well-known/vuldetected.txt` serves the new value.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const token = (process.argv[2] ?? '').trim();

if (token === '') {
  console.error('usage: node scripts/demo/write-token.mjs <token>');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', '..', 'e2e', 'fixtures', 'vulnerable-site', 'token.txt');
writeFileSync(target, token + '\n', 'utf8');
console.log(`[demo] wrote token (${token.length} chars) to ${target}`);
