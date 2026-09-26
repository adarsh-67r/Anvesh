from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Flashcard, User

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


class FlashcardCreate(BaseModel):
    front: str
    back: str
    skill_id: str | None = None


class FlashcardUpdate(BaseModel):
    front: str | None = None
    back: str | None = None


class ReviewRequest(BaseModel):
    quality: int  # 0-5: 0=blackout, 5=perfect


def sm2_update(card: Flashcard, quality: int):
    """SuperMemo SM-2 algorithm."""
    if quality >= 3:
        if card.repetitions == 0:
            card.interval = 1
        elif card.repetitions == 1:
            card.interval = 6
        else:
            card.interval = round(card.interval * card.easiness)
        card.repetitions += 1
    else:
        card.repetitions = 0
        card.interval = 1
    card.easiness = max(1.3, card.easiness + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    card.next_review = datetime.utcnow() + timedelta(days=card.interval)


@router.get("")
async def list_cards(skill_id: str | None = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = select(Flashcard).where(Flashcard.user_id == user.id)
    if skill_id:
        q = q.where(Flashcard.skill_id == skill_id)
    cards = (await db.execute(q.order_by(Flashcard.created_at))).scalars().all()
    return [_card_dict(c) for c in cards]


@router.get("/due")
async def due_cards(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    cards = (
        await db.execute(
            select(Flashcard)
            .where(Flashcard.user_id == user.id, Flashcard.next_review <= now)
            .order_by(Flashcard.next_review)
        )
    ).scalars().all()
    return [_card_dict(c) for c in cards]


@router.post("")
async def create_card(body: FlashcardCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    card = Flashcard(user_id=user.id, front=body.front, back=body.back, skill_id=body.skill_id)
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return _card_dict(card)


@router.put("/{card_id}")
async def update_card(card_id: UUID, body: FlashcardUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    card = await _get_card(db, card_id, user.id)
    if body.front is not None:
        card.front = body.front
    if body.back is not None:
        card.back = body.back
    await db.commit()
    return _card_dict(card)


@router.delete("/{card_id}")
async def delete_card(card_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    card = await _get_card(db, card_id, user.id)
    await db.delete(card)
    await db.commit()
    return {"deleted": True}


@router.post("/{card_id}/review")
async def review_card(card_id: UUID, body: ReviewRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not 0 <= body.quality <= 5:
        raise HTTPException(status_code=400, detail="Quality must be 0-5")
    card = await _get_card(db, card_id, user.id)
    sm2_update(card, body.quality)
    await db.commit()
    return _card_dict(card)


async def _get_card(db: AsyncSession, card_id: UUID, user_id: UUID) -> Flashcard:
    card = (await db.execute(select(Flashcard).where(Flashcard.id == card_id))).scalar_one_or_none()
    if not card or card.user_id != user_id:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


def _card_dict(c: Flashcard) -> dict:
    return {
        "id": str(c.id),
        "front": c.front,
        "back": c.back,
        "skill_id": c.skill_id,
        "easiness": round(c.easiness, 2),
        "interval": c.interval,
        "repetitions": c.repetitions,
        "next_review": c.next_review.isoformat() if c.next_review else None,
    }
