import { z } from 'zod';

/**
 * Normalises a hostname to the single canonical form every lookup, uniqueness
 * check and challenge identifier is built on (`domains.normalized_hostname`).
 * Returns `null` when the value can never be a verifiable domain.
 *
 * ## Why the WHATWG `URL` round-trip, and not `node:url` or a hand-rolled parser
 *
 * `new URL('http://' + value)` runs the same IDNA/punycode conversion and case
 * folding in every environment this module runs in — Node on the server, and
 * any browser if a client form reuses this schema — so the normalised form can
 * never disagree between the two. `domainToASCII` from `node:url` would pin the
 * rule to the server, and a hand-maintained IDNA table is a bug farm.
 *
 * ## What the URL round-trip silently "fixes" — and why that is rejected here
 *
 * WHATWG URL canonicalises IPv4-ish hosts (`2130706433`, `127.1` and `0x7f.1`
 * all become `127.0.0.1`) and strips ports, paths, credentials and fragments.
 * A hostname field must contain a hostname and nothing else: accepting
 * `example.com/path` by quietly keeping `example.com` would hide the input's
 * real meaning from the user, and accepting a canonicalised IP would admit a
 * target that the DNS-TXT ownership proof can never cover. So the round-trip is
 * trusted for what it proves (IDNA + syntax) and the forms it would "repair"
 * are refused outright:
 *
 * - the input may not contain `/?#@:\` or whitespace, which blocks every URL
 *   smuggling shape (`evil.com@good.example`, `good.example/path`, …);
 * - the result may not be a dotted quad — that catches every IPv4 spelling URL
 *   would canonicalise, decimal and hex included — nor an IPv6 literal;
 * - each label is 1–63 chars, alphanumeric at the edges, hyphens only inside;
 *   the whole name is at most 253 chars (RFC 1035).
 *
 * One trailing dot is the DNS root zone and is stripped; anything beyond that
 * is garbage. A single-label name such as `localhost` is syntactically valid
 * and passes here — whether a target is publicly reachable is the SSRF gate's
 * (D6) decision at request time, not this schema's.
 */
export function normalizeHostname(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }

  // Characters that only ever mean something inside a URL, never in a bare host.
  if (/[/\\?#@:\s]/.test(trimmed)) {
    return null;
  }

  const withoutRootDot = trimmed.replace(/\.$/, '');

  let ascii: string;
  try {
    ascii = new URL(`http://${withoutRootDot}`).hostname;
  } catch {
    return null;
  }

  // `2130706433`, `127.1`, `0x7f.1` all arrive here as `127.0.0.1`. No bare
  // dotted quad is ever a domain this ownership flow could verify.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ascii)) {
    return null;
  }
  // IPv6 literals survive the round-trip with their brackets (`[::1]`).
  if (ascii.startsWith('[') || ascii.includes(':')) {
    return null;
  }

  if (ascii.length > 253) {
    return null;
  }

  for (const label of ascii.split('.')) {
    if (label.length < 1 || label.length > 63) {
      return null;
    }
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
      return null;
    }
  }

  return ascii;
}

/**
 * Validates a hostname while keeping the user's own (trimmed) input: the
 * `domains` row stores the form the user typed in `hostname` for display and
 * derives `normalized_hostname` separately with {@link normalizeHostname}.
 */
export const hostnameSchema = z
  .string()
  .trim()
  .refine((value) => normalizeHostname(value) !== null, {
    message: 'Enter a valid hostname, for example example.com.',
  });

/**
 * Input of `verifyOwnershipAction`. A server action is a public endpoint:
 * every argument is untrusted and re-validated here no matter what the
 * caller's TypeScript claims.
 */
export const ownershipVerifySchema = z.object({
  hostname: hostnameSchema,
  method: z.enum(['dns_txt', 'well_known']),
});

/**
 * Validates a scan target URL for submission (SS-1).
 */
export const targetUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return false;
        }
        if (url.username || url.password) {
          return false;
        }
        if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
          // allow paths? design says normalized URL; but be flexible
        }
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Enter a valid http(s) URL.' },
  )
  .transform((value) => {
    const url = new URL(value);
    const scheme = url.protocol.replace(':', '') as 'http' | 'https';
    const hostname = url.hostname;
    const normalizedHostname = normalizeHostname(hostname);
    if (normalizedHostname === null) {
      throw new Error('Invalid hostname');
    }
    const port = url.port ? parseInt(url.port, 10) : scheme === 'https' ? 443 : 80;
    const baseUrl = `${scheme}://${normalizedHostname}${port === (scheme === 'https' ? 443 : 80) ? '' : `:${port}`}`;
    return {
      normalizedHostname,
      hostname: normalizedHostname,
      url: `${scheme}://${normalizedHostname}${port === (scheme === 'https' ? 443 : 80) ? '' : `:${port}`}`,
      baseUrl,
      port,
      scheme,
    };
  });
