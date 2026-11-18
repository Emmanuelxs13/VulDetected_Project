"""Form-login authentication for scans of pages behind a login (HU-04).

## Why this is a separate step and not a header

CA-25 to CA-27 describe a site whose interesting pages are behind a login form.
HTTP Basic and a bearer token are *request headers*: they authenticate every
request the scan makes, and nothing has to happen first. A form login is a
*state change* — one POST that mints a session cookie — and every later request
is authenticated only because the client kept that cookie.

The two are not interchangeable, so this module exists instead of teaching
`_auth_headers` about forms. The `HardenedClient` is created once per scan and
owns the cookie jar, so the session established here is the session the checks
use.

## Why the success marker is mandatory

A login that answers 200 is not a login that worked: countless applications
render "invalid credentials" with a 200, and some render the private page for
anonymous visitors and hide it with JavaScript. The credential therefore carries
a marker string that only appears when the session is real, and a response
without it is a failure. Scanning anonymously while claiming to have scanned the
private pages is the one outcome this module must make impossible.

## Known limitation

The form is posted as-is. A login protected by a CSRF token or a multi-step
challenge is not supported, and the scan fails with `marker_missing` instead of
silently degrading. That is the honest failure for a demo of this scope; it is
recorded in the Sprint 2 verification manual.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple
from urllib.parse import urljoin, urlsplit

#: Reasons a login can fail. Stable strings: the web app renders a translated
#: message and the scan's `error` column stores `login_failed: <reason>`.
LOGIN_FAILURE_REASONS = (
    "invalid_credentials",
    "marker_missing",
    "cross_origin_login",
    "cross_origin_redirect",
    "transport_error",
)


class LoginError(Exception):
    """Raised when the form login did not produce a usable session."""

    def __init__(self, reason: str, message: str | None = None) -> None:
        super().__init__(message or f"form login failed ({reason})")
        self.reason = reason


def _origin(url: str) -> Tuple[str, str, int | None]:
    parts = urlsplit(url)
    return (parts.scheme.lower(), (parts.hostname or "").lower(), parts.port)


def login_with_form(client: Any, base_url: str, secret: Dict[str, Any]) -> str:
    """Logs in with the stored form credential and returns the authenticated URL.

    The returned URL is the page the provider redirected to after a successful
    login — the landing page of the private area. It is where the authenticated
    pass points its checks, because it is the one URL the login itself proved
    the session can reach.
    """
    login_path = str(secret.get("loginPath") or "/login")
    # The worker does not trust the web app's validation: the payload arrives in
    # a job, and a job can be written by anything. A path that is not
    # root-relative, or that starts with `//` (protocol-relative), would leave
    # the site once `urljoin` resolves it, so it is refused before the request.
    if not login_path.startswith("/") or login_path.startswith("//"):
        raise LoginError(
            "cross_origin_login", f"login path is not root-relative: {login_path}"
        )
    login_url = urljoin(base_url.rstrip("/") + "/", login_path.lstrip("/"))

    # The credential belongs to this domain; posting it somewhere else would
    # hand the password to a third party. Both the target and the destination of
    # the redirect are checked, because a login that redirects off-site is the
    # classic way to exfiltrate what the user just typed.
    if _origin(login_url) != _origin(base_url):
        raise LoginError("cross_origin_login", f"login path leaves the target: {login_url}")

    username_field = str(secret.get("usernameField") or "username")
    password_field = str(secret.get("passwordField") or "password")
    form = {
        username_field: str(secret.get("username", "")),
        password_field: str(secret.get("password", "")),
    }

    try:
        response = client.post(login_url, data=form)
    except Exception as exc:  # noqa: BLE001 - transport failures are a login failure
        raise LoginError("transport_error", str(exc)) from exc

    if response.status_code in (401, 403):
        raise LoginError("invalid_credentials", f"login answered {response.status_code}")
    if response.status_code >= 400:
        raise LoginError("transport_error", f"login answered {response.status_code}")

    final_url = str(response.url)
    if _origin(final_url) != _origin(base_url):
        raise LoginError("cross_origin_redirect", f"login redirected off-site: {final_url}")

    marker = str(secret.get("successMarker") or "").strip()
    if marker and marker not in response.text:
        raise LoginError(
            "marker_missing",
            "the response after login does not contain the success marker",
        )

    return final_url
