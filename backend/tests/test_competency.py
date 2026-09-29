from app.competency.framework import BY_ID, COMPETENCIES, DOMAINS, ROLE_BY_ID, ROLES
from app.competency.levels import MAX_ESTIMATE, ProfileText, build_levels, estimate_level, ranked_gaps


def profile(**kw):
    base = dict(qualifications=[], past_trainings=[], current_assignment="", experience_years=0)
    base.update(kw)
    return ProfileText(**base)


def test_framework_matches_problem_statement():
    assert len(COMPETENCIES) == 33
    assert {c.domain for c in COMPETENCIES} == set(DOMAINS)
    for c in COMPETENCIES:
        assert all(p in BY_ID for p in c.prerequisites), c.id
    for r in ROLES:
        assert all(1 <= v <= 5 for v in r.requirements.values()), r.id


def test_estimate_reads_profile_but_is_capped():
    p = profile(qualifications=["M.Sc. Statistics with sampling theory"],
                past_trainings=["Sampling methods (NSSTA)", "Advanced sample surveys"],
                current_assignment="Sampling unit, NSO", experience_years=12)
    assert estimate_level(BY_ID["sampling"], p) == MAX_ESTIMATE
    assert estimate_level(BY_ID["gis"], p) == 0


def test_behavioural_grows_with_service():
    assert estimate_level(BY_ID["leadership"], profile(experience_years=8)) == 1.0
    assert estimate_level(BY_ID["python"], profile(experience_years=8)) == 0


def test_assessed_level_overrides_estimate_and_gaps_rank_prerequisites_first():
    role = ROLE_BY_ID["iss_jts"]
    levels = build_levels(role, profile(), {"python": 0.8})
    by = {lv.id: lv for lv in levels}
    assert by["python"].source == "assessed" and by["python"].current == 4.0 and by["python"].gap == 0
    order = [lv.id for lv in ranked_gaps(levels)]
    assert order.index("survey_design") < order.index("sampling")  # sampling depends on survey design
