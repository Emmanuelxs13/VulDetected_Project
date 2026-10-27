"""Permissive CORS (A05).

Only two shapes matter in practice: the origin is reflected back, which grants
any site access, and credentials are allowed alongside it, which turns that into
authenticated cross-site reads. A plain ``*`` without credentials is recorded as
informational-by-shape but still reported: public APIs sometimes need it, so the
severity differs from the credentialed case and the evidence says why.
"""

from __future__ import annotations

from typing import Any, Dict, List

from ..active import build_finding, request

EVIL_ORIGIN = "https://vuldetected-cors.example"


async def run(ctx: Any) -> List[Dict[str, Any]]:
    base = str(ctx.target["base_url"])
    findings: List[Dict[str, Any]] = []

    try:
        response = request(ctx, base, headers={"Origin": EVIL_ORIGIN})
    except Exception:
        return findings

    allow_origin = (response.headers.get("access-control-allow-origin", "") or "").strip()
    credentials = (
        response.headers.get("access-control-allow-credentials", "") or ""
    ).strip().lower() == "true"

    if not allow_origin:
        return findings

    reflected = allow_origin == EVIL_ORIGIN
    wildcard = allow_origin == "*"

    if not reflected and not wildcard:
        return findings

    if reflected and credentials:
        title = "CORS reflects any origin with credentials"
        severity_note = "any site can read authenticated responses"
    elif reflected:
        title = "CORS reflects any origin"
        severity_note = "any site can read unauthenticated responses"
    elif credentials:
        # `*` with credentials is rejected by browsers, so this is a
        # configuration error rather than a live cross-origin read.
        title = "CORS allows every origin while advertising credentials"
        severity_note = "browsers reject this combination, so it is misconfiguration"
    else:
        title = "CORS allows every origin"
        severity_note = "the API is readable from any site"

    findings.append(
        build_finding(
            ctx,
            check="cors",
            title=title,
            description=f"The Access-Control-Allow-Origin header {severity_note}.",
            affected_url=base,
            evidence={
                "origin": EVIL_ORIGIN,
                "allow_origin": allow_origin,
                "allow_credentials": credentials,
                "reflected": reflected,
                "wildcard": wildcard,
            },
        )
    )

    return findings
