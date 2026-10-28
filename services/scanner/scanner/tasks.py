from __future__ import annotations

import asyncio
import base64
import importlib
import logging
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from celery import Celery

from . import ssrf
from .egress import HardenedClient
from .report import CallbackClient

app = Celery("scanner")

app.conf.update(
    broker_url=os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    result_backend=None,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_ignore_result=True,
    worker_prefetch_multiplier=1,
)

logger = logging.getLogger(__name__)

DEFAULT_CHECKS = [
    "security_headers",
    "tls",
    "cookies",
    "redirects",
    "xss",
    "sqli",
    "open_redirect",
    "cors",
    "directory_listing",
    "sensitive_files",
]

CANCEL_KEY = "vuldetected:scan:cancel:{scan_id}"


class ScanCancelled(Exception):
    """Raised by the per-request hook when the user cancelled the scan."""


class ScanBudgetExceeded(Exception):
    """Raised when a scan exceeds its request budget."""


@dataclass
class ScanContext:
    scan_id: str
    domain_id: str
    task_id: str
    target: Dict[str, Any]
    client: HardenedClient
    callback: CallbackClient
    seq: int = 0

    def next_seq(self) -> int:
        self.seq += 1
        return self.seq


def _auth_headers(credentials: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """Turns a decrypted credential into request headers.

    The web app decrypts the stored secret at enqueue time and sends it in the
    job payload as plain fields; the worker never sees the encryption key.
    """
    if not credentials:
        return {}

    kind = str(credentials.get("kind", "")).lower()
    if kind == "basic":
        username = str(credentials.get("username", ""))
        password = str(credentials.get("password", ""))
        token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        return {"Authorization": f"Basic {token}"}
    if kind == "bearer":
        return {"Authorization": f"Bearer {credentials.get('token', '')}"}
    if kind == "header":
        name = str(credentials.get("headerName", "X-Api-Key"))
        value = str(credentials.get("headerValue", ""))
        # Refuse header injection: a newline in either side would split the
        # request. The web app validates too, but the worker must not trust it.
        if "\r" in name or "\n" in name or "\r" in value or "\n" in value:
            return {}
        return {name: value}
    return {}


def _make_cancel_check(scan_id: str) -> Callable[[], bool]:
    """Returns a function that answers "did the user cancel this scan?".

    Best effort by design: if Redis is unreachable the scan continues. A scan
    that keeps running is better than a scan that fails because the cancellation
    channel is down, and the user can still cancel from the UI (the web app owns
    the DB status either way).
    """
    client = None
    try:
        import redis

        client = redis.Redis.from_url(
            os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0"),
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
    except Exception:
        client = None

    key = CANCEL_KEY.format(scan_id=scan_id)

    def cancelled() -> bool:
        if client is None:
            return False
        try:
            return bool(client.exists(key))
        except Exception:
            return False

    return cancelled


def _make_request_hook(scan_id: str) -> Callable[[], None]:
    """Rate limit + cancellation + request budget, applied to every request."""
    interval = float(os.environ.get("SCANNER_REQUEST_INTERVAL_MS", "250")) / 1000.0
    max_requests = int(os.environ.get("SCANNER_MAX_REQUESTS", "250"))
    cancelled = _make_cancel_check(scan_id)
    state = {"last": 0.0, "count": 0}

    def before_request() -> None:
        if cancelled():
            raise ScanCancelled("cancelled_by_user")

        state["count"] += 1
        if state["count"] > max_requests:
            raise ScanBudgetExceeded(f"more than {max_requests} requests")

        wait = interval - (time.monotonic() - state["last"])
        if wait > 0:
            time.sleep(wait)
        state["last"] = time.monotonic()

    return before_request


@app.task(name="scanner.tasks.run_scan")
def run_scan(
    scan_id: str,
    domain_id: str,
    target: Dict[str, Any],
    checks: Optional[List[str]] = None,
    callback_base_url: str = "",
    credentials: Optional[Dict[str, Any]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    async def _run() -> Dict[str, Any]:
        cb_url = callback_base_url or os.environ.get(
            "SCANNER_CALLBACK_BASE_URL", "http://localhost:3000"
        )
        client = HardenedClient(
            default_headers=_auth_headers(credentials),
            on_request=_make_request_hook(scan_id),
        )
        cb = CallbackClient(cb_url)
        task_id = run_scan.request.id or str(uuid.uuid4())
        ctx = ScanContext(
            scan_id=scan_id,
            domain_id=domain_id,
            task_id=task_id,
            target=target,
            client=client,
            callback=cb,
        )

        checks_list = checks or DEFAULT_CHECKS

        try:
            # SW-1: revalidate the target in the worker. A queued job can be old;
            # DNS can have changed since the web app accepted the URL.
            ssrf.resolve_url(target["base_url"])
        except Exception as e:
            cb.send_callback(
                scan_id, task_id, "failed", checks_run=[], error=f"ssrf_rejected: {e}"
            )
            client.close()
            return {"status": "failed"}

        try:
            cb.send_event(scan_id, ctx.next_seq(), "scan.started", {"timestamp": ""})
        except Exception:
            pass

        all_findings: List[Dict[str, Any]] = []
        checks_run: List[str] = []

        for check_name in checks_list:
            try:
                cb.send_event(scan_id, ctx.next_seq(), "check.started", {"check": check_name})
                module = importlib.import_module(f"scanner.checks.{check_name}")
                result = await module.run(ctx)
                if result:
                    all_findings.extend(result)
                checks_run.append(check_name)
                cb.send_event(scan_id, ctx.next_seq(), "check.completed", {"check": check_name})
            except ScanCancelled:
                _best_effort_event(cb, scan_id, ctx, "scan.cancelled", {"reason": "user"})
                cb.send_callback(
                    scan_id,
                    task_id,
                    "cancelled",
                    findings=all_findings,
                    checks_run=checks_run,
                    error="cancelled_by_user",
                )
                client.close()
                return {"status": "cancelled"}
            except ScanBudgetExceeded as e:
                cb.send_callback(
                    scan_id,
                    task_id,
                    "failed",
                    findings=all_findings,
                    checks_run=checks_run,
                    error=f"scan_budget_exceeded: {e}",
                )
                client.close()
                return {"status": "failed"}
            except Exception as e:
                _best_effort_event(cb, scan_id, ctx, "scan.failed", {"error": str(e)})
                cb.send_callback(
                    scan_id,
                    task_id,
                    "failed",
                    findings=all_findings,
                    checks_run=checks_run,
                    error=str(e),
                )
                client.close()
                return {"status": "failed"}

        _best_effort_event(cb, scan_id, ctx, "scan.completed", {})
        cb.send_callback(
            scan_id,
            task_id,
            "completed",
            findings=all_findings,
            checks_run=checks_run,
        )
        client.close()
        return {"status": "completed", "findings": len(all_findings)}

    return asyncio.run(_run())


def _best_effort_event(
    callback: CallbackClient, scan_id: str, ctx: ScanContext, event_type: str, payload: Dict[str, Any]
) -> None:
    try:
        callback.send_event(scan_id, ctx.next_seq(), event_type, payload)
    except Exception:
        pass
