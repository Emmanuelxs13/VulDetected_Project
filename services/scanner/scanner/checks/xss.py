"""Reflected cross-site scripting (A03).

The check is intentionally conservative: a marker is sent first, then a payload
that would only survive a real reflection. A page that HTML-escapes its input
shows ``&lt;vd…&gt;`` and produces nothing. That comparison is what keeps the
finding from being "some sites echo the search box", which would be noise.
"""

from __future__ import annotations

import secrets
from typing import Any, Dict, List

from ..active import build_finding, existing_params, request, with_param

CANDIDATE_PARAMS = ["q", "s", "search", "query", "keyword", "term", "name", "id"]
MAX_PARAMS = 3


def _payloads(token: str) -> List[str]:
    return [
        f'"><vd{token}>',
        f"'><vd{token}>",
    ]


async def run(ctx: Any) -> List[Dict[str, Any]]:
    base = str(ctx.target["base_url"])
    token = secrets.token_hex(6)
    findings: List[Dict[str, Any]] = []

    params = existing_params(base)
    candidates = (params + [name for name in CANDIDATE_PARAMS if name not in params])[:MAX_PARAMS]

    for name in candidates:
        marker = f"vd{token}{name}"
        try:
            probe = request(ctx, with_param(base, name, marker))
        except Exception:
            continue

        content_type = probe.headers.get("content-type", "")
        if content_type and "html" not in content_type.lower():
            continue
        if marker not in probe.text:
            # The parameter is not reflected at all: nothing to break out of.
            continue

        for payload in _payloads(token):
            try:
                response = request(ctx, with_param(base, name, payload))
            except Exception:
                continue
            if f"<vd{token}>" in response.text:
                findings.append(
                    build_finding(
                        ctx,
                        check="xss",
                        title=f"Reflected XSS in the '{name}' parameter",
                        description=(
                            "The parameter is reflected in the HTML response without "
                            "encoding, so an attacker can run script in the victim's "
                            "session."
                        ),
                        affected_url=with_param(base, name, payload),
                        evidence={
                            "parameter": name,
                            "payload": payload,
                            "status": response.status_code,
                        },
                        discriminator=name,
                    )
                )
                break

    return findings
