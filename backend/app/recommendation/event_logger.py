"""Section 10 event logging — captures every learning interaction from day 1.

This is the training data pipeline that feeds BKT, IRT, DKT, and Semi-MoE.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningEvent


async def log_event(
    db: AsyncSession,
    user_id: str,
    skill_id: str,
    event_type: str,
    correct: bool | None = None,
    response_time_ms: int | None = None,
    context: dict | None = None,
) -> LearningEvent:
    event = LearningEvent(
        user_id=user_id,
        skill_id=skill_id,
        event_type=event_type,
        correct=correct,
        response_time_ms=response_time_ms,
        context=context,
    )
    db.add(event)
    await db.flush()
    return event
