from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Attachment, GroupMember, User

router = APIRouter(tags=["attachments"])

MAX_BYTES = 5 * 1024 * 1024
LINK_TTL = timedelta(minutes=10)

# Types Gemini can read, allowed in AI tutor chat.
AI_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf", "text/plain"}
# Types allowed in group files. Anything else is rejected rather than served.
GROUP_TYPES = AI_TYPES | {
    "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
INLINE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain"}


async def _is_member(db: AsyncSession, group_id: UUID, user_id: UUID) -> bool:
    return (
        await db.execute(select(GroupMember.id).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id))
    ).first() is not None


async def can_access(db: AsyncSession, att: Attachment, user_id: UUID) -> bool:
    if att.user_id == user_id:
        return True
    return att.group_id is not None and await _is_member(db, att.group_id, user_id)


def meta(att: Attachment) -> dict:
    return {
        "id": str(att.id),
        "filename": att.filename,
        "content_type": att.content_type,
        "size": att.size,
        "user_id": str(att.user_id),
        "created_at": att.created_at.isoformat() if att.created_at else None,
    }


@router.post("/api/attachments")
async def upload(
    file: UploadFile = File(...),
    group_id: UUID | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content_type = (file.content_type or "").split(";")[0].lower()
    allowed = GROUP_TYPES if group_id else AI_TYPES
    if content_type not in allowed:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {content_type or 'unknown'}")
    if group_id and not await _is_member(db, group_id, user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    att = Attachment(
        user_id=user.id,
        group_id=group_id,
        filename=(file.filename or "file")[:255],
        content_type=content_type,
        size=len(data),
        data=data,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)
    return meta(att)


@router.get("/api/groups/{group_id}/files")
async def group_files(group_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await _is_member(db, group_id, user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")
    rows = (
        await db.execute(
            select(Attachment.id, Attachment.filename, Attachment.content_type, Attachment.size,
                   Attachment.user_id, Attachment.created_at)
            .where(Attachment.group_id == group_id)
            .order_by(Attachment.created_at.desc())
        )
    ).all()
    return [meta(r) for r in rows]


@router.post("/api/attachments/{attachment_id}/link")
async def signed_link(
    attachment_id: UUID, request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Short-lived URL that opens the file without the auth header (for browsers and viewers)."""
    att = await db.get(Attachment, attachment_id)
    if not att or not await can_access(db, att, user.id):
        raise HTTPException(status_code=404, detail="File not found")
    token = jwt.encode(
        {"att": str(att.id), "exp": datetime.now(timezone.utc) + LINK_TTL},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    base = str(request.base_url).rstrip("/")
    if request.headers.get("x-forwarded-proto") == "https":
        base = base.replace("http://", "https://", 1)
    return {"url": f"{base}/api/attachments/{att.id}/download?t={token}"}


@router.get("/api/attachments/{attachment_id}/download")
async def download(attachment_id: UUID, t: str, db: AsyncSession = Depends(get_db)):
    try:
        claims = jwt.decode(t, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Link expired or invalid")
    if claims.get("att") != str(attachment_id):
        raise HTTPException(status_code=401, detail="Link expired or invalid")

    att = await db.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="File not found")
    disposition = "inline" if att.content_type in INLINE_TYPES else "attachment"
    return Response(
        content=att.data,
        media_type=att.content_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(att.filename)}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=600",
        },
    )
