from __future__ import annotations

from celery import Celery

app = Celery('scanner')

app.conf.update(
    broker_url='redis://localhost:6379/0',
    result_backend=None,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_ignore_result=True,
    worker_prefetch_multiplier=1,
)

