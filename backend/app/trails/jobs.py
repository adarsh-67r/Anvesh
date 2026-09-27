"""In-process background jobs. Render restarts kill them; stale rows are restarted by the next request."""

import asyncio
import logging
from datetime import datetime, timedelta

STALE_MINUTES = 5
_running: set[asyncio.Task] = set()
log = logging.getLogger("anvesh.jobs")


def spawn(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _running.add(task)

    def done(t: asyncio.Task):
        _running.discard(t)
        if not t.cancelled() and t.exception():
            log.error("background job failed", exc_info=t.exception())

    task.add_done_callback(done)
    return task


def is_stale(updated_at: datetime, now: datetime, minutes: int = STALE_MINUTES) -> bool:
    return now - updated_at > timedelta(minutes=minutes)
