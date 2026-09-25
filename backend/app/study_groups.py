import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Flashcard, GroupMember, SharedDeck, StudyGroup, User

router = APIRouter(prefix="/api/groups", tags=["groups"])


class CreateGroupRequest(BaseModel):
    name: str


class JoinGroupRequest(BaseModel):
    invite_code: str


class ShareDeckRequest(BaseModel):
    flashcard_ids: list[str]


@router.get("")
async def my_groups(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    memberships = (
        await db.execute(select(GroupMember).where(GroupMember.user_id == user.id))
    ).scalars().all()
    group_ids = [m.group_id for m in memberships]
    if not group_ids:
        return []
    groups = (await db.execute(select(StudyGroup).where(StudyGroup.id.in_(group_ids)))).scalars().all()
    return [{"id": str(g.id), "name": g.name, "invite_code": g.invite_code} for g in groups]


@router.post("")
async def create_group(body: CreateGroupRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    group = StudyGroup(name=body.name, created_by=user.id, invite_code=secrets.token_urlsafe(4)[:6].upper())
    db.add(group)
    await db.flush()
    db.add(GroupMember(group_id=group.id, user_id=user.id))
    await db.commit()
    await db.refresh(group)
    return {"id": str(group.id), "name": group.name, "invite_code": group.invite_code}


@router.post("/join")
async def join_group(body: JoinGroupRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    group = (
        await db.execute(select(StudyGroup).where(StudyGroup.invite_code == body.invite_code.upper()))
    ).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    existing = (
        await db.execute(
            select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.user_id == user.id)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Already a member")

    db.add(GroupMember(group_id=group.id, user_id=user.id))
    await db.commit()
    return {"id": str(group.id), "name": group.name}


@router.post("/{group_id}/share-deck")
async def share_deck(group_id: str, body: ShareDeckRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    member = (
        await db.execute(
            select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user.id)
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member")

    deck = SharedDeck(group_id=group_id, shared_by=user.id, flashcard_ids=body.flashcard_ids)
    db.add(deck)
    await db.commit()
    await db.refresh(deck)
    return {"id": str(deck.id), "card_count": len(body.flashcard_ids)}


@router.get("/{group_id}/decks")
async def group_decks(group_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    member = (
        await db.execute(
            select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user.id)
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member")

    decks = (
        await db.execute(select(SharedDeck).where(SharedDeck.group_id == group_id).order_by(SharedDeck.shared_at.desc()))
    ).scalars().all()

    results = []
    for deck in decks:
        cards = (
            await db.execute(select(Flashcard).where(Flashcard.id.in_(deck.flashcard_ids)))
        ).scalars().all()
        results.append({
            "id": str(deck.id),
            "shared_by": str(deck.shared_by),
            "shared_at": deck.shared_at.isoformat(),
            "cards": [{"front": c.front, "back": c.back, "skill_id": c.skill_id} for c in cards],
        })
    return results
