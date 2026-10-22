from __future__ import annotations

import os

from celery import Celery

app = Celery('scanner')

app.conf.update(
    broker_url=os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    result_backend=None,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_ignore_result=True,
    worker_prefetch_multiplier=1,
    # The worker process is started as `celery -A scanner`, which resolves this
    # module; the task itself lives in `scanner.tasks`. Without the include the
    # worker boots with an empty registry and silently consumes nothing.
    include=['scanner.tasks'],
)

