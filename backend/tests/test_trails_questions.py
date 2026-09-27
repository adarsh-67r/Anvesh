import random
from datetime import datetime, timedelta

from app.trails.questions import order_for_user, question_id


def test_question_id_depends_on_topic():
    assert question_id("a", "What is BFS?") != question_id("b", "What is BFS?")
    assert question_id("a", "What is BFS?") == question_id("a", "What is BFS?")


def test_unseen_first_then_least_recent():
    now = datetime(2026, 9, 27)
    seen = {"q1": now - timedelta(days=1), "q2": now - timedelta(days=5)}
    order = order_for_user(["q1", "q2", "q3", "q4"], seen, 4, random.Random(0))
    assert set(order[:2]) == {"q3", "q4"}
    assert order[2:] == ["q2", "q1"]


def test_order_limits_to_n():
    assert len(order_for_user([f"q{i}" for i in range(20)], {}, 5, random.Random(1))) == 5


def test_seen_query_groups_by_the_selected_expression():
    from sqlalchemy.dialects import postgresql

    from app.trails.questions import seen_query

    sql = str(seen_query("u", "s").compile(dialect=postgresql.dialect()))
    assert "GROUP BY qid" in sql


def test_lesson_check_falls_back_to_topic_questions(monkeypatch):
    """A lesson no concept maps to (an intro) still gets a check, from the topic's bank."""
    import asyncio
    from types import SimpleNamespace

    from app.trails import questions

    topic_q = SimpleNamespace(id="q1")
    results = iter([[], [topic_q], []])  # lesson bank, topic bank, seen

    class Db:
        async def execute(self, _):
            rows = next(results)
            return SimpleNamespace(scalars=lambda: rows, all=lambda: rows)

    monkeypatch.setattr(questions, "spawn", lambda coro: coro.close())
    picked = asyncio.run(questions.pick_questions(Db(), "u", "t", 3, lesson_id="lesson-1"))
    assert picked == [topic_q]
