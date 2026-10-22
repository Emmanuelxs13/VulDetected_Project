/**
 * Server-side egress guard (design D6, `docs/security.md` §2).
 *
 * Every outbound URL the worker or a server action fetches goes through
 * {@link safeFetch}: it resolves the hostname ONCE, validates the ENTIRE
 * answer set (A + AAAA), pins the first public address, and connects to that
 * address directly — Host header and TLS SNI still carry the original
 * hostname. Redirects are never followed by the HTTP client: each hop is
 * re-resolved and re-validated with the same rules, so a DNS answer that
 * flips to an internal address between hops (the classic rebinding pattern)
 * is refused before a socket is opened.
 *
 * The resolver and the connector are injectable so the whole guard is unit
 * testable without touching the network (spec SS-2 / SW-3).
 */
import { promises as dnsPromises } from 'node:dns';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { request as httpRequest } from 'node:http';
import type { RequestOptions as HttpRequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';

/** The only ports this application ever fetches over. */
export const ALLOWED_PORTS: readonly number[] = [80, 443];

/** Maximum number of redirect responses that will be followed. */
export const MAX_REDIRECT_HOPS = 5;

const CONNECT_TIMEOUT_MS = 5_000;
const READ_TIMEOUT_MS = 15_000;
/** The well-known ownership file is a 64-byte token; anything bigger is an error. */
const MAX_BODY_BYTES = 64 * 1024;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type SsrfReason =
  | 'blocked_address'
  | 'blocked_port'
  | 'dns_failure'
  | 'invalid_url'
  | 'network_error'
  | 'non_canonical_ip'
  | 'response_too_large'
  | 'too_many_redirects'
  | 'timeout'
  | 'unsupported_scheme';

/** Raised for every refusal. `reason` is stable and asserted by tests. */
export class SsrfError extends Error {
  readonly reason: SsrfReason;

  constructor(reason: SsrfReason, message?: string) {
    super(message ?? `SSRF guard refused the target (${reason})`);
    this.name = 'SsrfError';
    this.reason = reason;
  }
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

/** The address a connection is pinned to after full-set validation. */
export interface PinnedTarget {
  address: string;
  family: number;
}

export interface PinnedRequest {
  url: URL;
  port: number;
  address: string;
  family: number;
}

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export type LookupFn = (hostname: string) => Promise<ResolvedAddress[]>;
export type RequestFn = (target: PinnedRequest) => Promise<RawResponse>;

export interface SsrfDeps {
  lookup?: LookupFn;
  request?: RequestFn;
}

/**
 * IPv4 ranges the guard refuses, as [mask, base] pairs (RFC 1918, loopback,
 * link-local/metadata, unspecified, multicast — see docs/security.md §2).
 */
const BLOCKED_IPV4: ReadonlyArray<readonly [number, number]> = [
  [0xff000000, 0x00000000], // 0.0.0.0/8   unspecified
  [0xff000000, 0x0a000000], // 10.0.0.0/8  RFC1918
  [0xff000000, 0x7f000000], // 127.0.0.0/8 loopback
  [0xffff0000, 0xa9fe0000], // 169.254.0.0/16 link-local (cloud metadata)
  [0xfff00000, 0xac100000], // 172.16.0.0/12 RFC1918
  [0xffff0000, 0xc0a80000], // 192.168.0.0/16 RFC1918
  [0xf0000000, 0xe0000000], // 224.0.0.0/4 multicast
];

function parseIpv4(value: string): number | null {
  const octets = value.split('.');
  if (octets.length !== 4) return null;
  let parsed = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return null;
    // Refuse leading zeros outright: several resolvers read them as octal
    // (0177.0.0.1 is 127.0.0.1 to inet_aton), which is the classic bypass.
    if (octet.length > 1 && octet.startsWith('0')) return null;
    const numeric = Number(octet);
    if (numeric > 255) return null;
    parsed = parsed * 256 + numeric;
  }
  return parsed;
}

function isBlockedIpv4(value: string): boolean {
  const parsed = parseIpv4(value);
  if (parsed === null) return true; // unparseable input fails closed
  return BLOCKED_IPV4.some(([mask, base]) => (parsed & mask) >>> 0 === base >>> 0);
}

/** `::ffff:a.b.c.d` / `::ffff:7f00:1` → dotted IPv4, or null when not mapped. */
function mappedIpv4(value: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (dotted?.[1] !== undefined && isIP(dotted[1]) === 4) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
  if (hex?.[1] !== undefined && hex[2] !== undefined) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
  }
  return null;
}

/**
 * Canonical (RFC 5952) rendering of an IPv6 literal, or null when the literal
 * is not valid IPv6 at all. Implemented via the WHATWG URL parser, which is
 * required to serialise IPv6 in canonical lowercase compressed form.
 */
