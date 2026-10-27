from __future__ import annotations

import json
import os
from typing import Any, Dict, List

import httpx


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

    def send_event(self, scan_id: str, seq: int, event_type: str, payload: Dict[str, Any] | None = None) -> None:
        url = f"{self.callback_base_url}/api/scans/{scan_id}/events"
        body = {"seq": seq, "type": event_type, "payload": payload or {}}
        resp = httpx.post(url, headers=self._headers(), json=body, timeout=10)
        if resp.status_code >= 500:
            raise CallbackError(f"callback failed: {resp.status_code}")
        # 4xx other than maybe acceptable? design says retry on 5xx; treat others as best effort? but follow contract

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
