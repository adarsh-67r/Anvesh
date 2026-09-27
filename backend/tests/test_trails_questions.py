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
