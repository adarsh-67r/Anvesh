import pytest

from app.trails.plan import Item, chunk_plan, validate_plan

ITEMS = [Item(f"v{i}", f"Lecture {i}", 600) for i in range(10)]


def test_valid_plan_keeps_order_and_prereqs():
    raw = [
        {"title": "Basics", "summary": "s", "items": [0, 1, 2], "prerequisites": []},
        {"title": "Arrays", "items": [3, 4, 5, 6], "prerequisites": [0]},
        {"title": "Search", "items": [7, 8, 9], "prerequisites": [1]},
    ]
    plan = validate_plan(raw, 10, set())
    assert [t.title for t in plan] == ["Basics", "Arrays", "Search"]
    assert plan[2].prerequisites == [1]


def test_orphans_join_nearest_previous_topic():
    raw = [{"title": "A", "items": [0, 1]}, {"title": "B", "items": [5, 6, 7, 8, 9]}]
    plan = validate_plan(raw, 10, set())
    assert plan[0].items == [0, 1, 2, 3, 4]
    assert sorted(i for t in plan for i in t.items) == list(range(10))


def test_duplicate_items_go_to_first_claimant():
    raw = [{"title": "A", "items": [0, 1, 2, 3, 4]}, {"title": "B", "items": [4, 5, 6, 7, 8, 9]}]
    plan = validate_plan(raw, 10, set())
    assert 4 in plan[0].items and 4 not in plan[1].items


def test_forward_and_cyclic_prereqs_dropped():
    raw = [
        {"title": "A", "items": [0, 1, 2, 3, 4], "prerequisites": [1]},
        {"title": "B", "items": [5, 6, 7, 8, 9], "prerequisites": [0, 1]},
    ]
    plan = validate_plan(raw, 10, set())
    assert plan[0].prerequisites == []
    assert plan[1].prerequisites == [0]


def test_prereq_indices_follow_skipped_topics():
    raw = [
        {"title": "", "items": [0]},                       # dropped: no title
        {"title": "A", "items": [0, 1, 2, 3, 4]},
        {"title": "B", "items": [5, 6, 7, 8, 9], "prerequisites": [1]},
    ]
    plan = validate_plan(raw, 10, set())
    assert [t.title for t in plan] == ["A", "B"]
    assert plan[1].prerequisites == [0]


def test_topics_reordered_by_first_item():
    raw = [{"title": "Late", "items": [5, 6, 7, 8, 9]}, {"title": "Early", "items": [0, 1, 2, 3, 4], "prerequisites": []}]
    plan = validate_plan(raw, 10, set())
    assert [t.title for t in plan] == ["Early", "Late"]


def test_existing_links_filtered_to_known_ids():
    raw = [{"title": "A", "items": list(range(10)), "same_as": ["x:v1:0", "ghost"], "needs_existing": ["x:v1:1"]}]
    plan = validate_plan(raw, 10, {"x:v1:0", "x:v1:1"})
    assert plan[0].same_as == ["x:v1:0"] and plan[0].needs_existing == ["x:v1:1"]


@pytest.mark.parametrize("raw", [None, [], "text", [{"title": "A", "items": []}], [{"items": [0]}]])
def test_unusable_plan_raises(raw):
    with pytest.raises(ValueError):
        validate_plan(raw, 10, set())


def test_chunk_plan_covers_everything_in_order():
    plan = chunk_plan(ITEMS)
    assert [t.items for t in plan] == [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9]]
    assert plan[1].prerequisites == [0] and plan[0].title == "Lecture 0"
