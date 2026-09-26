import secrets
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Attachment, Flashcard, GroupMember, GroupMessage, SharedDeck, StudyGroup, User

router = APIRouter(prefix="/api/groups", tags=["groups"])


class CreateGroupRequest(BaseModel):
    name: str


class JoinGroupRequest(BaseModel):
    invite_code: str


class ShareDeckRequest(BaseModel):
    flashcard_ids: list[str]


class SendMessageRequest(BaseModel):
    content: str = ""
    attachment_id: UUID | None = None


async def _require_member(db: AsyncSession, group_id: UUID, user_id: UUID) -> None:
    found = (
        await db.execute(select(GroupMember.id).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id))
    ).first()
    if not found:
        raise HTTPException(status_code=403, detail="Not a member")


def _message_out(m: GroupMessage, sender: str, filename: str | None, content_type: str | None) -> dict:
    return {
        "id": str(m.id),
        "user_id": str(m.user_id),
        "sender": sender,
        "content": m.content,
        "created_at": m.created_at.isoformat(),
        "attachment": {"id": str(m.attachment_id), "filename": filename, "content_type": content_type}
        if m.attachment_id else None,
    }


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


@router.get("/{group_id}/messages")
async def list_messages(
    group_id: UUID,
    after: datetime | None = None,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Newest `limit` messages, or only those after `after` when polling."""
    await _require_member(db, group_id, user.id)
    q = (
        select(GroupMessage, User.name, Attachment.filename, Attachment.content_type)
        .join(User, User.id == GroupMessage.user_id)
        .outerjoin(Attachment, Attachment.id == GroupMessage.attachment_id)
        .where(GroupMessage.group_id == group_id)
    )
    if after:
        q = q.where(GroupMessage.created_at > after.replace(tzinfo=None))
    rows = (await db.execute(q.order_by(GroupMessage.created_at.desc()).limit(min(limit, 200)))).all()
    rows.reverse()
    return [_message_out(m, name, fn, ct) for m, name, fn, ct in rows]


@router.post("/{group_id}/messages")
async def send_message(
    group_id: UUID, body: SendMessageRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _require_member(db, group_id, user.id)
    content = body.content.strip()[:4000]
    attachment = None
    if body.attachment_id:
        attachment = await db.get(Attachment, body.attachment_id)
        if not attachment or attachment.group_id != group_id:
            raise HTTPException(status_code=404, detail="Attachment not found in this group")
    if not content and not attachment:
        raise HTTPException(status_code=400, detail="Message is empty")

    msg = GroupMessage(group_id=group_id, user_id=user.id, content=content, attachment_id=body.attachment_id)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return _message_out(msg, user.name, attachment.filename if attachment else None,
                        attachment.content_type if attachment else None)
