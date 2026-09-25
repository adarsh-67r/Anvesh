"""Orchestrator — auto-selects the highest viable phase per skill based on data volume.

Phase selection chain: IRT (most data) → BKT → EMA (fallback).
Designed so Phase 3-4 slot in at the top with zero changes to existing code.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.recommendation import bkt, ema, irt
from app.recommendation.knowledge_graph import get_graph


async def get_mastery(db: AsyncSession, user_id: str, skill_id: str) -> tuple[float, str]:
    """Return (mastery_score, phase_used) for a user-skill pair."""
    # Try IRT first (needs most data)
    total_responses, unique_users = await irt.get_response_data(db, skill_id)
    if irt.can_activate(total_responses, unique_users):
        ability = await irt.irt_ability(db, user_id, skill_id)
        if ability > -999.0:
            mastery = 1.0 / (1.0 + __import__("math").exp(-ability))
            return mastery, "irt"

    # Try BKT (needs moderate data)
    attempt_count = await bkt.get_skill_attempt_count(db, skill_id)
    if bkt.can_activate(attempt_count):
        mastery = await bkt.bkt_mastery(db, user_id, skill_id)
        if mastery >= 0:
            return mastery, "bkt"

    # Fallback: EMA (always works)
    mastery = await ema.get_mastery(db, user_id, skill_id)
    return mastery, "ema"


async def get_next_recommended_skills(db: AsyncSession, user_id: str, limit: int = 3) -> list[dict]:
    """Get top-K recommended skills using the best available phase."""
    # For recommendation frontier, EMA's mastered set drives the knowledge graph traversal.
    # Higher phases refine mastery scores but the frontier logic stays the same.
    mastered_ids = await ema.get_all_mastered_ids(db, user_id)
    graph = get_graph()
    frontier = graph.get_unmastered_frontier(mastered_ids)

    results = []
    for node in frontier[:limit]:
        score, phase = await get_mastery(db, user_id, node.id)
        results.append({
            "skill_id": node.id,
            "label": node.label,
            "depth": node.depth,
            "subject": node.subject,
            "grade": node.grade,
            "mastery_score": round(score, 4),
            "phase": phase,
        })
    return results


async def get_dropout_risk(db: AsyncSession, user_id: str) -> float:
    """Dropout risk. Currently uses EMA's naive heuristic."""
    return await ema.get_dropout_risk(db, user_id)


async def submit_answer(db: AsyncSession, user_id: str, skill_id: str, correct: bool) -> dict:
    """Process an answer: log event, update EMA mastery, return updated state."""
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
