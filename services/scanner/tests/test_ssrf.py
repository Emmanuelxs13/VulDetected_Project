"""SSRF guard tests for the scan worker (design D6, specs SW-1 / SW-3 / SW-6).

The worker re-validates every target the web app hands it, so these tests pin
the exact rule table in ``docs/security.md`` §2: redirect accounting, IPv6
spellings, DNS rebinding answer sets, and the port allowlist. The resolver is
injected everywhere — a green run never touches the network, which is exactly
what makes it trustworthy as a security-boundary test.
"""

from __future__ import annotations

from typing import Callable

import pytest

from scanner.ssrf import (
    ALLOWED_PORTS,
    MAX_REDIRECT_HOPS,
    SsrfError,
    is_blocked_address,
    normalize_host,
    resolve_redirect,
    resolve_target,
    resolve_url,
)

Resolver = Callable[[str], list[str]]


def forbidden_resolver(_host: str) -> list[str]:
    raise AssertionError("the resolver must not be consulted for this case")


def reason_of(callable_with_side_effects) -> str:
    """Run a call, require it to raise SsrfError, return the stable reason."""
    with pytest.raises(SsrfError) as exc_info:
        callable_with_side_effects()
    return exc_info.value.reason


# --- Address rule table (Node/Python parity is asserted case by case) --------


def test_blocked_ranges_match_the_security_doc_table() -> None:
    blocked = [
        "127.0.0.1",  # loopback
        "127.5.5.5",  # anywhere in 127.0.0.0/8
        "169.254.169.254",  # cloud metadata / link-local
        "10.0.0.1",  # RFC1918
        "172.16.0.1",  # RFC1918
        "172.31.255.255",  # RFC1918 upper bound
        "192.168.1.1",  # RFC1918
        "0.0.0.0",  # unspecified
        "224.0.0.1",  # multicast
        "::1",  # IPv6 loopback
        "fe80::1",  # IPv6 link-local
        "fc00::1",  # IPv6 unique local
        "fd12:3456::1",  # IPv6 unique local
        "::",  # IPv6 unspecified
        "ff02::1",  # IPv6 multicast
        "::ffff:127.0.0.1",  # IPv4-mapped loopback
        "::ffff:7f00:1",  # the same address, hex spelling
        "::ffff:169.254.169.254",  # IPv4-mapped metadata
        "::ffff:10.0.0.1",  # IPv4-mapped RFC1918
    ]
    for address in blocked:
        assert is_blocked_address(address), address


def test_public_addresses_are_not_blocked() -> None:
    allowed = [
        "93.184.216.34",
        "8.8.8.8",
        "1.1.1.1",
        "2606:4700:4700::1111",
        "::ffff:8.8.8.8",  # normalises to a public IPv4
    ]
    for address in allowed:
        assert not is_blocked_address(address), address


def test_unparseable_addresses_fail_closed() -> None:
    assert is_blocked_address("not-an-address")
    assert is_blocked_address("")


# --- Canonical-form enforcement ----------------------------------------------


@pytest.mark.parametrize(
    "host",
    [
        "2130706433",  # decimal form of 127.0.0.1
        "0177.0.0.1",  # octal
        "0x7f000001",  # hex
        "127.1",  # short form
        "1.2.3.4.5",  # too many octets
        "127.0.0.1.",  # trailing dot
        "26064",  # numeric single label
    ],
)
def test_rejects_non_canonical_ipv4_literals(host: str) -> None:
    assert reason_of(lambda: normalize_host(host)) == "non_canonical_ip"


@pytest.mark.parametrize(
    "host",
    [
        "0:0:0:0:0:0:0:1",  # expanded ::1
        "2001:0db8::1",  # padded group
        "2001:DB8::0",  # uppercase + padded group
        "fe80::1%eth0",  # zone id
    ],
)
def test_rejects_non_canonical_ipv6_literals(host: str) -> None:
    assert reason_of(lambda: normalize_host(host)) == "non_canonical_ip"


def test_ipv4_mapped_literals_normalise_to_ipv4() -> None:
    assert normalize_host("::ffff:127.0.0.1") == "127.0.0.1"
    assert normalize_host("::ffff:7f00:1") == "127.0.0.1"


def test_url_ipv6_brackets_are_stripped() -> None:
    assert normalize_host("[2001:db8::1]") == "2001:db8::1"
    assert normalize_host("[::1]") == "::1"


def test_canonical_literals_and_hostnames_pass_through() -> None:
    assert normalize_host("1.2.3.4") == "1.2.3.4"
    assert normalize_host("2001:db8::1") == "2001:db8::1"
    assert normalize_host("::1") == "::1"
    assert normalize_host("Example.COM") == "example.com"


# --- Pinning, answer-set validation, ports ------------------------------------


def test_resolves_once_and_pins_the_first_answer() -> None:
    calls: list[str] = []

    def resolver(host: str) -> list[str]:
        calls.append(host)
        return ["93.184.216.34", "2606:4700:4700::1111"]

    target = resolve_target("example.org", 443, resolver=resolver)

    assert target.host == "example.org"
    assert target.address == "93.184.216.34"
    assert target.family == 4
    assert len(calls) == 1


def test_rebinding_answer_set_is_refused() -> None:
    def resolver(_host: str) -> list[str]:
        return ["93.184.216.34", "127.0.0.1"]

    assert reason_of(lambda: resolve_target("rebind.example", 443, resolver=resolver)) == (
        "blocked_address"
    )


def test_loopback_only_host_is_refused() -> None:
    assert reason_of(
        lambda: resolve_target("internal.example", 80, resolver=lambda _h: ["::1"])
    ) == "blocked_address"


