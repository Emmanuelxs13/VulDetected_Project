from __future__ import annotations

import hashlib
from typing import Any, Dict, List


REQUIRED_HEADERS = [
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
]


async def run(ctx) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    try:
        resp = ctx.client.get(ctx.target["base_url"])
    except Exception as e:
        # If we can't reach, let task handle/report as appropriate
        raise

    headers = {k.lower(): v for k, v in resp.headers.items()}
    for h in REQUIRED_HEADERS:
        if h not in headers or not headers[h]:
            affected = ctx.target["base_url"]
            key = hashlib.sha256(f"{ctx.domain_id}|security_headers|{affected}|{h}".encode()).hexdigest()
            findings.append(
                {
                    "key": key,
                    "check": "security_headers",
                    "title": f"Missing {h} header",
                    "description": f"The {h} header is missing or empty.",
                    "affected_url": affected,
                    "evidence": {"header": h},
                    "raw": {},
                }
            )
    return findings
