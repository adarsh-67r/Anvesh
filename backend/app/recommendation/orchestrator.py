"""Orchestrator — picks the highest viable model per skill based on data volume.

Phase selection chain: IRT (most data) -> BKT -> EMA (fallback, works from day 1).
Recommendations only include skills whose prerequisites are all mastered.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningEvent
from app.recommendation import bkt, ema, irt
from app.recommendation.event_logger import log_event
from app.trails.groups import expand_mastered, groups_of, pick_per_group
from app.trails.scope import user_skills


async def _response_counts(db: AsyncSession) -> dict[str, tuple[int, int]]:
    """skill_id -> (total_responses, unique_users), in one query."""
    rows = (
        await db.execute(
            select(LearningEvent.skill_id, func.count(), func.count(func.distinct(LearningEvent.user_id)))
            .where(LearningEvent.event_type == "answer", LearningEvent.correct.isnot(None))
            .group_by(LearningEvent.skill_id)
        )
    ).all()
    return {skill_id: (total, users) for skill_id, total, users in rows}


async def get_mastery(
    db: AsyncSession, user_id: str, skill_id: str, counts: tuple[int, int] | None = None
) -> tuple[float, str]:
    """Return (mastery_score in [0, 1], phase_used) for a user-skill pair."""
    total, users = counts if counts is not None else await irt.get_response_data(db, skill_id)
    if irt.can_activate(total, users):
        return await irt.irt_mastery(db, user_id, skill_id), "irt"
    if bkt.can_activate(total):
        return await bkt.bkt_mastery(db, user_id, skill_id), "bkt"
    return await ema.get_mastery(db, user_id, skill_id), "ema"


def _is_mastered(score: float, phase: str, ema_flag: bool) -> bool:
    if phase == "irt":
        return score >= irt.MASTERY_THRESHOLD
    if phase == "bkt":
        return score >= bkt.MASTERY_THRESHOLD
    return ema_flag


def skill_status(skill, mastered_ids: set[str], effective: set[str] | None = None) -> str:
    """mastered: this topic. covered: an equivalent topic is mastered. available: prerequisites met."""
    eff = effective if effective is not None else mastered_ids
    if skill.id in mastered_ids:
        return "mastered"
    if skill.id in eff:
        return "covered"
    if all(p in eff for p in (skill.prerequisites or [])):
        return "available"
    return "locked"


async def get_next_recommended_skills(db: AsyncSession, user_id: str, limit: int = 3) -> list[dict]:
    """Top-K topics on the student's frontier across their trails; one per overlap group."""
    topics = await user_skills(db, user_id)
    groups = groups_of({t.id: t.equivalent_to for t in topics})
    mastered_ids = await ema.get_all_mastered_ids(db, user_id)
    effective = expand_mastered(mastered_ids, groups)
    counts = await _response_counts(db)

    results = []
    for t in topics:
        if skill_status(t, mastered_ids, effective) != "available":
            continue
        score, phase = await get_mastery(db, user_id, t.id, counts.get(t.id, (0, 0)))
        results.append({
            "skill_id": t.id, "label": t.label, "depth": t.depth, "subject": t.subject, "grade": 0,
            "prerequisites": t.prerequisites, "mastery_score": round(score, 4), "phase": phase,
            "trail_id": t.trail_id, "trail_title": t.trail_title, "position": t.position,
            "reason": "In progress" if score > 0 else ("Prerequisites complete" if t.prerequisites else "Not started"),
        })

    results.sort(key=lambda r: (r["depth"], r["mastery_score"] == 0.0, -r["mastery_score"], r["position"]))
    keep = set(pick_per_group([r["skill_id"] for r in results], groups))
    return [r for r in results if r["skill_id"] in keep][:limit]


async def get_dropout_risk(db: AsyncSession, user_id: str) -> float:
    return await ema.get_dropout_risk(db, user_id)


async def record_answer(
    db: AsyncSession,
    user_id: str,
    skill_id: str,
    correct: bool,
    question_id: str | None = None,
    response_time_ms: int | None = None,
) -> dict:
    """Log one answer and update mastery. Caller commits."""
    await log_event(
        db, user_id, skill_id, "answer",
        correct=correct,
        response_time_ms=response_time_ms,
        context={"question_id": question_id} if question_id else None,
    )
    row = await ema.update_mastery(db, user_id, skill_id, correct)
    score, phase = await get_mastery(db, user_id, skill_id)
    row.is_mastered = _is_mastered(score, phase, row.is_mastered)
    return {
        "skill_id": skill_id,
        "mastery_score": round(score, 4),
        "is_mastered": row.is_mastered,
        "consecutive_mastery": row.consecutive_mastery,
        "phase": phase,
    }


async def submit_answer(
    db: AsyncSession,
    user_id: str,
    skill_id: str,
    correct: bool,
    question_id: str | None = None,
    response_time_ms: int | None = None,
) -> dict:
    result = await record_answer(db, user_id, skill_id, correct, question_id, response_time_ms)
    await db.commit()
    return result
