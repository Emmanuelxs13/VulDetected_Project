from __future__ import annotations

import hashlib
from typing import Any, Dict, List


async def run(ctx) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    if ctx.target["scheme"] != "https":
        affected = ctx.target["base_url"]
        key = hashlib.sha256(f"{ctx.domain_id}|tls|{affected}".encode()).hexdigest()
        findings.append(
            {
                "key": key,
                "check": "tls",
                "title": "HTTPS not available",
                "description": "Target is not served over HTTPS.",
                "affected_url": affected,
                "evidence": {"scheme": ctx.target["scheme"]},
                "raw": {},
            }
        )
        return findings
    # In Sprint 2 keep simple; deeper checks can come later
    try:
        ctx.client.get(ctx.target["base_url"])
    except Exception:
        pass
    return findings
