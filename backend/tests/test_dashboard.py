from types import SimpleNamespace

from app.competency.levels import CompetencyLevel
from app.dashboard.router import projected, readiness


def lv(cid, required, current):
    return CompetencyLevel(cid, cid, "technical", required, current, "profile", max(0, required - current))


def test_readiness_caps_each_competency_at_its_requirement():
    assert readiness([lv("a", 4, 2), lv("b", 2, 5)]) == round(100 * (2 + 2) / 6)
    assert readiness([lv("a", 0, 3)]) == 0  # nothing required


def test_projection_lifts_enrolled_competencies_to_course_level():
    levels = [lv("python", 3, 1), lv("sql", 3, 1)]
    after = {x.id: x for x in projected(levels, [SimpleNamespace(competencies=["python"], level=3)])}
    assert after["python"].current == 3 and after["python"].gap == 0
    assert after["sql"].current == 1
