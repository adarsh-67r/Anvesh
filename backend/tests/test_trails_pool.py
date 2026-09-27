"""Slow network calls must not hold a pooled database connection."""
import asyncio
from types import SimpleNamespace

from app.trails import grounding, questions


class FakeDb:
    def __init__(self, log):
        self.log = log

    async def commit(self):
        self.log.append("commit")

    async def get(self, *a):
        self.log.append("query")

    async def execute(self, *a):
        self.log.append("query")
        return SimpleNamespace(scalars=lambda: [], scalar=lambda: 0)

    def add(self, _):
        pass


def test_question_generation_releases_connection_before_gemini(monkeypatch):
    log = []

    async def fake_generate(*a, **k):
        log.append("gemini")
        return "[]"

    monkeypatch.setattr(questions, "generate", fake_generate)
    asyncio.run(questions.generate_questions(FakeDb(log), "t", [{"concept": "c", "explanation": "e"}], 3))
    i = log.index("gemini")
    assert i > 0 and log[i - 1] == "commit"


def test_lesson_context_releases_connection_before_youtube(monkeypatch):
    log = []

    def fake_captions(_):
        log.append("youtube")
        return None

    monkeypatch.setattr(grounding.youtube, "fetch_captions", fake_captions)
    lesson = SimpleNamespace(youtube_id="y", start_sec=None, end_sec=None, duration=None, title="T")
    assert asyncio.run(grounding.lesson_context(FakeDb(log), lesson)) == ("T", "titles")
    i = log.index("youtube")
    assert i > 0 and log[i - 1] == "commit"
