import { describe, expect, it, vi } from 'vitest';

import {
  ALLOWED_PORTS,
  MAX_REDIRECT_HOPS,
  SsrfError,
  type PinnedRequest,
  type RawResponse,
  type SsrfReason,
  isBlockedAddress,
  normalizeHost,
  resolvePublicTarget,
  safeFetch,
} from './ssrf';

/**
 * Anti-SSRF guard tests (design D6, specs SS-2 / SW-3).
 *
 * Every case maps to a documented bypass in `docs/security.md` §2: a target the
 * attacker reaches by making DNS — not the hostname string — do the lying. No
 * test touches the network: the resolver and the connector are injected, so a
 * green run is deterministic and an offline CI run is a real run.
 */

async function expectSsrfReason(promise: Promise<unknown>, reason: SsrfReason) {
  const error = await promise.then(
    () => {
      throw new Error(`expected an SsrfError with reason "${reason}" but the call resolved`);
    },
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(SsrfError);
  expect((error as SsrfError).reason).toBe(reason);
}

type Resolved = { address: string; family: number };

/** Resolver stub. Records every hostname it was asked to resolve. */
function lookupSpy(results: Record<string, Resolved[]>) {
  return vi.fn(async (hostname: string): Promise<Resolved[]> => results[hostname] ?? []);
}

/** Connector stub. Records every pinned target it was asked to dial. */
function requestSpy(handler: (target: PinnedRequest) => RawResponse | Promise<RawResponse>) {
  return vi.fn(async (target: PinnedRequest) => handler(target));
}

const ok = (body = ''): RawResponse => ({ status: 200, headers: {}, body: Buffer.from(body) });
const redirect = (location: string): RawResponse => ({
  status: 302,
  headers: { location },
  body: Buffer.alloc(0),
});

describe('isBlockedAddress', () => {
  it.each([
    ['127.0.0.1'], // loopback
    ['127.5.5.5'], // anywhere in 127.0.0.0/8
    ['169.254.169.254'], // cloud metadata / link-local
    ['10.0.0.1'], // RFC1918
    ['172.16.0.1'], // RFC1918
    ['172.31.255.255'], // RFC1918 upper bound
    ['192.168.1.1'], // RFC1918
    ['0.0.0.0'], // unspecified
    ['224.0.0.1'], // multicast
    ['::1'], // IPv6 loopback
    ['fe80::1'], // IPv6 link-local
    ['fc00::1'], // IPv6 unique local
    ['fd12:3456::1'], // IPv6 unique local
    ['::'], // IPv6 unspecified
    ['ff02::1'], // IPv6 multicast
    ['::ffff:127.0.0.1'], // IPv4-mapped loopback
    ['::ffff:7f00:1'], // the same address, hex spelling
    ['::ffff:169.254.169.254'], // IPv4-mapped metadata
    ['::ffff:10.0.0.1'], // IPv4-mapped RFC1918
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    ['93.184.216.34'], // public IPv4
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['2606:4700:4700::1111'], // public IPv6
    ['::ffff:8.8.8.8'], // IPv4-mapped public address, normalised to IPv4
  ])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('fails closed on input it cannot parse', () => {
    expect(isBlockedAddress('not-an-address')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });
});

describe('normalizeHost', () => {
  it.each([
    ['2130706433'], // decimal form of 127.0.0.1
    ['0177.0.0.1'], // octal
    ['0x7f000001'], // hex
    ['127.1'], // short form
    ['1.2.3.4.5'], // too many octets
    ['127.0.0.1.'], // trailing dot
    ['26064'], // numeric single label
  ])('rejects the non-canonical IPv4 literal %s', (host) => {
    expect(() => normalizeHost(host)).toThrow(SsrfError);
  });

  it.each([
    ['0:0:0:0:0:0:0:1'], // expanded ::1
    ['2001:0db8::1'], // padded group
    ['2001:DB8::0'], // uppercase + padded group
    ['fe80::1%eth0'], // zone id
  ])('rejects the non-canonical IPv6 literal %s', (host) => {
    expect(() => normalizeHost(host)).toThrow(SsrfError);
  });

  it('normalises IPv4-mapped literals to their IPv4 form', () => {
    expect(normalizeHost('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeHost('::ffff:7f00:1')).toBe('127.0.0.1');
  });

  it('unbrackets the IPv6 literal a URL carries', () => {
    expect(normalizeHost('[2001:db8::1]')).toBe('2001:db8::1');
    expect(normalizeHost('[::1]')).toBe('::1');
  });

  it('accepts canonical literals and lowercases hostnames', () => {
    expect(normalizeHost('1.2.3.4')).toBe('1.2.3.4');
    expect(normalizeHost('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizeHost('::1')).toBe('::1');
    expect(normalizeHost('Example.COM')).toBe('example.com');
  });
});

describe('resolvePublicTarget', () => {
  it('resolves once and pins the first public address', async () => {
    const lookup = lookupSpy({
      'example.org': [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:4700:4700::1111', family: 6 },
      ],
    });

    const pinned = await resolvePublicTarget('example.org', 443, { lookup });

    expect(pinned).toEqual({ address: '93.184.216.34', family: 4 });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('rejects a host whose answer set contains a blocked address', async () => {
    const lookup = lookupSpy({
      'rebind.example': [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    });

    await expectSsrfReason(
      resolvePublicTarget('rebind.example', 443, { lookup }),
      'blocked_address',
    );
  });

  it('rejects a host that only resolves to loopback', async () => {
    const lookup = lookupSpy({ 'internal.example': [{ address: '::1', family: 6 }] });

    await expectSsrfReason(
      resolvePublicTarget('internal.example', 80, { lookup }),
      'blocked_address',
    );
  });

  it('rejects an empty answer without inventing an address', async () => {
    const lookup = lookupSpy({});

    await expectSsrfReason(resolvePublicTarget('nxdomain.example', 443, { lookup }), 'dns_failure');
  });

  it.each([8080, 8443, 22, 0, 65535])('rejects the non-allowlisted port %i', async (port) => {
    const lookup = lookupSpy({ 'example.org': [{ address: '93.184.216.34', family: 4 }] });

    await expectSsrfReason(resolvePublicTarget('example.org', port, { lookup }), 'blocked_port');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects non-canonical IP literals before consulting DNS', async () => {
    const lookup = lookupSpy({});

    await expectSsrfReason(resolvePublicTarget('2130706433', 80, { lookup }), 'non_canonical_ip');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('accepts the allowlisted ports only', async () => {
    for (const port of ALLOWED_PORTS) {
      const lookup = lookupSpy({ 'example.org': [{ address: '93.184.216.34', family: 4 }] });
      const pinned = await resolvePublicTarget('example.org', port, { lookup });
      expect(pinned.address).toBe('93.184.216.34');
    }
  });
});

describe('safeFetch', () => {
  const publicAnswer = { 'example.org': [{ address: '93.184.216.34', family: 4 }] };

  it('returns a 200 response body without following anything', async () => {
    const lookup = lookupSpy(publicAnswer);
    const request = requestSpy(() => ok('token-value'));

    const response = await safeFetch('https://example.org/.well-known/vuldetected.txt', {
      lookup,
      request,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('token-value');
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('connects to the pinned address, never to the hostname again', async () => {
    const lookup = lookupSpy(publicAnswer);
    const request = requestSpy(() => ok());

    await safeFetch('http://example.org/.well-known/vuldetected.txt', { lookup, request });

    expect(request).toHaveBeenCalledTimes(1);
    const target = request.mock.calls[0]?.[0];
    expect(target?.address).toBe('93.184.216.34');
    expect(target?.family).toBe(4);
    expect(target?.port).toBe(80);
    expect(target?.url.hostname).toBe('example.org');
  });

  it('rejects a redirect to a blocked address without requesting it', async () => {
    const lookup = lookupSpy(publicAnswer);
    const request = requestSpy(() => redirect('http://169.254.169.254/latest/meta-data/'));

    await expectSsrfReason(
      safeFetch('http://example.org/.well-known/vuldetected.txt', { lookup, request }),
      'blocked_address',
    );

    // Exactly one connection: the allowed hop. The metadata hop is never dialed.
    expect(request).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('rejects a redirect chain that exceeds the hop limit', async () => {
    const hops = Array.from({ length: MAX_REDIRECT_HOPS + 2 }, (_, index) => `hop${index}`);
    const answers: Record<string, Resolved[]> = Object.fromEntries(
      hops.map((hop, index) => [hop, [{ address: `93.184.216.${index + 1}`, family: 4 }]]),
    );
    const lookup = lookupSpy(answers);
    let call = 0;
    const request = requestSpy(() => {
      call += 1;
      return redirect(`http://hop${call}/next`);
    });

    await expectSsrfReason(
      safeFetch('http://hop0/start', { lookup, request }),
      'too_many_redirects',
    );

    // `MAX_REDIRECT_HOPS` redirect answers are followed; the next one is refused.
    expect(request).toHaveBeenCalledTimes(MAX_REDIRECT_HOPS + 1);
    expect(lookup).toHaveBeenCalledTimes(MAX_REDIRECT_HOPS + 1);
  });

  it('follows an allowed redirect chain hop by hop, re-resolving each time', async () => {
    const lookup = lookupSpy({
      hop0: [{ address: '93.184.216.1', family: 4 }],
      hop1: [{ address: '93.184.216.2', family: 4 }],
      hop2: [{ address: '93.184.216.3', family: 4 }],
    });
    const addresses: string[] = [];
    let call = 0;
    const request = requestSpy((target) => {
      addresses.push(target.address);
      call += 1;
      if (call < 3) {
        return redirect(`http://hop${call}/next`);
      }
      return ok('done');
    });

    const response = await safeFetch('http://hop0/start', { lookup, request });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('done');
    expect(addresses).toEqual(['93.184.216.1', '93.184.216.2', '93.184.216.3']);
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it('rejects a rebinding answer that flips to a private address on a later hop', async () => {
    const lookup = lookupSpy({
      'example.org': [{ address: '93.184.216.34', family: 4 }],
      'evil.example': [{ address: '127.0.0.1', family: 4 }],
    });
    const request = requestSpy(() => redirect('http://evil.example/payload'));

    await expectSsrfReason(
      safeFetch('http://example.org/', { lookup, request }),
      'blocked_address',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported schemes and non-allowlisted ports', async () => {
    const lookup = lookupSpy(publicAnswer);
    const request = requestSpy(() => ok());

    await expectSsrfReason(
      safeFetch('ftp://example.org/file', { lookup, request }),
      'unsupported_scheme',
    );
    await expectSsrfReason(
      safeFetch('http://example.org:8080/', { lookup, request }),
      'blocked_port',
    );
    expect(request).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });
});