def test_empty_answer_is_refused_without_inventing_an_address() -> None:
    assert reason_of(
        lambda: resolve_target("nxdomain.example", 443, resolver=lambda _h: [])
    ) == "dns_failure"


def test_resolver_failure_is_wrapped_as_dns_failure() -> None:
    def boom(_host: str) -> list[str]:
        raise OSError("no such host")

    assert reason_of(lambda: resolve_target("broken.example", 443, resolver=boom)) == "dns_failure"


@pytest.mark.parametrize("port", [8080, 8443, 22, 0, 65535])
def test_non_allowlisted_port_is_refused_before_dns(port: int) -> None:
    assert reason_of(lambda: resolve_target("example.org", port, resolver=forbidden_resolver)) == (
        "blocked_port"
    )


def test_non_canonical_literal_never_reaches_the_resolver() -> None:
    assert reason_of(
        lambda: resolve_target("2130706433", 80, resolver=forbidden_resolver)
    ) == "non_canonical_ip"


def test_allowlisted_ports_only() -> None:
    assert ALLOWED_PORTS == frozenset({80, 443})
    for port in (80, 443):
        target = resolve_target("example.org", port, resolver=lambda _h: ["93.184.216.34"])
        assert target.port == port
        assert target.address == "93.184.216.34"


def test_public_ipv6_literal_pins_without_dns() -> None:
    target = resolve_target("2606:4700:4700::1111", 443, resolver=forbidden_resolver)

    assert target.address == "2606:4700:4700::1111"
    assert target.family == 6


def test_blocked_literal_is_refused_without_dns() -> None:
    assert reason_of(
        lambda: resolve_target("127.0.0.1", 80, resolver=forbidden_resolver)
    ) == "blocked_address"


# --- URL gate: scheme, port, host ---------------------------------------------


def test_unsupported_scheme_and_port_are_refused_before_dns() -> None:
    assert reason_of(
        lambda: resolve_url("ftp://example.org/file", resolver=forbidden_resolver)
    ) == "unsupported_scheme"
    assert reason_of(
        lambda: resolve_url("http://example.org:8080/", resolver=forbidden_resolver)
    ) == "blocked_port"


def test_metadata_url_is_refused_by_the_literal_rule() -> None:
    assert reason_of(
        lambda: resolve_url(
            "http://169.254.169.254/latest/meta-data/", resolver=forbidden_resolver
        )
    ) == "blocked_address"


@pytest.mark.parametrize("url", ["not-a-url", "/just/a/path", "http://["])
def test_invalid_urls_are_refused(url: str) -> None:
    assert reason_of(lambda: resolve_url(url, resolver=forbidden_resolver)) == "invalid_url"


def test_url_target_carries_the_pin() -> None:
    resolved = resolve_url("http://example.org/.well-known/vuldetected.txt", resolver=lambda _h: [
        "93.184.216.34"
    ])

    assert resolved.url == "http://example.org/.well-known/vuldetected.txt"
    assert resolved.host == "example.org"
    assert resolved.port == 80
    assert resolved.address == "93.184.216.34"
    assert resolved.family == 4


# --- Redirects: per-hop revalidation and chain bound ---------------------------


def test_redirect_target_is_revalidated_on_every_hop() -> None:
    answers = iter([["93.184.216.34"], ["127.0.0.1"]])

    def resolver(_host: str) -> list[str]:
        return next(answers)

    first = resolve_url("http://example.org/start", resolver=resolver)
    assert first.address == "93.184.216.34"

    # The second hop answers with loopback: the answer set is re-validated per
    # hop, so the flip is caught before any connection would be opened.
    assert reason_of(
        lambda: resolve_redirect(first, "/next", hops_followed=0, resolver=resolver)
    ) == "blocked_address"


def test_redirect_to_a_blocked_literal_is_refused() -> None:
    resolver: Resolver = lambda _h: ["93.184.216.34"]
    first = resolve_url("http://example.org/", resolver=resolver)

    assert reason_of(
        lambda: resolve_redirect(
            first, "http://127.0.0.1/latest/meta-data/", hops_followed=0, resolver=resolver
        )
    ) == "blocked_address"


def test_relative_redirect_resolves_against_the_current_url_and_re_resolves() -> None:
    hosts: list[str] = []

    def resolver(host: str) -> list[str]:
        hosts.append(host)
        return ["93.184.216.34"]

    first = resolve_url("http://example.org/.well-known/vuldetected.txt", resolver=resolver)
    second = resolve_redirect(first, "challenge.txt", hops_followed=0, resolver=resolver)

    assert second.url == "http://example.org/.well-known/challenge.txt"
    assert second.address == "93.184.216.34"
    # Re-resolved on the hop, not served from a first-hop cache.
    assert hosts == ["example.org", "example.org"]


def test_redirect_chain_is_bounded_to_the_hop_limit() -> None:
    answers = {f"hop{index}": [f"93.184.216.{index + 1}"] for index in range(MAX_REDIRECT_HOPS + 2)}
    calls: list[str] = []

    def resolver(host: str) -> list[str]:
        calls.append(host)
        return answers[host]

    current = resolve_url("http://hop0/start", resolver=resolver)
    hops_followed = 0
    with pytest.raises(SsrfError) as exc_info:
        for _ in range(MAX_REDIRECT_HOPS + 1):
            current = resolve_redirect(
                current,
                f"http://hop{hops_followed + 1}/next",
                hops_followed=hops_followed,
                resolver=resolver,
            )
            hops_followed += 1

    assert exc_info.value.reason == "too_many_redirects"
    # hop0..hop{MAX}: one resolution per hop, never more.
    assert len(calls) == MAX_REDIRECT_HOPS + 1
