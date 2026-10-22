from __future__ import annotations

from types import SimpleNamespace

import pytest

from scanner.checks import redirects, tls


@pytest.mark.asyncio
async def test_redirects_https_downgrade() -> None:
    resp = SimpleNamespace(url="http://example.com/final")
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/", "scheme": "https"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    findings = await redirects.run(ctx)
    assert len(findings) == 1
    f = findings[0]
    assert f["check"] == "redirects"
    assert f["title"] == "HTTPS downgraded to HTTP"
    assert f["affected_url"] == "https://example.com/"
    assert f["evidence"] == {"final_url": "http://example.com/final"}
    assert f["raw"] == {}


@pytest.mark.asyncio
async def test_redirects_no_downgrade_when_https() -> None:
    resp = SimpleNamespace(url="https://example.com/final")
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/", "scheme": "https"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    assert await redirects.run(ctx) == []


@pytest.mark.asyncio
async def test_redirects_http_target_never_reports_downgrade() -> None:
    resp = SimpleNamespace(url="http://example.com/final")
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "http://example.com/", "scheme": "http"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    assert await redirects.run(ctx) == []


@pytest.mark.asyncio
async def test_tls_http_scheme_reports_finding_without_calling_client() -> None:
    called = False

    def get(url):
        nonlocal called
        called = True
        raise AssertionError("client.get should not be called")

    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "http://example.com/", "scheme": "http"},
        client=SimpleNamespace(get=get),
    )
    findings = await tls.run(ctx)
    assert called is False
    assert len(findings) == 1
    assert findings[0]["check"] == "tls"
    assert findings[0]["title"] == "HTTPS not available"
    assert findings[0]["evidence"] == {"scheme": "http"}


@pytest.mark.asyncio
async def test_tls_https_swallow_errors() -> None:
    def get(url):
        raise RuntimeError("boom")

    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/", "scheme": "https"},
        client=SimpleNamespace(get=get),
    )
    assert await tls.run(ctx) == []


@pytest.mark.asyncio
async def test_tls_https_success_returns_empty() -> None:
    resp = SimpleNamespace()
    ctx = SimpleNamespace(
        domain_id="dom1",
        target={"base_url": "https://example.com/", "scheme": "https"},
        client=SimpleNamespace(get=lambda url: resp),
    )
    assert await tls.run(ctx) == []
