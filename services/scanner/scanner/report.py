from __future__ import annotations

import os
from typing import Any, Dict, List

import httpx

# How long the worker waits for the app to accept one progress event.
#
# ## Why this is not a short timeout
#
# An event post is a progress report, not the result: the app answers it with a
# single insert and a Redis publish. Ten seconds is generous for that in
# production, but the app is also the only process that can be busy compiling,
# migrating or garbage collecting, and the worker has no way to tell "slow" from
# "dead".
#
# A measured failure showed the cost of guessing wrong: the dev app answered a
# `check.started` post in 14 s under load, `httpx` raised `ReadTimeout`, the
# generic handler stored `error='timed out'`, and a scan that had already
# authenticated correctly and collected findings was reported to the user as
# failed. The event was eventually delivered — the worker had already given up.
#
# Thirty seconds matches `send_callback`, which talks to the same host with the
# same secret, and it keeps the guarantee that matters: a genuinely unreachable
# app still fails the scan, because the *result* callback cannot be delivered
# either.
EVENT_TIMEOUT_SECONDS = 30.0


class CallbackError(Exception):
    pass


class CallbackClient:
    def __init__(self, callback_base_url: str) -> None:
        self.callback_base_url = callback_base_url.rstrip("/")
        self.secret = os.environ.get("SCANNER_CALLBACK_SECRET", "")

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.secret}",
            "Content-Type": "application/json",
        }

    def send_event(
        self,
        scan_id: str,
        seq: int,
        event_type: str,
        payload: Dict[str, Any] | None = None,
    ) -> None:
        url = f"{self.callback_base_url}/api/scans/{scan_id}/events"
        body = {"seq": seq, "type": event_type, "payload": payload or {}}
        resp = httpx.post(url, headers=self._headers(), json=body, timeout=EVENT_TIMEOUT_SECONDS)
        if resp.status_code >= 500:
            raise CallbackError(f"callback failed: {resp.status_code}")

    def send_callback(
        self,
        scan_id: str,
        task_id: str,
        status: str,
        findings: List[Dict[str, Any]] | None = None,
        events: List[Dict[str, Any]] | None = None,
        error: str | None = None,
        checks_run: List[str] | None = None,
    ) -> Dict[str, Any]:
        url = f"{self.callback_base_url}/api/scans/{scan_id}/callback"
        body = {
            "scan_id": scan_id,
            "task_id": task_id,
            "status": status,
            "error": error,
            "checks_run": checks_run or [],
            "events": events or [],
            "findings": findings or [],
        }
        resp = httpx.post(url, headers=self._headers(), json=body, timeout=30)
        if resp.status_code >= 500:
            raise CallbackError(f"callback failed: {resp.status_code}")
        try:
            return resp.json()
        except Exception:
            return {"ok": resp.status_code < 400}
