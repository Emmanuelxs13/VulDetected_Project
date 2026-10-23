from __future__ import annotations

import hashlib
from types import SimpleNamespace

import httpx
import pytest

from scanner.checks import security_headers


@pytest.mark.asyncio
async def test_missing_all_headers_produce_distinct_keys() -> None:
    resp = httpx.Response(200, headers={})
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    findings = await security_headers.run(ctx)
    assert len(findings) == 6
    keys = [f["key"] for f in findings]
    assert len(keys) == len(set(keys)), "each missing header must have its own key"
    for f in findings:
        assert f["check"] == "security_headers"
        assert f["affected_url"] == "https://example.com/"
        assert f["raw"] == {}
        assert isinstance(f["evidence"], dict)
        assert "header" in f["evidence"]


@pytest.mark.asyncio
async def test_missing_header_key_includes_header_name() -> None:
    resp = httpx.Response(200, headers={})
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    findings = await security_headers.run(ctx)
    # first in REQUIRED_HEADERS order
    h = "strict-transport-security"
    expected = hashlib.sha256(f"dom1|security_headers|https://example.com/|{h}".encode()).hexdigest()
    assert findings[0]["key"] == expected
    assert findings[0]["title"] == f"Missing {h} header"
    assert findings[0]["description"] == f"The {h} header is missing or empty."
    assert findings[0]["evidence"] == {"header": h}


@pytest.mark.asyncio
async def test_all_headers_present_returns_empty() -> None:
    resp = httpx.Response(
        200,
        headers={
            "strict-transport-security": "max-age=31536000; includeSubDomains",
            "content-security-policy": "default-src 'self'",
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
            "referrer-policy": "strict-origin-when-cross-origin",
            "permissions-policy": "camera=()",
        },
    )
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    assert await security_headers.run(ctx) == []


@pytest.mark.asyncio
async def test_empty_header_value_is_treated_as_missing() -> None:
    resp = httpx.Response(200, headers={"x-frame-options": ""})
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    findings = await security_headers.run(ctx)
    # Empty string is falsy -> treated as missing, so ALL headers are reported missing
    assert len(findings) == 6
    keys = [f["key"] for f in findings]
    assert len(keys) == len(set(keys))


@pytest.mark.asyncio
async def test_whitespace_only_header_is_not_treated_as_missing() -> None:
    resp = httpx.Response(200, headers={"x-frame-options": " "})
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    findings = await security_headers.run(ctx)
    # only 5 missing now
    assert len(findings) == 5
    assert all(f["evidence"]["header"] != "x-frame-options" for f in findings)
