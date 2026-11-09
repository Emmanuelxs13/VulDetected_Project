"""Optional live integration with Nuclei and OWASP ZAP (HU-14).

## Why it is optional and env-gated

A scan must never fail because an external binary or a ZAP daemon is missing:
the built-in checks already produce useful findings. When the operator points
`NUCLEI_BIN` at a binary or `ZAP_API_URL` at a running ZAP instance, the worker
adds their output; otherwise this module returns nothing and the scan is exactly
the same as before.

## What is guaranteed when they ARE configured

Both tools' payloads go through `normalize` before they reach the callback:
severity is mapped through the versioned rule, and a vulnerability reported by
both tools collapses into one record that names both sources (CA-16).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from typing import Any, Dict, List

import httpx

from .normalize import dedupe_findings, normalize_nuclei, normalize_zap_alerts


def _nuclei_findings(base_url: str, domain_id: str) -> List[Dict[str, Any]]:
    binary = os.environ.get("NUCLEI_BIN", "").strip()
    if not binary:
        return []
    resolved = shutil.which(binary) or binary
    args = [resolved, "-u", base_url, "-jsonl", "-silent", "-nc"]
    templates = os.environ.get("NUCLEI_TEMPLATES", "").strip()
    if templates:
        args.extend(["-t", templates])

    try:
        completed = subprocess.run(
            args, capture_output=True, text=True, timeout=int(os.environ.get("NUCLEI_TIMEOUT", "180"))
        )
    except (OSError, subprocess.SubprocessError):
        return []

    records: List[Dict[str, Any]] = []
    for line in completed.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return normalize_nuclei(records, domain_id)


def _zap_findings(base_url: str, domain_id: str) -> List[Dict[str, Any]]:
    api_url = os.environ.get("ZAP_API_URL", "").strip()
    if not api_url:
        return []
    params = {"baseurl": base_url}
    api_key = os.environ.get("ZAP_API_KEY", "").strip()
    if api_key:
        params["apikey"] = api_key

    try:
        response = httpx.get(
            f"{api_url.rstrip('/')}/JSON/core/view/alerts/", params=params, timeout=60
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        return []

    alerts = payload.get("alerts") if isinstance(payload, dict) else None
    if not isinstance(alerts, list):
        return []
    return normalize_zap_alerts(alerts, domain_id)


def collect_external_findings(base_url: str, domain_id: str) -> List[Dict[str, Any]]:
    """Runs every configured external tool and returns deduplicated findings."""
    combined = _nuclei_findings(base_url, domain_id) + _zap_findings(base_url, domain_id)
    return dedupe_findings(combined)
