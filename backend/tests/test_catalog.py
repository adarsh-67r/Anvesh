from types import SimpleNamespace

from app.catalog.connectors import IGOT_COURSES, NSSTA_COURSES
from app.catalog.recommend import rank_courses
from app.competency.framework import COMPETENCIES
from app.competency.levels import CompetencyLevel


def lv(cid, required, current):
    return CompetencyLevel(cid, cid, "x", required, current, "profile", max(0, required - current))


def course(cid, level, comps, source="nssta"):
    return SimpleNamespace(id=cid, level=level, competencies=comps, source=source)


def test_catalogue_covers_every_competency():
    taught = {c for r in NSSTA_COURSES + IGOT_COURSES for c in r.competencies}
    assert taught == {c.id for c in COMPETENCIES}


def test_ranking_prefers_bigger_gaps_and_skips_met_or_done():
    levels = [lv("python", 3, 0), lv("sql", 2, 1.5), lv("ethics", 2, 2)]
    courses = [course("py", 3, ["python"]), course("sql", 3, ["sql"]), course("eth", 3, ["ethics"]), course("done", 3, ["python"])]
    order = [p.course_id for p in rank_courses(courses, levels, done={"done"})]
    assert order == ["py", "sql"]  # ethics already met, "done" completed


def test_course_below_current_level_is_not_recommended():
    assert rank_courses([course("intro", 2, ["python"])], [lv("python", 4, 2.5)], set()) == []


def test_foundations_first():
    levels = [lv("survey_design", 3, 0), lv("sampling", 3, 0)]  # sampling depends on survey design
    picks = rank_courses([course("samp", 3, ["sampling"]), course("survey", 3, ["survey_design"])], levels, set())
    assert [p.course_id for p in picks] == ["survey", "samp"]
    assert picks[0].reasons == ["survey_design: 0 → 3 of 3"]
