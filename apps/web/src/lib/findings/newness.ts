import { createHash } from 'node:crypto';

/**
 * Stable finding identity and "is this new?" (DM-6, SEV-3).
 *
 * ## THE KEY
 *
 * `sha256(domainId | checkName | normalizedAffectedUrl[| discriminator])`.
 *
 * It deliberately contains no `scan_id`: the same problem on the same page of
 * the same domain is the SAME finding across re-scans, and that is what makes
 * trend, "new since last scan" and deduplication possible. A key with the scan
 * in it would turn every re-scan into a fresh set of findings.
 *
 * The optional discriminator separates findings that share check and URL but not
 * cause — six missing headers on one page are six findings, not one. The worker
 * already appends one (the header name, the cookie) and sends the finished key;
 * this function exists for the fallback path and to state the rule once in the
 * shared language of the application.
 *
 * ## THE NORMALIZATION
 *
 * Without it, `https://Example.com`, `https://example.com/` and
 * `https://example.com:443/?b=2&a=1` would all be different findings. The
 * normalization is intentionally conservative: it never drops path or query
 * (those change what is scanned), only the parts that cannot affect the result —
 * host case, default port, fragment and query order.
 */
export interface FindingIdentityInput {
  domainId: string;
  checkName: string;
  affectedUrl: string;
  discriminator?: string;
}

export function normalizeFindingUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed === '') return '';

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Not an absolute URL. Return it trimmed rather than inventing a base: a
    // wrong base would merge findings from different hosts.
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

  // `URL` renders https://example.com as "https://example.com/". Keeping that
  // trailing slash is fine as long as it is consistent; removing it here would
  // make "/" and "" collide with a path-less target, which is not a real
  // distinction. Consistency is the only requirement.
  return url.toString();
}

export function computeFindingKey(input: FindingIdentityInput): string {
  const parts = [
    input.domainId,
    input.checkName,
    normalizeFindingUrl(input.affectedUrl),
  ];
  if (input.discriminator) parts.push(input.discriminator);
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

/**
 * Returns the keys present now that were NOT present in the previous scan.
 *
 * A missing previous scan means every finding is new: that is the honest answer
 * for a first scan, and the UI shows the same "new" emphasis it would after a
 * real regression.
 */
export function computeNewFindingKeys(
  currentKeys: readonly string[],
  previousKeys: ReadonlySet<string>,
): Set<string> {
  const fresh = new Set<string>();
  for (const key of currentKeys) {
    if (!previousKeys.has(key)) fresh.add(key);
  }
  return fresh;
}
