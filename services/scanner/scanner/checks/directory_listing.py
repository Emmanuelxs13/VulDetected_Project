"""Directory listing (A05).

A handful of conventional directories are requested; the check looks for the
server-generated index page, not for a custom "files" screen. One request per
path and a hard cap keep it from becoming a content-discovery brute force.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

from ..active import build_finding, looks_like_html, request

CANDIDATE_PATHS = ["/uploads/", "/files/", "/static/", "/backup/", "/assets/"]

_INDEX_RE = re.compile(r"<title>\s*index of\s*/", re.IGNORECASE)


async def run(ctx: Any) -> List[Dict[str, Any]]:
    base = str(ctx.target["base_url"]).rstrip("/")
    findings: List[Dict[str, Any]] = []

    for path in CANDIDATE_PATHS:
        url = base + path
        try:
            response = request(ctx, url)
        except Exception:
            continue

        if response.status_code != 200:
            continue

        content_type = response.headers.get("content-type", "")
        if "html" not in content_type.lower():
            continue

        body = response.text[:5000]
        if not looks_like_html(body):
            continue
        if not _INDEX_RE.search(body):
            continue

        findings.append(
            build_finding(
                ctx,
                check="directory_listing",
                title=f"Directory listing enabled at {path}",
                description=(
                    "The server returns an automatic index of the directory, exposing "
                    "files that were not meant to be discoverable."
                ),
                affected_url=url,
                evidence={"path": path, "status": response.status_code},
                discriminator=path,
            )
        )

    return findings
