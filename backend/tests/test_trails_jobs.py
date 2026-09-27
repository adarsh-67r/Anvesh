import asyncio
from datetime import datetime, timedelta

from app.trails.grounding import DAILY_WATCH_LIMIT, can_watch, topic_method
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


def test_budget_guard():
    assert can_watch(0, 3600)
    assert can_watch(DAILY_WATCH_LIMIT - 600, 600)
    assert not can_watch(DAILY_WATCH_LIMIT - 599, 600)


def test_topic_method():
    assert topic_method(["titles", "titles"]) == "titles"
    assert topic_method(["captions", "titles", "gemini", "captions"]) == "captions"
    assert topic_method(["gemini"]) == "gemini"