function canonicalIpv6(value: string): string | null {
  try {
    return new URL(`http://[${value}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
}

/**
 * True when the address falls inside a range this application must never
 * dial. Unparseable input is blocked (fail closed), never allowed.
 */
export function isBlockedAddress(address: string): boolean {
  try {
    let value = address.trim().toLowerCase();
    if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);

    const family = isIP(value);
    if (family === 4) return isBlockedIpv4(value);

    if (family === 6) {
      const mapped = mappedIpv4(value);
      if (mapped !== null) return isBlockedIpv4(mapped);
      if (value.includes('%')) return true; // scoped addresses are link-local
      const canonical = canonicalIpv6(value);
      if (canonical === null) return true; // invalid literal fails closed
      if (canonical === '::' || canonical === '::1') return true;
      const head = canonical.split(':')[0] ?? '';
      const group0 = head === '' ? 0 : Number.parseInt(head, 16);
      if (Number.isNaN(group0)) return true;
      if ((group0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
      if ((group0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
      if ((group0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
      return false;
    }

    return true; // not an IP literal at all — fail closed
  } catch {
    return true;
  }
}

/**
 * Normalise a host coming from a URL or a user: strip URL brackets, map
 * IPv4-mapped IPv6 literals to IPv4, and refuse every non-canonical spelling
 * of an IP (decimal `2130706433`, octal `0177.0.0.1`, hex `0x7f000001`,
 * short `127.1`, expanded IPv6). Node's `isIP` accepts none of the IPv4
 * tricks, and the URL parser canonicalises IPv6, so canonicalisation is
 * comparison against those two authorities. Hostnames pass through lowercased.
 */
export function normalizeHost(host: string): string {
  let value = host.trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);

  if (value.includes('%')) throw new SsrfError('non_canonical_ip', `zone id not allowed: ${host}`);

  const family = isIP(value);
  if (family === 4) return value; // isIPv4 already enforces canonical dotted form

  if (family === 6) {
    const mapped = mappedIpv4(value);
    if (mapped !== null) return mapped;
    const canonical = canonicalIpv6(value);
    if (canonical === null || canonical !== value) {
      throw new SsrfError('non_canonical_ip', `non-canonical IPv6 literal: ${host}`);
    }
    return value;
  }

  if (value.includes(':') || /^[0-9.]+$/.test(value) || /^0x[0-9a-f]+$/.test(value)) {
    throw new SsrfError('non_canonical_ip', `literal is not in canonical form: ${host}`);
  }

  return value;
}

const defaultLookup: LookupFn = async (hostname) =>
  dnsPromises.lookup(hostname, { all: true, verbatim: true });

/**
 * Resolve `hostname` exactly once and pin the first answer, after every
 * answer in the set has passed {@link isBlockedAddress}. A single blocked
 * address anywhere in the A/AAAA set is enough to refuse the host: that is
 * what a rebinding answer looks like from here.
 */
export async function resolvePublicTarget(
  hostname: string,
  port: number,
  deps: SsrfDeps = {},
): Promise<PinnedTarget> {
  if (!ALLOWED_PORTS.includes(port)) {
    throw new SsrfError('blocked_port', `port ${port} is not allowlisted`);
  }

  const host = normalizeHost(hostname);

  // A literal needs no resolver: the answer set is the literal itself, so it
  // is validated (and refused) directly, with a precise reason.
  if (isIP(host) !== 0) {
    if (isBlockedAddress(host)) {
      throw new SsrfError('blocked_address', `${host} is not a public address`);
    }
    return { address: host, family: isIP(host) };
  }

  const lookup = deps.lookup ?? defaultLookup;
  let answers: ResolvedAddress[];
  try {
    answers = await lookup(host);
  } catch {
    throw new SsrfError('dns_failure', `DNS resolution failed for ${host}`);
  }

  if (answers.length === 0) {
    throw new SsrfError('dns_failure', `DNS returned no addresses for ${host}`);
  }

  const seen = new Set<string>();
  for (const answer of answers) {
    const address = answer.address.trim();
    if (seen.has(address)) continue;
    seen.add(address);
    if (isBlockedAddress(address)) {
      throw new SsrfError('blocked_address', `${address} is not a public address`);
    }
  }

  const first = answers[0];
  if (first === undefined)
    throw new SsrfError('dns_failure', `DNS returned no addresses for ${host}`);
  const address = first.address.trim();
  const family = isIP(address);
  if (family !== 4 && family !== 6) {
    throw new SsrfError('blocked_address', `${address} is not an IP literal`);
  }
  return { address, family };
}

/**
 * Lookup adapter handed to node:http(s): it always answers with the pinned
 * address, so the OS resolver is never consulted a second time. node's
 * autoSelectFamily asks with `all: true` and expects an array answer.
 */
function pinnedLookup(target: PinnedTarget): LookupFunction {
  return (
    _hostname: string,
    options: LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ): void => {
    if (options.all === true) {
      callback(null, [{ address: target.address, family: target.family }]);
    } else {
      callback(null, target.address, target.family);
    }
  };
}

/**
 * Default connector: node:http/https driven straight at the pinned address
 * (custom `lookup`), while Host and TLS SNI keep the original hostname so the
 * origin still serves the right certificate and vhost. Redirects are left in
 * the body for {@link safeFetch} to refuse — the client never follows them.
 */
const defaultRequest: RequestFn = (target) =>
  new Promise<RawResponse>((resolvePromise, rejectPromise) => {
    const secure = target.url.protocol === 'https:';
    const hostname = target.url.hostname.replace(/^\[|\]$/g, '');
    const options: HttpRequestOptions & { servername?: string } = {
      method: 'GET',
      hostname,
      port: target.port,
      path: `${target.url.pathname}${target.url.search}`,
      headers: { host: target.url.host },
      lookup: pinnedLookup(target),
    };
    // SNI carries the hostname, never an IP literal (RFC 6066).
    if (isIP(hostname) === 0) options.servername = hostname;

    const request = secure ? httpsRequest(options) : httpRequest(options);
    let settled = false;
    const resolveOnce = (value: RawResponse): void => {
      if (!settled) {
        settled = true;
        resolvePromise(value);
      }
    };
    const failOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      rejectPromise(
        error instanceof SsrfError ? error : new SsrfError('network_error', String(error)),
      );
      request.destroy();
    };

    request.on('socket', (socket) => {
      if (socket.connecting) {
        socket.setTimeout(CONNECT_TIMEOUT_MS);
        socket.once('connect', () => socket.setTimeout(READ_TIMEOUT_MS));
      } else {
        socket.setTimeout(READ_TIMEOUT_MS);
      }
      socket.on('timeout', () => failOnce(new SsrfError('timeout', 'upstream response timed out')));
    });
    request.on('error', (error) => failOnce(error));

    request.on('response', (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          failOnce(new SsrfError('response_too_large', 'response exceeded the size limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () =>
        resolveOnce({
          status: response.statusCode ?? 200,
          headers: response.headers,
          body: Buffer.concat(chunks),
        }),
      );
      response.on('aborted', () => failOnce(new SsrfError('network_error', 'response aborted')));
      response.on('error', (error) => failOnce(error));
    });
  });

function toResponse(raw: RawResponse): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  const bodyless =
    raw.status === 101 || raw.status === 204 || raw.status === 205 || raw.status === 304;
  return new Response(bodyless ? null : new Uint8Array(raw.body), { status: raw.status, headers });
}

/**
 * Fetch `input` with the full SSRF guard: scheme and port allowlist, one
 * resolution, whole-answer-set validation, pinned connection, and at most
 * {@link MAX_REDIRECT_HOPS} manually followed redirects — each hop
 * re-resolved and re-validated before any socket is opened.
 */
export async function safeFetch(input: string | URL, deps: SsrfDeps = {}): Promise<Response> {
  let current: URL;
  try {
    current = typeof input === 'string' ? new URL(input) : new URL(input.href);
  } catch {
    throw new SsrfError('invalid_url', `invalid URL: ${String(input)}`);
  }

  const connect = deps.request ?? defaultRequest;
  let hopsFollowed = 0;

  for (;;) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new SsrfError('unsupported_scheme', `scheme not allowlisted: ${current.protocol}`);
    }
    const port =
      current.port === '' ? (current.protocol === 'https:' ? 443 : 80) : Number(current.port);
    if (!ALLOWED_PORTS.includes(port)) {
      throw new SsrfError('blocked_port', `port ${port} is not allowlisted`);
    }

    const pinned = await resolvePublicTarget(current.hostname, port, deps);
    const raw = await connect({
      url: current,
      port,
      address: pinned.address,
      family: pinned.family,
    });

    const locationHeader = raw.headers['location'];
    const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
    if (REDIRECT_STATUSES.has(raw.status) && location !== undefined) {
      if (hopsFollowed >= MAX_REDIRECT_HOPS) {
        throw new SsrfError(
          'too_many_redirects',
          `redirect chain exceeded ${MAX_REDIRECT_HOPS} hops`,
        );
      }
      hopsFollowed += 1;
      try {
        current = new URL(location, current);
      } catch {
        throw new SsrfError('invalid_url', `redirect target is not a valid URL: ${location}`);
      }
      continue;
    }

    return toResponse(raw);
  }
}
