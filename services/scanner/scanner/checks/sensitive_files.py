"""Exposed sensitive files (A01).

A fixed, small list of files that must never be publicly reachable. Each probe
requires BOTH a 200 and a content signature, so a SPA that answers every path
with its HTML shell (or a WAF that answers 200 with a block page) produces
nothing. The signature is what separates "the file exists" from "the server
returns something for any path".
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from ..active import build_finding, request

# path -> (kind, signature)
PROBES = [
    ("/.env", "env", r"(?m)^[A-Z][A-Z0-9_]{2,}="),
    ("/.git/config", "git", r"(?m)^\[core\]"),
    ("/.git/HEAD", "git", r"(?m)^ref:\s+refs/"),
    ("/backup.sql", "backup", r"(?is)(create\s+table|insert\s+into)"),
    ("/web.config", "config", r"(?is)<configuration"),
    ("/phpinfo.php", "phpinfo", r"(?i)php version"),
]


def _matches(signature: str, response: Any) -> bool:
    content_type = (response.headers.get("content-type", "") or "").lower()
    # An HTML answer means a catch-all route, not the file. Every probe here
    # serves text or binary; HTML is the shell of a SPA.
    if "html" in content_type:
        return False
    return bool(re.search(signature, response.text))


async def run(ctx: Any) -> List[Dict[str, Any]]:
    base = str(ctx.target["base_url"]).rstrip("/")
    findings: List[Dict[str, Any]] = []

    for path, kind, signature in PROBES:
        url = base + path
        try:
            response = request(ctx, url)
        except Exception:
            continue

        if response.status_code != 200 or not _matches(signature, response):
            continue

        findings.append(
            build_finding(
                ctx,
                check="sensitive_files",
                title=f"Sensitive file exposed: {path}",
                description=(
                    "A file that belongs on the server filesystem is publicly readable "
                    "and can leak credentials or source code."
                ),
                affected_url=url,
                evidence={
                    "path": path,
                    "kind": kind,
                    "status": response.status_code,
                    "content_type": response.headers.get("content-type", ""),
                },
                discriminator=path,
            )
        )

    return findings
