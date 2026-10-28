"""Open redirect (A01).

A parameter that redirects to an arbitrary host is used for phishing on a domain
the victim trusts, and sometimes to exfiltrate OAuth codes. The check only looks
at the Location header of a non-followed response: content that merely mentions
a URL is not a redirect.
"""

from __future__ import annotations

import secrets
from typing import Any, Dict, List
from urllib.parse import urlsplit

from ..active import (
    build_finding,
    existing_params,
    is_external_location,
    request,
    target_host,
    with_param,
)

CANDIDATE_PARAMS = [
    "redirect",
    "redirect_uri",
    "redirect_url",
    "next",
    "url",
    "return",
    "returnUrl",
    "continue",
    "target",
    "dest",
]
MAX_PARAMS = 6
REDIRECT_STATUSES = {301, 302, 303, 307, 308}


async def run(ctx: Any) -> List[Dict[str, Any]]:
    base = str(ctx.target["base_url"])
    host = target_host(ctx)
    token = secrets.token_hex(4)
    probe_url = f"https://example.org/vuldetected-{token}"
    findings: List[Dict[str, Any]] = []

    params = existing_params(base)
    candidates = (params + [name for name in CANDIDATE_PARAMS if name not in params])[:MAX_PARAMS]

    for name in candidates:
        try:
            response = request(ctx, with_param(base, name, probe_url))
        except Exception:
            continue

        if response.status_code not in REDIRECT_STATUSES:
            continue

        location = response.headers.get("location", "")
        if not is_external_location(location, host):
            continue

        findings.append(
            build_finding(
                ctx,
                check="open_redirect",
                title=f"Open redirect in the '{name}' parameter",
                description=(
                    "The application redirects to an arbitrary external host supplied by "
                    "the request, which enables credible phishing links."
                ),
                affected_url=with_param(base, name, probe_url),
                evidence={
                    "parameter": name,
                    "location": location,
                    "status": response.status_code,
                    "location_host": urlsplit(location).hostname or "",
                },
                discriminator=name,
            )
        )

    return findings
