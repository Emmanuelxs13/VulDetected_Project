"""VulDetected scan worker (Sprint 2).

This package is the Python side of the scan domain: a Celery consumer that pulls
``scanner.tasks.run_scan`` jobs off the Redis broker, re-validates every target
against the SSRF rules (the worker is the security boundary, TB5), runs its own
deterministic checks, and reports progress and results back to the web app over
an authenticated callback.

Sprint 2 task 1.2 lands only the skeleton so ``pytest`` has something to collect.
The Celery application, task, egress client, checks and callback reporter arrive
in task 4.4 (design D10). ``__version__`` is the one stable thing here.
"""

__version__ = "0.1.0"
