from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List

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


@app.task(name="scanner.tasks.run_scan")
def run_scan(
    scan_id: str,
    domain_id: str,
    target: Dict[str, Any],
    checks: List[str] | None = None,
    callback_base_url: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    async def _run() -> Dict[str, Any]:
        cb_url = callback_base_url or os.environ.get("SCANNER_CALLBACK_BASE_URL", "http://localhost:3000")
        client = HardenedClient()
        cb = CallbackClient(cb_url)
        task_id = run_scan.request.id or str(uuid.uuid4())
        ctx = ScanContext(scan_id=scan_id, domain_id=domain_id, task_id=task_id, target=target, client=client, callback=cb)

        try:
            # SW-1: revalidate target
            ssrf.resolve_url(target["base_url"])
        except Exception as e:
            ctx.callback.send_callback(scan_id, task_id, "failed", error=f"ssrf_rejected: {e}")
            client.close()
            return {"status": "failed"}

        # scan.started
        try:
            ctx.callback.send_event(scan_id, ctx.next_seq(), "scan.started", {"timestamp": ""})
        except Exception:
            pass

        checks_list = checks or ["security_headers", "tls", "cookies", "redirects"]
        all_findings: List[Dict[str, Any]] = []

        for check_name in checks_list:
            try:
                ctx.callback.send_event(scan_id, ctx.next_seq(), "check.started", {"check": check_name})
                module = __import__(f"scanner.checks.{check_name}", fromlist=[""])
                res = asyncio.get_event_loop().run_until_complete(module.run(ctx))
                if res:
                    all_findings.extend(res)
                ctx.callback.send_event(scan_id, ctx.next_seq(), "check.completed", {"check": check_name})
            except Exception as e:
                ctx.callback.send_event(scan_id, ctx.next_seq(), "scan.failed", {"error": str(e)})
                ctx.callback.send_callback(scan_id, task_id, "failed", findings=all_findings, error=str(e))
                client.close()
                return {"status": "failed"}

        ctx.callback.send_event(scan_id, ctx.next_seq(), "scan.completed", {})
        ctx.callback.send_callback(scan_id, task_id, "completed", findings=all_findings, events=[])
        client.close()
        return {"status": "completed", "findings": len(all_findings)}

    return asyncio.get_event_loop().run_until_complete(_run())
