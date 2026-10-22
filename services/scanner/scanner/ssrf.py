"""SSRF guard for the scan worker (design D6, ``docs/security.md`` §2).

The worker is the security boundary of this system (TB5): it re-validates every
target the web app hands it instead of trusting the submission gate. The rule
table below is deliberately identical to the Node guard in
``apps/web/src/lib/ssrf.ts`` — one documented table, two implementations, and
the parity is asserted case by case in the tests.

Contract:

* Validate the ADDRESS, never the hostname string — the string is attacker
  controlled, the answer set is what actually gets dialed.
* Resolve exactly once per hop, validate every address in the A/AAAA answer
  (a single blocked address refuses the host — that is what a rebinding
  answer looks like), then pin the first public address.
* Redirects are never followed implicitly: each hop is gated from scratch,
  bounded by ``MAX_REDIRECT_HOPS``.
* Only ports 80/443, only http/https, only canonical IP literals.

The resolver is injectable so every test is hermetic.
"""

from __future__ import annotations

import ipaddress
import re
import socket
from typing import Callable, Literal, NamedTuple
from urllib.parse import urljoin, urlsplit

Reason = Literal[
    "blocked_address",
    "blocked_port",
    "dns_failure",
    "invalid_url",
    "non_canonical_ip",
    "too_many_redirects",
    "unsupported_scheme",
]

#: The only ports this application ever fetches over.
ALLOWED_PORTS: frozenset[int] = frozenset({80, 443})

#: Maximum number of redirect responses that will be accepted.
MAX_REDIRECT_HOPS = 5

Resolver = Callable[[str], list[str]]

_BLOCKED_V4 = tuple(
    ipaddress.ip_network(rule)
    for rule in (
        "0.0.0.0/8",  # unspecified ("this network")
        "10.0.0.0/8",  # RFC1918
        "127.0.0.0/8",  # loopback
        "169.254.0.0/16",  # link-local, includes cloud metadata
        "172.16.0.0/12",  # RFC1918
        "192.168.0.0/16",  # RFC1918
        "224.0.0.0/4",  # multicast
    )
)
_BLOCKED_V6 = tuple(
    ipaddress.ip_network(rule)
    for rule in (
        "::/128",  # unspecified
        "::1/128",  # loopback
        "fe80::/10",  # link-local
        "fc00::/7",  # unique local
        "ff00::/8",  # multicast
    )
)

_IPV4_RE = re.compile(
    r"(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])"
    r"(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}\Z"
)
_NUMERIC_RE = re.compile(r"[0-9.]+\Z")
_HEX_RE = re.compile(r"0x[0-9a-f]+\Z")


class SsrfError(Exception):
    """Raised for every refusal. ``reason`` is stable and asserted by tests."""

    def __init__(self, reason: Reason, message: str | None = None) -> None:
        super().__init__(message or f"SSRF guard refused the target ({reason})")
        self.reason = reason


class PinnedTarget(NamedTuple):
    """A hostname resolved once and pinned to a validated address."""

    host: str
    port: int
    address: str
    family: int


class ResolvedUrl(NamedTuple):
    """A URL that passed the scheme/port/host gate, plus its pin."""

    url: str
    host: str
    port: int
    address: str
    family: int


def is_blocked_address(address: str) -> bool:
    """True when the address falls inside a range this worker must never dial.

    Unparseable input fails closed: it is blocked, never allowed.
    """
    try:
        value = address.strip().lower()
        if value.startswith("[") and value.endswith("]"):
            value = value[1:-1]
        parsed = ipaddress.ip_address(value)
    except ValueError:
        return True

    if isinstance(parsed, ipaddress.IPv4Address):
        return any(parsed in network for network in _BLOCKED_V4)

    # IPv4-mapped (::ffff:a.b.c.d and its hex spelling) falls through to the
    # IPv4 table after normalisation, exactly like the Node guard does.
    mapped = parsed.ipv4_mapped
    if mapped is not None:
        return any(mapped in network for network in _BLOCKED_V4)
    if "%" in value:
        return True  # scoped addresses are link-local by definition
    return any(parsed in network for network in _BLOCKED_V6)


