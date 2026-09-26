"""Orchestrator — picks the highest viable model per skill based on data volume.

Phase selection chain: IRT (most data) -> BKT -> EMA (fallback, works from day 1).
Recommendations only include skills whose prerequisites are all mastered.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningEvent, Skill
from app.recommendation import bkt, ema, irt
from app.recommendation.event_logger import log_event


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


def skill_status(skill: Skill, mastered_ids: set[str]) -> str:
    if skill.id in mastered_ids:
        return "mastered"
    if all(p in mastered_ids for p in (skill.prerequisites or [])):
        return "available"
    return "locked"


async def get_next_recommended_skills(db: AsyncSession, user_id: str, limit: int = 3) -> list[dict]:
    """Top-K skills on the learning frontier: unmastered, all prerequisites mastered.

    Order: shallower skills first, then skills already in progress (closest to mastery),
    then untouched skills.
    """
    mastered_ids = await ema.get_all_mastered_ids(db, user_id)
    all_skills = (await db.execute(select(Skill))).scalars().all()
    counts = await _response_counts(db)

    results = []
    for skill in all_skills:
        if skill_status(skill, mastered_ids) != "available":
            continue
        score, phase = await get_mastery(db, user_id, skill.id, counts.get(skill.id, (0, 0)))
        started = score > 0.0
        results.append({
            "skill_id": skill.id,
            "label": skill.label,
            "depth": skill.depth,
            "subject": skill.subject,
            "grade": 0,
            "prerequisites": skill.prerequisites or [],
            "mastery_score": round(score, 4),
            "phase": phase,
            "reason": "In progress" if started else ("Prerequisites complete" if skill.prerequisites else "Not started"),
        })

    results.sort(key=lambda r: (r["depth"], r["mastery_score"] == 0.0, -r["mastery_score"]))
    return results[:limit]


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
