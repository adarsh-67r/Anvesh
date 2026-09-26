"""Orchestrator — auto-selects the highest viable phase per skill based on data volume.

Phase selection chain: IRT (most data) -> BKT -> EMA (fallback).
Skills are now dynamic (from DB), not from a static knowledge graph.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Skill, SkillMastery
from app.recommendation import bkt, ema, irt


async def get_mastery(db: AsyncSession, user_id: str, skill_id: str) -> tuple[float, str]:
    """Return (mastery_score, phase_used) for a user-skill pair."""
    total_responses, unique_users = await irt.get_response_data(db, skill_id)
    if irt.can_activate(total_responses, unique_users):
        ability = await irt.irt_ability(db, user_id, skill_id)
        if ability > -999.0:
            mastery = 1.0 / (1.0 + __import__("math").exp(-ability))
            return mastery, "irt"

    attempt_count = await bkt.get_skill_attempt_count(db, skill_id)
    if bkt.can_activate(attempt_count):
        mastery = await bkt.bkt_mastery(db, user_id, skill_id)
        if mastery >= 0:
            return mastery, "bkt"

    mastery = await ema.get_mastery(db, user_id, skill_id)
    return mastery, "ema"


async def get_next_recommended_skills(db: AsyncSession, user_id: str, limit: int = 3) -> list[dict]:
    """Get top-K recommended skills — all unmastered skills from DB, sorted by mastery (lowest first)."""
    mastered_ids = await ema.get_all_mastered_ids(db, user_id)
    all_skills = (await db.execute(select(Skill))).scalars().all()

    # Recommend unmastered skills, lowest mastery first
    candidates = [s for s in all_skills if s.id not in mastered_ids]

    results = []
    for skill in candidates:
        score, phase = await get_mastery(db, user_id, skill.id)
        results.append({
            "skill_id": skill.id,
            "label": skill.label,
            "depth": skill.depth,
            "subject": skill.subject,
            "grade": 0,
            "mastery_score": round(score, 4),
            "phase": phase,
            "reason": "Not started" if score == 0.0 else "In progress",
        })

    results.sort(key=lambda r: r["mastery_score"])
    return results[:limit]


async def get_dropout_risk(db: AsyncSession, user_id: str) -> float:
    return await ema.get_dropout_risk(db, user_id)


async def submit_answer(db: AsyncSession, user_id: str, skill_id: str, correct: bool) -> dict:
    from app.recommendation.event_logger import log_event

    await log_event(db, user_id, skill_id, "answer", correct=correct)
    mastery = await ema.update_mastery(db, user_id, skill_id, correct)
    await db.commit()

    score, phase = await get_mastery(db, user_id, skill_id)
    return {
        "skill_id": skill_id,
        "mastery_score": round(score, 4),
        "is_mastered": mastery.is_mastered,
        "consecutive_mastery": mastery.consecutive_mastery,
        "phase": phase,
    }
