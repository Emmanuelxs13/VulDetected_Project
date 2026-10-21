from __future__ import annotations

import hashlib
from typing import Any, Dict, List


async def run(ctx) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    # Manual chain check - follow up to 5 with our client logic; client already enforces
    try:
        resp = ctx.client.get(ctx.target["base_url"])
    except Exception:
        raise

    # If ended up following, client did it; simplified: just check final
    if str(resp.url).startswith("http://") and ctx.target["scheme"] == "https":
        affected = ctx.target["base_url"]
        key = hashlib.sha256(f"{ctx.domain_id}|redirects|{affected}|downgrade".encode()).hexdigest()
        findings.append(
            {
                "key": key,
                "check": "redirects",
                "title": "HTTPS downgraded to HTTP",
                "description": "Redirect chain downgraded from HTTPS to HTTP.",
                "affected_url": affected,
                "evidence": {"final_url": str(resp.url)},
                "raw": {},
            }
        )
    return findings
