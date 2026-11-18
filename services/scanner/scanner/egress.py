from __future__ import annotations

import os
from typing import Callable, Dict, Optional

import httpx

from . import ssrf

EGRESS_MODE = os.environ.get("SCANNER_EGRESS_MODE", "strict").lower()

DEFAULT_USER_AGENT = os.environ.get(
    "SCANNER_USER_AGENT",
    "VulDetected-Scanner/1.0 (+https://vuldetected.app/security)",
)


class HardenedClient:
    """The only transport a check may use.

    ## WHY THE HOOK EXISTS

    Rate limiting and cooperative cancellation are per-request facts, not per-
    check ones. If each check implemented them, one forgotten call would remove
    the limit for that check. `on_request` is invoked before every request and
    may raise to abort the scan (cancellation) or to stop a scan that exceeded
    its budget.

    ## IDENTITY

    Every request carries a User-Agent that names the scanner and a contact
    page. Scanning a third-party site anonymously is both rude and
    indistinguishable from an attack; an operator who sees the traffic must be
    able to find out what it is.
    """

    def __init__(
        self,
        timeout: float = 15.0,
        default_headers: Optional[Dict[str, str]] = None,
        on_request: Optional[Callable[[], None]] = None,
    ) -> None:
        self.timeout = timeout
        self._default_headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            **(default_headers or {}),
        }
        self._on_request = on_request
        self._client = httpx.Client(
            timeout=httpx.Timeout(connect=5.0, read=timeout, write=5.0, pool=5.0),
            follow_redirects=False,
            verify=True,
        )

    def get(
        self, url: str, headers: Optional[dict] = None, follow_redirects: bool = True
    ) -> httpx.Response:
        """One GET through the SSRF guard.

        `follow_redirects=False` returns the first 3xx response untouched instead
        of walking the chain. Only the open-redirect check needs this: to decide
        whether a parameter redirects off-site it must READ the `Location`
        header, and a client that follows the chain would connect to the attacker
        host and report the final page instead. Every hop is still validated by
        `resolve_url` before the first socket is opened, and a response we do not
        follow is never dialled.
        """
        return self._request("GET", url, headers=headers, follow_redirects=follow_redirects)

    def post(
        self,
        url: str,
        data: Optional[Dict[str, str]] = None,
        headers: Optional[dict] = None,
        follow_redirects: bool = True,
    ) -> httpx.Response:
        """One form-encoded POST through the same guard as `get`.

        The login form is the only POST this worker sends (HU-04). It has to
        share the GET path's SSRF resolution, rate limit and cancellation
        checkpoints — a second transport would be a second place to forget one —
        and it must keep the cookie jar, which is how the session survives into
        the authenticated GETs.
        """
        return self._request(
            "POST",
            url,
            headers=headers,
            follow_redirects=follow_redirects,
            data=data or {},
        )

    def _request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[dict] = None,
        follow_redirects: bool = True,
        **kwargs,
    ) -> httpx.Response:
        if self._on_request is not None:
            self._on_request()

        current = ssrf.resolve_url(url)
        hops_followed = 0
        req_url = current.url
        merged_headers = {**self._default_headers, **(headers or {})}
        body = dict(kwargs)

        while True:
            resp = self._client.request(method, req_url, headers=merged_headers, **body)
            if not follow_redirects:
                return resp
            if resp.is_redirect:
                location = resp.headers.get("location")
                if not location:
                    raise ssrf.SsrfError("invalid_url", "redirect without location")
                if hops_followed >= ssrf.MAX_REDIRECT_HOPS:
                    raise ssrf.SsrfError(
                        "too_many_redirects",
                        f"redirect chain exceeded {ssrf.MAX_REDIRECT_HOPS} hops",
                    )
                current = ssrf.resolve_redirect(current, location, hops_followed=hops_followed)
                req_url = current.url
                hops_followed += 1
                # A 303, and the 301/302 that browsers also treat this way, turn
                # the request into a GET. Keeping the form body on the next hop
                # would re-submit the password to a page that never asked for it.
                if method != "GET":
                    method = "GET"
                    body = {}
                # Each hop is a new request and therefore a new rate-limit and
                # cancellation checkpoint.
                if self._on_request is not None:
                    self._on_request()
                continue
            return resp

    def close(self) -> None:
        self._client.close()
