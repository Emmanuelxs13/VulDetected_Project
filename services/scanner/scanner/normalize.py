"""Normalisation of external scanner output (HU-14, CA-14 / CA-15 / CA-16).

## Why this module exists

The built-in checks emit the same finding shape directly, so the web app can
classify them from `check_name`. Nuclei and OWASP ZAP speak different
vocabularies: Nuclei emits JSONL records with `info.severity`, ZAP emits a JSON
report with `riskcode`. Both have to land on the SAME deterministic catalog
(`Critical`, `High`, `Medium`, `Low`, `Info`, `unclassified`) through a rule a
reader can audit, and a vulnerability reported by both tools has to converge on
ONE normalised record that still names both sources.

## What is versioned and visible

`severity-mapping.v1.json` sits next to this file. The version string is carried
on every normalised finding (`evidence.mapping_version`) so a report can say
which rule produced a severity. Changing the rule means adding a new file and a
new version; it never silently rewrites historical findings.

## What is deliberately NOT here

No network calls and no tool invocation. These are pure adapters over payloads
the worker already received, which is what makes them testable with fixtures and
what keeps the worker's egress policy in one place.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .active import fingerprint, normalize_url

_MAPPING_PATH = Path(__file__).with_name("severity-mapping.v1.json")

_CANONICAL_PATTERNS = [
    (re.compile(r"sql", re.IGNORECASE), "sqli"),
    (re.compile(r"cross[- ]site scripting|\bxss\b", re.IGNORECASE), "xss"),
    (re.compile(r"open redirect", re.IGNORECASE), "open_redirect"),
    (re.compile(r"\bcors\b", re.IGNORECASE), "cors"),
    (re.compile(r"directory (listing|browsing)", re.IGNORECASE), "directory_listing"),
    (re.compile(r"missing .*header|security header", re.IGNORECASE), "security_headers"),
    (re.compile(r"cookie", re.IGNORECASE), "cookies"),
]


def load_mapping() -> Dict[str, Any]:
    with _MAPPING_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def mapping_version() -> str:
    return str(load_mapping()["version"])


def map_severity(tool: str, raw_severity: Any) -> str:
    """Maps a tool's own severity onto the catalog, deterministically.

    An unknown tool, an unknown value or a missing value resolves to
    `unclassified`. It never guesses: `unclassified` is the honest answer and the
    traffic light treats it as yellow, not green.
    """
    mapping = load_mapping()
    tool_map = mapping.get("tools", {}).get(tool, {})
    key = str(raw_severity if raw_severity is not None else "").strip().lower()
    return str(tool_map.get(key, "unclassified"))


def canonical_check(identifier: str, title: str) -> str:
    """Collapses a tool-specific name onto a stable, tool-independent check.

    This is what makes CA-16 possible: Nuclei's `sql-injection` template and a ZAP
    alert titled "SQL Injection" both become `sqli`, so their fingerprints are
    equal and the two records merge instead of producing two rows.
    """
    haystack = f"{identifier} {title}"
    for pattern, check in _CANONICAL_PATTERNS:
        if pattern.search(haystack):
            return check
    slug = re.sub(r"[^a-z0-9]+", "_", haystack.strip().lower()).strip("_")
    return slug or "external"


def _base_finding(
    *,
    domain_id: str,
    tool: str,
    identifier: str,
    title: str,
    description: str,
    affected_url: str,
    severity: str,
    evidence: Dict[str, Any],
    raw: Any,
) -> Dict[str, Any]:
    check = canonical_check(identifier, title)
    evidence = dict(evidence)
    evidence.setdefault("mapping_version", mapping_version())
    evidence.setdefault("sources", [])
    evidence["sources"].append(
        {"tool": tool, "identifier": identifier, "reported_severity": severity}
    )
    return {
        "key": fingerprint(domain_id, check, affected_url),
        "check": check,
        "title": title,
        "description": description,
        "affected_url": affected_url,
        "severity": severity,
        "evidence": evidence,
        "raw": raw,
    }


def normalize_nuclei(records: Iterable[Dict[str, Any]], domain_id: str) -> List[Dict[str, Any]]:
    """Adapts Nuclei JSONL records (one dict per line already parsed)."""
    findings: List[Dict[str, Any]] = []
    for record in records:
        info = record.get("info") or {}
        template_id = str(record.get("template-id") or record.get("templateID") or "unknown")
        title = str(info.get("name") or template_id)
        severity = map_severity("nuclei", info.get("severity"))
        affected = str(record.get("matched-at") or record.get("host") or "")
        description = str(info.get("description") or title)
        evidence = {
            "tool": "nuclei",
            "template_id": template_id,
            "matcher": record.get("matcher-name"),
            "extracted": record.get("extracted-results"),
            "tags": info.get("tags"),
        }
        findings.append(
            _base_finding(
                domain_id=domain_id,
                tool="nuclei",
                identifier=template_id,
                title=title,
                description=description,
                affected_url=affected,
                severity=severity,
                evidence=evidence,
                raw=record,
            )
        )
    return findings


def normalize_zap(report: Dict[str, Any], domain_id: str) -> List[Dict[str, Any]]:
    """Adapts an OWASP ZAP JSON report (`site[].alerts[]`)."""
    findings: List[Dict[str, Any]] = []
    for site in report.get("site", []) or []:
        for alert in site.get("alerts", []) or []:
            instances = alert.get("instances") or []
            if not instances:
                instances = [{"uri": site.get("@name", "")}]
            findings.extend(_zap_alert_findings(alert, instances, domain_id))
    return findings


def normalize_zap_alerts(alerts: Iterable[Dict[str, Any]], domain_id: str) -> List[Dict[str, Any]]:
    """Adapts the ZAP core API shape (`/JSON/core/view/alerts/`).

    That endpoint returns one flat alert per affected URL rather than a report
    grouped by site, so each alert is its own instance.
    """
    findings: List[Dict[str, Any]] = []
    for alert in alerts:
        instance = {
            "uri": alert.get("url") or alert.get("uri") or "",
            "param": alert.get("param"),
            "attack": alert.get("attack"),
            "evidence": alert.get("evidence"),
        }
        findings.extend(_zap_alert_findings(alert, [instance], domain_id))
    return findings


def _zap_alert_findings(
    alert: Dict[str, Any], instances: Iterable[Dict[str, Any]], domain_id: str
) -> List[Dict[str, Any]]:
    identifier = str(alert.get("pluginid") or alert.get("alertRef") or "unknown")
    title = str(alert.get("name") or alert.get("alert") or identifier)
    severity = map_severity("zap", alert.get("riskcode"))
    description = str(alert.get("desc") or title)
    results: List[Dict[str, Any]] = []
    for instance in instances:
        affected = str(instance.get("uri") or "")
        evidence = {
            "tool": "zap",
            "plugin_id": identifier,
            "risk_desc": alert.get("riskdesc"),
            "confidence": alert.get("confidence"),
            "param": instance.get("param"),
            "attack": instance.get("attack"),
            "evidence": instance.get("evidence"),
        }
        results.append(
            _base_finding(
                domain_id=domain_id,
                tool="zap",
                identifier=identifier,
                title=title,
                description=description,
                affected_url=affected,
                severity=severity,
                evidence=evidence,
                raw=alert,
            )
        )
    return results


def dedupe_findings(findings: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merges records that describe the same vulnerability at the same endpoint.

    The identity is `(canonical check, normalised URL)`, which is exactly the
    fingerprint's own identity. When two tools agree, the merged record keeps the
    highest severity observed, unions the source list and preserves every raw
    payload under `raw.sources`, so the origin tool survives as evidence
    (CA-16) instead of being overwritten.
    """
    order: List[str] = []
    merged: Dict[str, Dict[str, Any]] = {}
    severity_rank = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1, "unclassified": 0}

    for finding in findings:
        identity = f"{finding['check']}|{normalize_url(finding['affected_url'])}"
        existing = merged.get(identity)
        if existing is None:
            record = dict(finding)
            record["evidence"] = dict(finding.get("evidence") or {})
            record["raw"] = {"sources": [finding.get("raw")]}
            merged[identity] = record
            order.append(identity)
            continue

        sources = existing["evidence"].setdefault("sources", [])
        sources.extend(finding.get("evidence", {}).get("sources", []))
        existing["raw"]["sources"].append(finding.get("raw"))
        if severity_rank.get(finding.get("severity"), 0) > severity_rank.get(
            existing.get("severity"), 0
        ):
            existing["severity"] = finding["severity"]

    return [merged[identity] for identity in order]
