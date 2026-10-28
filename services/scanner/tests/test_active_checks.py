from __future__ import annotations

import html
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable, Dict
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from scanner import active
from scanner import tasks
from scanner.checks import (
    cors,
    directory_listing,
    open_redirect,
    sensitive_files,
    sqli,
    xss,
)

FIXTURES = Path(__file__).parent / "fixtures" / "fingerprints.json"


def make_ctx(handler: Callable[..., httpx.Response]) -> Any:
    def get(url: str, headers: Dict[str, str] | None = None) -> httpx.Response:
        return handler(url, headers or {})

    return SimpleNamespace(
        domain_id="dom1",
        target={
            "base_url": "https://example.com/",
            "scheme": "https",
            "host": "example.com",
            "port": 443,
        },
        client=SimpleNamespace(get=get),
    )


def html_response(body: str, status: int = 200) -> httpx.Response:
    return httpx.Response(
        status_code=status,
        headers={"content-type": "text/html; charset=utf-8"},
        content=body.encode("utf-8"),
    )


def query_value(url: str, name: str) -> str:
    values = parse_qs(urlsplit(url).query).get(name)
    return values[0] if values else ""


def test_fingerprint_matches_the_shared_cross_language_fixture() -> None:
    vectors = json.loads(FIXTURES.read_text(encoding="utf-8"))
    for vector in vectors:
        assert active.normalize_url(vector["rawUrl"]) == vector["normalized"]
        assert (
            active.fingerprint(
                vector["domainId"],
                vector["check"],
                vector["rawUrl"],
                vector["discriminator"],
            )
            == vector["expected"]
        )


@pytest.mark.asyncio
async def test_xss_reports_an_unescaped_reflection() -> None:
    def handler(url: str, _headers: Dict[str, str]) -> httpx.Response:
        return html_response(f"<html><body>Results: {query_value(url, 'q')}</body></html>")

    findings = await xss.run(make_ctx(handler))
    assert len(findings) == 1
    finding = findings[0]
    assert finding["check"] == "xss"
    assert finding["evidence"]["parameter"] == "q"
    assert "<vd" in finding["evidence"]["payload"]
    assert finding["key"] == active.fingerprint(
        "dom1", "xss", finding["affected_url"], "q"
    )


@pytest.mark.asyncio
async def test_xss_ignores_html_escaped_reflection() -> None:
    def handler(url: str, _headers: Dict[str, str]) -> httpx.Response:
        return html_response(f"<html><body>{html.escape(query_value(url, 'q'))}</body></html>")

    assert await xss.run(make_ctx(handler)) == []


@pytest.mark.asyncio
async def test_xss_ignores_a_parameter_that_is_not_reflected() -> None:
    def handler(_url: str, _headers: Dict[str, str]) -> httpx.Response:
        return html_response("<html><body>Static page</body></html>")

    assert await xss.run(make_ctx(handler)) == []


@pytest.mark.asyncio
async def test_sqli_reports_a_database_error_that_the_baseline_lacked() -> None:
    def handler(url: str, _headers: Dict[str, str]) -> httpx.Response:
        value = query_value(url, "id")
        if "'" in value:
            return html_response("You have an error in your SQL syntax near '''", status=500)
        return html_response("<html><body>ok</body></html>")

    findings = await sqli.run(make_ctx(handler))
    assert len(findings) == 1
    assert findings[0]["check"] == "sqli"
    assert findings[0]["evidence"]["parameter"] == "id"


@pytest.mark.asyncio
async def test_sqli_ignores_an_error_that_is_already_in_the_baseline() -> None:
    def handler(_url: str, _headers: Dict[str, str]) -> httpx.Response:
        return html_response("Warning: mysql_fetch_assoc(): supplied argument", status=500)

    assert await sqli.run(make_ctx(handler)) == []


@pytest.mark.asyncio
async def test_open_redirect_reports_a_redirect_to_an_external_host() -> None:
    def handler(url: str, _headers: Dict[str, str]) -> httpx.Response:
        if "next=" in url:
            return httpx.Response(302, headers={"location": "https://evil.example/landing"})
        return html_response("<html><body>ok</body></html>")

    findings = await open_redirect.run(make_ctx(handler))
    assert len(findings) == 1
    assert findings[0]["check"] == "open_redirect"
    assert findings[0]["evidence"]["location_host"] == "evil.example"


@pytest.mark.asyncio
async def test_open_redirect_accepts_an_internal_redirect() -> None:
    def handler(_url: str, _headers: Dict[str, str]) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://example.com/login"})

    assert await open_redirect.run(make_ctx(handler)) == []


@pytest.mark.asyncio
async def test_open_redirect_ignores_a_page_that_mentions_a_url() -> None:
    def handler(_url: str, _headers: Dict[str, str]) -> httpx.Response:
        return html_response("<html><body>Read more at https://evil.example</body></html>")

    assert await open_redirect.run(make_ctx(handler)) == []


