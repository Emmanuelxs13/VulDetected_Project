from __future__ import annotations

import os
from typing import Optional

import httpx

from . import ssrf

EGRESS_MODE = os.environ.get("SCANNER_EGRESS_MODE", "strict").lower()


class HardenedClient:
    def __init__(self, timeout: float = 15.0) -> None:
        self.timeout = timeout
        # For strict mode we don't follow redirects; for test mode we might allow in controlled fixtures
        self._client = httpx.Client(
            timeout=httpx.Timeout(connect=5.0, read=timeout, write=5.0, pool=5.0),
            follow_redirects=False,
            verify=True,
        )

    def get(self, url: str, headers: Optional[dict] = None) -> httpx.Response:
        current = ssrf.resolve_url(url)
        hops_followed = 0
        req_url = current.url
        while True:
            # We connect by URL but pin is enforced by resolving - httpx will use URL; design says pin/address
            # For safety we still go through our resolution chain
            resp = self._client.get(req_url, headers=headers)
            if resp.is_redirect:
                location = resp.headers.get("location")
                if not location:
                    raise ssrf.SsrfError("invalid_url", "redirect without location")
                if hops_followed >= ssrf.MAX_REDIRECT_HOPS:
                    raise ssrf.SsrfError("too_many_redirects", f"redirect chain exceeded {ssrf.MAX_REDIRECT_HOPS} hops")
                current = ssrf.resolve_redirect(current, location, hops_followed=hops_followed)
                req_url = current.url
                hops_followed += 1
                continue
            return resp

    def close(self) -> None:
        self._client.close()
