"""Current competency levels and skill gaps.

A level is 0-5. Assessed levels come from the mastery engine (mastery 0-1 -> x5); until an official has been
assessed on a competency, a conservative estimate is read from their profile (qualifications, trainings,
current assignment, experience). Estimates never exceed 3: only assessment can show expertise.
"""

from dataclasses import dataclass

from app.competency.framework import BY_ID, COMPETENCIES, Competency, Role

MAX_ESTIMATE = 3.0


@dataclass
class ProfileText:
    qualifications: list[str]
    past_trainings: list[str]
    current_assignment: str
    experience_years: int


def _hits(comp: Competency, text: str) -> bool:
    t = f" {text.lower()} "
    return any(k in t for k in comp.keywords)


def estimate_level(comp: Competency, p: ProfileText) -> float:
    level = 0.0
    if any(_hits(comp, q) for q in p.qualifications):
        level += 1.5
    level += min(2, sum(_hits(comp, t) for t in p.past_trainings)) * 1.0
    if _hits(comp, p.current_assignment):
        level += 1.0
    if level > 0:
        level += min(1.0, p.experience_years / 8)
    elif comp.domain == "behavioural":
        level += min(1.5, p.experience_years / 8)  # behavioural skills grow with service even without training
    return round(min(MAX_ESTIMATE, level) * 2) / 2


def mastery_to_level(mastery: float) -> float:
    return round(max(0.0, min(1.0, mastery)) * 5, 1)


@dataclass
class CompetencyLevel:
    id: str
    name: str
    domain: str
    required: int
    current: float
    source: str  # "assessed" | "profile"
    gap: float


def build_levels(role: Role | None, profile: ProfileText, assessed: dict[str, float]) -> list[CompetencyLevel]:
    """All competencies with current level and gap against the role's requirement."""
    out = []
    for c in COMPETENCIES:
        required = role.requirements.get(c.id, 0) if role else 0
        if c.id in assessed:
            current, source = mastery_to_level(assessed[c.id]), "assessed"
        else:
            current, source = estimate_level(c, profile), "profile"
        out.append(CompetencyLevel(c.id, c.name, c.domain, required, current, source, round(max(0.0, required - current), 1)))
    return out


def ranked_gaps(levels: list[CompetencyLevel]) -> list[CompetencyLevel]:
    """Open gaps, biggest first; a competency whose prerequisite also has a gap waits behind it."""
    gaps = {lv.id: lv for lv in levels if lv.gap > 0}

    def blocked(cid: str) -> int:
        return sum(1 for p in BY_ID[cid].prerequisites if p in gaps)

    return sorted(gaps.values(), key=lambda lv: (blocked(lv.id), -lv.gap, -lv.required, lv.name))


def comp_skill_id(cid: str) -> str:
    """Key under which the mastery engine tracks a competency."""
    return f"comp:{cid}"
