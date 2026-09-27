import asyncio
from datetime import datetime, timedelta

from app.trails.jobs import is_stale, spawn


def test_is_stale():
    now = datetime(2026, 9, 27, 12, 0)
    assert is_stale(now - timedelta(minutes=6), now)
    assert not is_stale(now - timedelta(minutes=4), now)


def test_spawn_runs_and_forgets():
    async def main():
        box = []

        async def job():
            box.append(1)

        t = spawn(job())
        await t
        return box

    assert asyncio.run(main()) == [1]