def normalize_host(host: str) -> str:
    """Normalise a host from a URL or the queue, refusing non-canonical IPs.

    Decimal ``2130706433``, octal ``0177.0.0.1``, hex ``0x7f000001``, short
    ``127.1``, expanded IPv6 and zone ids are all refused: several resolvers
    and `inet_aton` disagree about what those strings mean, and "disagree" is
    exactly what an attacker needs. IPv4-mapped literals are normalised to
    their IPv4 form so the IPv4 table applies. Hostnames pass through
    lowercased.
    """
    value = host.strip().lower()
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1]
    if "%" in value:
        raise SsrfError("non_canonical_ip", f"zone id not allowed: {host}")

    if _IPV4_RE.fullmatch(value):
        return value

    if ":" in value:
        try:
            literal = ipaddress.IPv6Address(value)
        except ValueError as exc:
            raise SsrfError("non_canonical_ip", f"not a valid IPv6 literal: {host}") from exc
        mapped = literal.ipv4_mapped
        if mapped is not None:
            return str(mapped)
        if value != literal.compressed:
            raise SsrfError("non_canonical_ip", f"non-canonical IPv6 literal: {host}")
        return value

    if _NUMERIC_RE.fullmatch(value) or _HEX_RE.fullmatch(value):
        raise SsrfError("non_canonical_ip", f"literal is not in canonical form: {host}")
    return value


def _literal_family(host: str) -> int | None:
    """IP version (4/6) when ``host`` is a literal, else None."""
    try:
        return ipaddress.ip_address(host).version
    except ValueError:
        return None


def _default_resolver(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    answers: list[str] = []
    for info in infos:
        address = str(info[4][0])
        if address not in answers:
            answers.append(address)
    return answers


def resolve_target(hostname: str, port: int, *, resolver: Resolver | None = None) -> PinnedTarget:
    """Resolve ``hostname`` once and pin the first answer of a fully checked set.

    A single blocked address anywhere in the answer set refuses the host: that
    is what a rebinding answer looks like from here. A literal needs no
    resolver at all — its "answer set" is itself, so it is validated directly.
    """
    if port not in ALLOWED_PORTS:
        raise SsrfError("blocked_port", f"port {port} is not allowlisted")

    host = normalize_host(hostname)

    literal_family = _literal_family(host)
    if literal_family is not None:
        if is_blocked_address(host):
            raise SsrfError("blocked_address", f"{host} is not a public address")
        return PinnedTarget(host=host, port=port, address=host, family=literal_family)

    resolve = resolver if resolver is not None else _default_resolver
    try:
        answers = resolve(host)
    except Exception as exc:
        raise SsrfError("dns_failure", f"DNS resolution failed for {host}") from exc

    if not answers:
        raise SsrfError("dns_failure", f"DNS returned no addresses for {host}")

    seen: set[str] = set()
    for answer in answers:
        address = answer.strip()
        if address in seen:
            continue
        seen.add(address)
        if is_blocked_address(address):
            raise SsrfError("blocked_address", f"{address} is not a public address")

    first = answers[0].strip()
    family = _literal_family(first)
    if family is None:
        raise SsrfError("blocked_address", f"{first} is not an IP literal")
    return PinnedTarget(host=host, port=port, address=first, family=family)


def resolve_url(url: str, *, resolver: Resolver | None = None) -> ResolvedUrl:
    """Gate one URL end to end: scheme, port, host canonicalisation, then pin."""
    try:
        parts = urlsplit(url)
    except ValueError as exc:
        raise SsrfError("invalid_url", f"invalid URL: {url}") from exc

    scheme = parts.scheme.lower()
    if scheme == "":
        raise SsrfError("invalid_url", f"not an absolute URL: {url}")
    if scheme not in ("http", "https"):
        raise SsrfError("unsupported_scheme", f"scheme not allowlisted: {scheme}")

    try:
        port = parts.port if parts.port is not None else (443 if scheme == "https" else 80)
    except ValueError as exc:
        raise SsrfError("invalid_url", f"invalid port in URL: {url}") from exc

    host = parts.hostname
    if not host:
        raise SsrfError("invalid_url", f"URL has no host: {url}")

    pin = resolve_target(host, port, resolver=resolver)
    return ResolvedUrl(
        url=url, host=pin.host, port=pin.port, address=pin.address, family=pin.family
    )


def resolve_redirect(
    current: ResolvedUrl,
    location: str,
    *,
    hops_followed: int,
    resolver: Resolver | None = None,
) -> ResolvedUrl:
    """Accept one redirect hop: bound the chain, then re-gate from scratch.

    ``hops_followed`` is the number of redirects already accepted; once it
    reaches ``MAX_REDIRECT_HOPS`` the next one is refused (spec SW-3). The
    destination is resolved and validated exactly like a fresh target — no
    state from the previous hop is trusted.
    """
    if hops_followed >= MAX_REDIRECT_HOPS:
        raise SsrfError("too_many_redirects", f"redirect chain exceeded {MAX_REDIRECT_HOPS} hops")
    try:
        absolute = urljoin(current.url, location)
    except ValueError as exc:
        raise SsrfError("invalid_url", f"redirect target is not a valid URL: {location}") from exc
    return resolve_url(absolute, resolver=resolver)