@pytest.mark.asyncio
async def test_cors_reports_a_reflected_origin_with_credentials() -> None:
    def handler(_url: str, headers: Dict[str, str]) -> httpx.Response:
        return httpx.Response(
            200,
            headers={
                "access-control-allow-origin": headers.get("Origin", ""),
                "access-control-allow-credentials": "true",
            },
        )

    findings = await cors.run(make_ctx(handler))
    assert len(findings) == 1
    assert findings[0]["evidence"] == {
        "origin": "https://vuldetected-cors.example",
        "allow_origin": "https://vuldetected-cors.example",
        "allow_credentials": True,
        "reflected": True,
        "wildcard": False,
    }


@pytest.mark.asyncio
async def test_cors_reports_a_wildcard_without_credentials() -> None:
    def handler(_url: str, _headers: Dict[str, str]) -> httpx.Response:
        return httpx.Response(200, headers={"access-control-allow-origin": "*"})

    findings = await cors.run(make_ctx(handler))
    assert len(findings) == 1
    assert findings[0]["evidence"]["wildcard"] is True
    assert findings[0]["evidence"]["allow_credentials"] is False


@pytest.mark.asyncio
async def test_cors_is_silent_without_cors_headers() -> None:
    def handler(_url: str, _headers: Dict[str, str]) -> httpx.Response:
        return html_response("<html></html>")

    assert await cors.run(make_ctx(handler)) == []


@pytest.mark.asyncio
async def test_directory_listing_detects_the_generated_index() -> None:
    def handler(url: str, _headers: Dict[str, str]) -> httpx.Response:
        if urlsplit(url).path == "/uploads/":
            return html_response("<html><head><title>Index of /uploads</title></head></html>")
        return html_response("not found", status=404)

    findings = await directory_listing.run(make_ctx(handler))
    assert len(findings) == 1
    assert findings[0]["evidence"]["path"] == "/uploads/"


@pytest.mark.asyncio
async def test_directory_listing_ignores_a_custom_page() -> None:
    def handler(_url: str, _headers: Dict[str, str]) -> httpx.Response:
        return html_response("<html><head><title>Upload your files</title></head></html>")

    assert await directory_listing.run(make_ctx(handler)) == []


@pytest.mark.asyncio
async def test_sensitive_files_detects_an_exposed_env_file() -> None:
    def handler(url: str, _headers: Dict[str, str]) -> httpx.Response:
        if urlsplit(url).path == "/.env":
            return httpx.Response(
                200,
                headers={"content-type": "text/plain"},
                content=b"DATABASE_URL=postgres://user:pass@db/app\nSECRET=abc\n",
            )
        return httpx.Response(404, content=b"")

    findings = await sensitive_files.run(make_ctx(handler))
    assert len(findings) == 1
    assert findings[0]["evidence"]["kind"] == "env"


@pytest.mark.asyncio
async def test_sensitive_files_ignores_a_spa_catch_all() -> None:
    def handler(_url: str, _headers: Dict[str, str]) -> httpx.Response:
        return html_response("<html><body>App shell</body></html>")

    assert await sensitive_files.run(make_ctx(handler)) == []


def test_auth_headers_build_basic_bearer_and_custom_headers() -> None:
    basic = tasks._auth_headers({"kind": "basic", "username": "u", "password": "p"})
    assert basic == {"Authorization": "Basic dTpw"}
    bearer = tasks._auth_headers({"kind": "bearer", "token": "abc"})
    assert bearer == {"Authorization": "Bearer abc"}
    custom = tasks._auth_headers(
        {"kind": "header", "headerName": "X-Api-Key", "headerValue": "k"}
    )
    assert custom == {"X-Api-Key": "k"}


def test_auth_headers_refuse_header_injection() -> None:
    assert (
        tasks._auth_headers(
            {"kind": "header", "headerName": "X-Api-Key\r\nX-Evil", "headerValue": "k"}
        )
        == {}
    )
    assert (
        tasks._auth_headers(
            {"kind": "header", "headerName": "X-Api-Key", "headerValue": "k\r\nX-Evil: 1"}
        )
        == {}
    )


def test_request_hook_enforces_the_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SCANNER_REQUEST_INTERVAL_MS", "0")
    monkeypatch.setenv("SCANNER_MAX_REQUESTS", "2")
    monkeypatch.setattr(tasks, "_make_cancel_check", lambda _scan_id: lambda: False)

    hook = tasks._make_request_hook("scan-1")
    hook()
    hook()
    with pytest.raises(tasks.ScanBudgetExceeded):
        hook()


def test_request_hook_honours_cancellation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SCANNER_REQUEST_INTERVAL_MS", "0")
    monkeypatch.setattr(tasks, "_make_cancel_check", lambda _scan_id: lambda: True)

    hook = tasks._make_request_hook("scan-1")
    with pytest.raises(tasks.ScanCancelled):
        hook()
