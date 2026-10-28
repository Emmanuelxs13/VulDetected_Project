"""Shared helpers for the active checks.

The passive checks read response headers. The active checks send a small number
of crafted requests and look for evidence in the response. Both must produce the
exact same finding shape and the exact same stable key, or deduplication and
"new since last scan" stop working for half the product.

This module owns that shape. It is deliberately small and dependency-free: every
check imports it, so the rule is written once.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

DEFAULT_PORTS = {"http": 80, "https": 443}


def normalize_url(raw: str) -> str:
    """Mirror of `normalizeFindingUrl` in the web app.

    Lowercases scheme and host, drops the fragment, removes a default port and
    sorts the query parameters. Path and query values are preserved: they change
    what was actually scanned. The trailing slash matches `new URL(...)` in Node,
    which renders a path-less URL with ``/`` — the two languages must agree or
    the same finding gets two keys.
    """
    value = raw.strip()
    if not value:
        return ""

    try:
        parts = urlsplit(value)
    except ValueError:
        return value
    if not parts.scheme or not parts.hostname:
        return value

    scheme = parts.scheme.lower()
    host = parts.hostname.lower()
    try:
        port = parts.port
    except ValueError:
        return value

    if ":" in host:  # IPv6 literal
        host = f"[{host}]"

    netloc = host
    if port is not None and port != DEFAULT_PORTS.get(scheme):
        netloc = f"{host}:{port}"

    query = sorted(parse_qsl(parts.query, keep_blank_values=True), key=lambda pair: pair[0])
    path = parts.path or "/"

    return urlunsplit((scheme, netloc, path, urlencode(query), ""))


def fingerprint(
    domain_id: str,
    check_name: str,
    affected_url: str,
    discriminator: Optional[str] = None,
) -> str:
    """`sha256(domain | check | normalized url[| discriminator])`.

    Same construction as `computeFindingKey` in the web app; a shared fixture in
    both test suites fails the build if the two drift apart.
    """
    parts = [domain_id, check_name, normalize_url(affected_url)]
    if discriminator:
        parts.append(discriminator)
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def build_finding(
    ctx: Any,
    *,
    check: str,
    title: str,
    description: str,
    affected_url: str,
    evidence: Dict[str, Any],
    discriminator: Optional[str] = None,
    raw: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "key": fingerprint(ctx.domain_id, check, affected_url, discriminator),
        "check": check,
        "title": title,
        "description": description,
        "affected_url": affected_url,
        "evidence": evidence,
        "raw": raw or {},
    }


def request(ctx: Any, url: str, headers: Optional[Dict[str, str]] = None):
    """One GET through the hardened client.

    The client owns SSRF resolution, TLS verification, redirect policy, the
    identity headers and the per-scan rate limit. A check must never build its
    own transport: that is how a rate limit gets bypassed.
    """
    return ctx.client.get(url, headers=headers)


def header(resp: Any, name: str) -> str:
    try:
        return resp.headers.get(name, "") or ""
    except Exception:
        return ""


def with_param(base_url: str, name: str, value: str) -> str:
    """Returns `base_url` with `name` replaced (or added) and the rest kept."""
    parts = urlsplit(base_url)
    query: List[Tuple[str, str]] = [
        (k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != name
    ]
    query.append((name, value))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def existing_params(base_url: str) -> List[str]:
    parts = urlsplit(base_url)
    seen: List[str] = []
    for name, _ in parse_qsl(parts.query, keep_blank_values=True):
        if name not in seen:
            seen.append(name)
    return seen


def target_host(ctx: Any) -> str:
    return str(ctx.target.get("host", "")).lower()


def is_external_location(location: str, host: str) -> bool:
    """True when `location` points outside the scanned host.

    A scheme-only upgrade (`http://host` → `https://host`) and any path on the
    same host or its subdomains are internal. Everything else is an open
    redirect, including `//evil.example` (protocol-relative).
    """
    if not location:
        return False
    candidate = location.strip()
    if candidate.startswith("//"):
        candidate = "https:" + candidate

    try:
        resolved = urlsplit(candidate)
    except ValueError:
        return False

    resolved_host = (resolved.hostname or "").lower()
    if not resolved_host:
        # Relative path.
        return False

    return not (resolved_host == host or resolved_host.endswith("." + host))


_HTML_LIKE = re.compile(r"<!doctype html|<html", re.IGNORECASE)


def looks_like_html(body: str) -> bool:
    return bool(_HTML_LIKE.search(body[:2000]))
