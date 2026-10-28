"""Error-based SQL injection (A03).

Only error-based evidence is reported. A quote that changes nothing is not
proof, so the check compares the response against a baseline and requires a
database error signature that the baseline did not contain. Blind and
time-based techniques are deliberately out of scope for an automated scan of a
third-party site: they need many requests and can put load on the target.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

from ..active import build_finding, existing_params, request, with_param

CANDIDATE_PARAMS = ["id", "q", "search", "query", "page", "category"]
MAX_PARAMS = 2

ERROR_SIGNATURES = [
    r"you have an error in your sql syntax",
    r"warning.{0,20}mysql",
    r"unclosed quotation mark after the character string",
    r"quoted string not properly terminated",
    r"pg_query\(\)",
    r"postgresql.{0,30}error",
    r"sqlite3\.",
    r"ora-\d{4,5}",
    r"syntax error at or near",
    r"sqlstate\[",
]

_ERROR_RE = re.compile("|".join(ERROR_SIGNATURES), re.IGNORECASE)


def _signature(body: str) -> str | None:
    match = _ERROR_RE.search(body)
    return match.group(0) if match else None


async def run(ctx: Any) -> List[Dict[str, Any]]:
    base = str(ctx.target["base_url"])
    findings: List[Dict[str, Any]] = []

    params = existing_params(base)
    candidates = (params + [name for name in CANDIDATE_PARAMS if name not in params])[:MAX_PARAMS]

    for name in candidates:
        try:
            baseline = request(ctx, with_param(base, name, "1"))
            injected = request(ctx, with_param(base, name, "1'"))
        except Exception:
            continue

        baseline_signature = _signature(baseline.text.lower())
        injected_signature = _signature(injected.text.lower())
        if injected_signature is None or injected_signature == baseline_signature:
            continue

        findings.append(
            build_finding(
                ctx,
                check="sqli",
                title=f"SQL injection in the '{name}' parameter",
                description=(
                    "A single quote changed the response into a database error, which "
                    "means the value reaches a SQL query without parameterisation."
                ),
                affected_url=with_param(base, name, "1'"),
                evidence={
                    "parameter": name,
                    "signature": injected_signature,
                    "status": injected.status_code,
                },
                discriminator=name,
            )
        )

    return findings
