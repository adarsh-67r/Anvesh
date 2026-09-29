"""Rank courses for an official from their competency gaps."""

from dataclasses import dataclass

from app.competency.framework import BY_ID
from app.competency.levels import CompetencyLevel


@dataclass
class Pick:
    course_id: str
    score: float
    reasons: list[str]


def rank_courses(courses: list, levels: list[CompetencyLevel], done: set[str], limit: int = 10) -> list[Pick]:
    """A course scores for each competency it teaches where the official is below both the role's requirement and
    the course's level. Bigger gaps weigh more; a competency whose prerequisite still has a gap weighs less
    (learn foundations first). Completed courses are skipped."""
    by = {lv.id: lv for lv in levels}
    gap_ids = {lv.id for lv in levels if lv.gap > 0}
    picks = []
    for c in courses:
        if c.id in done:
            continue
        score, reasons = 0.0, []
        for cid in c.competencies or []:
            lv = by.get(cid)
            if not lv or lv.gap <= 0 or lv.current >= c.level:
                continue
            gain = min(c.level, lv.required) - lv.current
            if gain <= 0:
                continue
            weight = 0.5 if any(p in gap_ids for p in BY_ID[cid].prerequisites) else 1.0
            score += gain * weight
            reasons.append(f"{lv.name}: {lv.current:g} → {min(c.level, lv.required)} of {lv.required}")
        if score > 0:
            score += 0.2 if c.source == "igot" else 0.0  # online, self-paced: easier to start now
            picks.append(Pick(c.id, round(score, 2), reasons))
    picks.sort(key=lambda p: -p.score)
    return picks[:limit]
