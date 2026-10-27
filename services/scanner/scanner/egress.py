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

    def get(self, url: str, headers: Optional[dict] = None) -> httpx.Response:
        if self._on_request is not None:
            self._on_request()

        current = ssrf.resolve_url(url)
        hops_followed = 0
        req_url = current.url
        merged_headers = {**self._default_headers, **(headers or {})}

        while True:
            resp = self._client.get(req_url, headers=merged_headers)
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
                # Each hop is a new request and therefore a new rate-limit and
                # cancellation checkpoint.
                if self._on_request is not None:
                    self._on_request()
                continue
            return resp

    def close(self) -> None:
        self._client.close()
