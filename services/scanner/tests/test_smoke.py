"""Skeleton smoke test for the scan worker.

Proves that ``pytest`` is configured against this service (task 1.2) and that the
``scanner`` package imports cleanly from the source tree. The SSRF, egress,
check-contract and callback tests arrive with their implementations in the
Sprint 2 worker tasks; this file is the runner's proof of life.
"""

from scanner import __version__


def test_scanner_package_is_importable() -> None:
    assert isinstance(__version__, str)
    assert __version__ == "0.1.0"
