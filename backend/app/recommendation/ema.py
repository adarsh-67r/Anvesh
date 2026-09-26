"""Phase 0 — Exponential Moving Average mastery tracking.

EMA_ALPHA = 0.3: mastery(t) = 0.3 * correct(t) + 0.7 * mastery(t-1)
Initial mastery = 0.5. Mastered when score >= 0.75 for 3 consecutive attempts.
Zero data needed — works day 1.
"""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningEvent, SkillMastery
EMA_ALPHA = 0.3
MASTERY_THRESHOLD = 0.75
CONSECUTIVE_REQUIRED = 3
DROPOUT_DAYS_THRESHOLD = 7


async def update_mastery(db: AsyncSession, user_id: str, skill_id: str, correct: bool) -> SkillMastery:
    row = (
        await db.execute(
            select(SkillMastery).where(SkillMastery.user_id == user_id, SkillMastery.skill_id == skill_id)
        )
    ).scalar_one_or_none()

    if row is None:
        row = SkillMastery(user_id=user_id, skill_id=skill_id, mastery_score=0.5, consecutive_mastery=0, is_mastered=False)
        db.add(row)

    row.mastery_score = EMA_ALPHA * float(correct) + (1 - EMA_ALPHA) * row.mastery_score

    if row.mastery_score >= MASTERY_THRESHOLD:
        row.consecutive_mastery += 1
    else:
        row.consecutive_mastery = 0

    if row.consecutive_mastery >= CONSECUTIVE_REQUIRED:
        row.is_mastered = True

    await db.flush()
    return row


async def get_mastery(db: AsyncSession, user_id: str, skill_id: str) -> float:
    row = (
        await db.execute(
            select(SkillMastery).where(SkillMastery.user_id == user_id, SkillMastery.skill_id == skill_id)
        )
    ).scalar_one_or_none()
    return row.mastery_score if row else 0.0


async def get_all_mastered_ids(db: AsyncSession, user_id: str) -> set[str]:
    rows = (
        await db.execute(
            select(SkillMastery.skill_id).where(SkillMastery.user_id == user_id, SkillMastery.is_mastered == True)
        )
    ).scalars().all()
    return set(rows)


async def get_dropout_risk(db: AsyncSession, user_id: str) -> float:
    # ponytail: naive heuristic, replace with BKT/IRT-based in later phases
    last_event = (
        await db.execute(
            select(func.max(LearningEvent.created_at)).where(LearningEvent.user_id == user_id)
        )
    ).scalar()
    if last_event is None:
        return 0.5
    days_since = (datetime.now(timezone.utc) - last_event.replace(tzinfo=timezone.utc)).days
    return 0.8 if days_since > DROPOUT_DAYS_THRESHOLD else max(0.1, days_since / DROPOUT_DAYS_THRESHOLD)
