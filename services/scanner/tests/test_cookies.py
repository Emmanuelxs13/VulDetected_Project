from __future__ import annotations

import hashlib
from types import SimpleNamespace

import httpx
import pytest

from scanner.checks import cookies


@pytest.mark.asyncio
async def test_two_cookies_missing_flags_produce_distinct_keys() -> None:
    resp = httpx.Response(200, headers=[("set-cookie", "a=1"), ("set-cookie", "b=2")])
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    findings = await cookies.run(ctx)
    assert len(findings) == 6
    keys = [f["key"] for f in findings]
    assert len(keys) == len(set(keys)), "different cookies must not collide"
    assert all(f["check"] == "cookies" for f in findings)
    assert all(f["affected_url"] == "https://example.com/" for f in findings)
    assert all(f["raw"] == {} for f in findings)


@pytest.mark.asyncio
async def test_cookie_key_includes_raw_cookie_value() -> None:
    sc = "session=abc123"
    resp = httpx.Response(200, headers=[("set-cookie", sc)])
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    findings = await cookies.run(ctx)
    assert len(findings) == 3
    expected_secure = hashlib.sha256(f"dom1|cookies|https://example.com/|{sc}|secure".encode()).hexdigest()
    assert findings[0]["key"] == expected_secure
    assert findings[0]["title"] == "Cookie missing Secure flag"
    assert findings[0]["evidence"] == {"cookie": sc}


@pytest.mark.asyncio
async def test_secure_substring_suppresses_secure_finding() -> None:
    sc = "sid=insecurevalue"
    resp = httpx.Response(200, headers=[("set-cookie", sc)])
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    findings = await cookies.run(ctx)
    titles = [f["title"] for f in findings]
    assert "Cookie missing Secure flag" not in titles
    assert "Cookie missing HttpOnly flag" in titles
    assert "Cookie missing SameSite attribute" in titles
    assert len({f["key"] for f in findings}) == 2


@pytest.mark.asyncio
async def test_fully_secure_cookie_returns_empty() -> None:
    sc = "session=abc; Secure; HttpOnly; SameSite=Lax"
    resp = httpx.Response(200, headers=[("set-cookie", sc)])
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    assert await cookies.run(ctx) == []
