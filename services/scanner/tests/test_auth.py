"""Tests for the form-login step of an authenticated scan (HU-04).

Two things are proven here:

* `login_with_form` turns a stored credential into a session, and every way that
  can go wrong becomes a named failure instead of a silent anonymous scan;
* `HardenedClient.post` is not a second transport — it goes through the same
  SSRF gate as `get`, and it stops being a POST once a redirect arrives.

The tests use a fake client, not a live server: the module's contract is about
what it sends and what it refuses, and a socket would add nothing but flakiness.
"""

from __future__ import annotations

from typing import Any, Dict, List

import httpx
import pytest

from scanner import auth, ssrf
from scanner.auth import LoginError, login_with_form
from scanner.egress import HardenedClient

BASE_URL = "https://app.example.com/"
LOGIN_URL = "https://app.example.com/login"
PRIVATE_URL = "https://app.example.com/private"

SECRET: Dict[str, Any] = {
    "kind": "form",
    "loginPath": "/login",
    "usernameField": "email",
    "passwordField": "password",
    "username": "demo@example.com",
    "password": "Fixture-Pass-2026!",
    "successMarker": "Invoice 2026-001",
}


class FakeClient:
    """Records the POST and returns a canned response."""

    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.calls: List[Dict[str, Any]] = []

    def post(self, url: str, data: Dict[str, str] | None = None, **kwargs: Any) -> httpx.Response:
        self.calls.append({"url": url, "data": data, "kwargs": kwargs})
        return self.response


def response(status: int, url: str, body: str = "") -> httpx.Response:
    return httpx.Response(status, text=body, request=httpx.Request("POST", url))


def test_login_returns_the_page_the_session_landed_on() -> None:
    client = FakeClient(response(200, PRIVATE_URL, "Invoice 2026-001 — internal only."))

    assert login_with_form(client, BASE_URL, SECRET) == PRIVATE_URL


def test_login_posts_the_configured_field_names() -> None:
    client = FakeClient(response(200, PRIVATE_URL, "Invoice 2026-001"))

    login_with_form(
        client,
        BASE_URL,
        {**SECRET, "usernameField": "login[email]", "passwordField": "login[password]"},
    )

    assert client.calls[0]["url"] == LOGIN_URL
    assert client.calls[0]["data"] == {
        "login[email]": "demo@example.com",
        "login[password]": "Fixture-Pass-2026!",
    }


def test_bad_credentials_fail_the_login() -> None:
    client = FakeClient(response(401, LOGIN_URL, "invalid credentials"))

    with pytest.raises(LoginError) as caught:
        login_with_form(client, BASE_URL, SECRET)

    assert caught.value.reason == "invalid_credentials"


def test_a_200_without_the_marker_is_not_a_session() -> None:
    """The whole point: a login page that renders an error with 200 must fail."""

    client = FakeClient(response(200, LOGIN_URL, "Wrong password. Try again."))

    with pytest.raises(LoginError) as caught:
        login_with_form(client, BASE_URL, SECRET)

    assert caught.value.reason == "marker_missing"


def test_a_redirect_off_site_fails_the_login() -> None:
    """A login that forwards the visitor elsewhere is exfiltration, not success."""

    client = FakeClient(response(200, "https://evil.example.net/collect", "Invoice 2026-001"))

    with pytest.raises(LoginError) as caught:
        login_with_form(client, BASE_URL, SECRET)

    assert caught.value.reason == "cross_origin_redirect"


def test_a_protocol_relative_login_path_is_refused() -> None:
    client = FakeClient(response(200, PRIVATE_URL, "Invoice 2026-001"))

    with pytest.raises(LoginError) as caught:
        login_with_form(client, BASE_URL, {**SECRET, "loginPath": "//evil.example.net/login"})

    assert caught.value.reason == "cross_origin_login"
    assert client.calls == []


def test_a_transport_error_fails_the_login() -> None:
    class ExplodingClient:
        def post(self, url: str, data: Any = None, **kwargs: Any) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

    with pytest.raises(LoginError) as caught:
        login_with_form(ExplodingClient(), BASE_URL, SECRET)

    assert caught.value.reason == "transport_error"


def test_every_failure_reason_is_declared() -> None:
    """The web app renders a translated message per reason, so the set is fixed."""

    assert set(auth.LOGIN_FAILURE_REASONS) == {
        "invalid_credentials",
        "marker_missing",
        "cross_origin_login",
        "cross_origin_redirect",
        "transport_error",
    }


def test_hardened_post_goes_through_the_ssrf_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(url: str, **kwargs: Any) -> ssrf.ResolvedUrl:
        raise ssrf.SsrfError("blocked_address", "127.0.0.1 is not a public address")

    monkeypatch.setattr(ssrf, "resolve_url", refuse)
    client = HardenedClient()

    try:
        with pytest.raises(ssrf.SsrfError):
            client.post(LOGIN_URL, data={"email": "a", "password": "b"})
    finally:
        client.close()


def test_hardened_post_turns_into_a_get_on_redirect(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: List[Dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(
            {
                "method": request.method,
                "url": str(request.url),
                "body": request.content,
            }
        )
        if str(request.url) == LOGIN_URL:
            return httpx.Response(302, headers={"location": PRIVATE_URL})
        return httpx.Response(200, text="Invoice 2026-001")

    def allow(url: str, **kwargs: Any) -> ssrf.ResolvedUrl:
        return ssrf.ResolvedUrl(url=url, host="app.example.com", port=443, address="93.184.216.34", family=4)

    monkeypatch.setattr(ssrf, "resolve_url", allow)
    client = HardenedClient()
    client._client = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)

    try:
        result = client.post(LOGIN_URL, data={"email": "demo@example.com", "password": "x"})
    finally:
        client.close()

    assert result.status_code == 200
    assert [call["method"] for call in seen] == ["POST", "GET"]
    assert b"password" in seen[0]["body"]
    # The password must not be re-submitted to the page the redirect points at.
    assert seen[1]["body"] == b""
