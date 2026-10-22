from __future__ import annotations

import hashlib
from typing import Any, Dict, List


async def run(ctx) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    try:
        resp = ctx.client.get(ctx.target["base_url"])
    except Exception:
        raise

    # Look for Set-Cookie
    for sc in resp.headers.get_list("set-cookie") if hasattr(resp.headers, "get_list") else []:
        sc_lower = sc.lower()
        affected = ctx.target["base_url"]
        if "secure" not in sc_lower:
            key = hashlib.sha256(f"{ctx.domain_id}|cookies|{affected}|{sc}|secure".encode()).hexdigest()
            findings.append(
                {
                    "key": key,
                    "check": "cookies",
                    "title": "Cookie missing Secure flag",
                    "description": "Set-Cookie missing Secure flag.",
                    "affected_url": affected,
                    "evidence": {"cookie": sc},
                    "raw": {},
                }
            )
        if "httponly" not in sc_lower:
            key = hashlib.sha256(f"{ctx.domain_id}|cookies|{affected}|{sc}|httponly".encode()).hexdigest()
            findings.append(
                {
                    "key": key,
                    "check": "cookies",
                    "title": "Cookie missing HttpOnly flag",
                    "description": "Set-Cookie missing HttpOnly flag.",
                    "affected_url": affected,
                    "evidence": {"cookie": sc},
                    "raw": {},
                }
            )
        if "samesite" not in sc_lower:
            key = hashlib.sha256(f"{ctx.domain_id}|cookies|{affected}|{sc}|samesite".encode()).hexdigest()
            findings.append(
                {
                    "key": key,
                    "check": "cookies",
                    "title": "Cookie missing SameSite attribute",
                    "description": "Set-Cookie missing SameSite attribute.",
                    "affected_url": affected,
                    "evidence": {"cookie": sc},
                    "raw": {},
                }
            )
    return findings
