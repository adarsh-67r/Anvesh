from types import SimpleNamespace as NS

from app.recommendation.orchestrator import skill_status
from app.trails.groups import expand_mastered, groups_of, pick_per_group
from app.trails.scope import resolve_topics


def row(sid, prereqs=(), override=None, equiv=(), pos=0, trail="t1", ref="p"):
    return (
        NS(id=sid, label=sid.upper(), subject="general", prerequisites=list(prereqs), summary=None, source_ref=ref),
        NS(skill_id=sid, position=pos, prerequisites_override=override, equivalent_to=list(equiv)),
        NS(id=trail, title="DSA Trail", created_at=0),
    )


def test_override_replaces_shared_prereqs():
    topics = {t.id: t for t in resolve_topics([row("a"), row("b", ["a"]), row("c", ["a"], override=["b"])])}
    assert topics["c"].prerequisites == ["b"]
    assert topics["c"].depth == 2


def test_prereqs_outside_trails_are_dropped():
    topics = {t.id: t for t in resolve_topics([row("b", ["deleted-source-topic"])])}
    assert topics["b"].prerequisites == []
    assert skill_status(topics["b"], set()) == "available"


def test_topics_ordered_by_position():
    assert [t.id for t in resolve_topics([row("x", pos=2), row("y", pos=0), row("z", pos=1)])] == ["y", "z", "x"]


def test_groups_are_transitive_and_symmetric():
    g = groups_of({"a": ["b"], "b": ["c"], "d": []})
    assert g["a"] == g["c"] == frozenset({"a", "b", "c"})
    assert g["d"] == frozenset({"d"})


def test_mastering_one_covers_its_group():
    g = groups_of({"luv-bs": ["striver-bs"]})
    eff = expand_mastered({"striver-bs"}, g)
    t = NS(id="luv-bs", prerequisites=[])
    assert skill_status(t, {"striver-bs"}, eff) == "covered"


def test_prereq_satisfied_by_equivalent():
    g = groups_of({"luv-bs": ["striver-bs"]})
    eff = expand_mastered({"luv-bs"}, g)
    assert skill_status(NS(id="striver-graphs", prerequisites=["striver-bs"]), {"luv-bs"}, eff) == "available"


def test_one_recommendation_per_group():
    g = groups_of({"a": ["b"]})
    assert pick_per_group(["b", "c", "a"], g) == ["b", "c"]


def test_equivalents_outside_scope_ignored():
    topics = resolve_topics([row("a", equiv=["gone"])])
    assert topics[0].equivalent_to == []
