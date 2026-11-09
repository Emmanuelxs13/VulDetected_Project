"""Normalisation contract for external scanner output (HU-14).

Test names carry the acceptance-criteria id so a reader can map evidence back to
the specification without opening the report:

* `test_ca14_*` — deterministic, versioned severity mapping.
* `test_ca16_*` — cross-tool deduplication preserving the source tool.
"""

from __future__ import annotations

import json
from pathlib import Path

from scanner.normalize import (
    canonical_check,
    dedupe_findings,
    load_mapping,
    map_severity,
    mapping_version,
    normalize_nuclei,
    normalize_zap,
    normalize_zap_alerts,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _nuclei_fixture():
    with (FIXTURES / "nuclei.jsonl").open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _zap_fixture():
    with (FIXTURES / "zap-report.json").open(encoding="utf-8") as handle:
        return json.load(handle)


# --- CA-14 -----------------------------------------------------------------


def test_ca14_mapping_is_versioned_and_visible() -> None:
    mapping = load_mapping()
    assert mapping["version"] == "1.0"
    assert mapping_version() == "1.0"
    # Every mapping target is a member of the catalog; no rule can emit a value
    # the rest of the product does not understand.
    for tool, rules in mapping["tools"].items():
        for source, target in rules.items():
            assert target in mapping["catalog"], f"{tool}:{source} -> {target}"


def test_ca14_nuclei_severity_maps_to_catalog() -> None:
    assert map_severity("nuclei", "critical") == "critical"
    assert map_severity("nuclei", "HIGH") == "high"
    assert map_severity("nuclei", "medium") == "medium"
    assert map_severity("nuclei", "low") == "low"
    assert map_severity("nuclei", "info") == "info"


def test_ca14_unknown_severity_is_unclassified_not_guessed() -> None:
    assert map_severity("nuclei", "unknown") == "unclassified"
    assert map_severity("nuclei", None) == "unclassified"
    assert map_severity("zap", "999") == "unclassified"
    assert map_severity("not-a-tool", "high") == "unclassified"


def test_ca14_zap_riskcode_maps_to_catalog() -> None:
    assert map_severity("zap", "3") == "high"
    assert map_severity("zap", "2") == "medium"
    assert map_severity("zap", "1") == "low"
    assert map_severity("zap", "0") == "info"


def test_ca14_nuclei_record_resolves_to_exactly_one_severity() -> None:
    findings = normalize_nuclei(_nuclei_fixture(), domain_id="domain-1")
    assert findings, "fixture must produce findings"
    for finding in findings:
        assert finding["severity"] in load_mapping()["catalog"]
        assert finding["evidence"]["mapping_version"] == "1.0"


# --- CA-16 -----------------------------------------------------------------


def test_ca16_two_tools_converge_on_one_record_with_both_sources() -> None:
    nuclei = normalize_nuclei(_nuclei_fixture(), domain_id="domain-1")
    zap = normalize_zap(_zap_fixture(), domain_id="domain-1")
    merged = dedupe_findings(nuclei + zap)

    sql = [f for f in merged if f["check"] == "sqli"]
    assert len(sql) == 1, "the same SQL injection from two tools must be one record"

    sources = {source["tool"] for source in sql[0]["evidence"]["sources"]}
    assert sources == {"nuclei", "zap"}
    # The raw payload of both tools survives for audit.
    assert len(sql[0]["raw"]["sources"]) == 2


def test_ca16_dedupe_keeps_the_highest_severity() -> None:
    nuclei = normalize_nuclei(_nuclei_fixture(), domain_id="domain-1")
    zap = normalize_zap_alerts(
        [
            {
                "pluginid": "40018",
                "name": "SQL Injection",
                "riskcode": "2",
                "url": "http://fixture.test/item?id=1",
                "param": "id",
            }
        ],
        domain_id="domain-1",
    )
    merged = dedupe_findings(nuclei + zap)
    sql = [f for f in merged if f["check"] == "sqli"][0]
    assert sql["severity"] == "critical", "critical from Nuclei must win over medium"


def test_ca16_canonical_check_is_tool_independent() -> None:
    assert canonical_check("sql-injection", "SQL Injection") == "sqli"
    assert canonical_check("40018", "SQL Injection") == "sqli"
    assert canonical_check("xss-reflected", "Cross-site Scripting") == "xss"
