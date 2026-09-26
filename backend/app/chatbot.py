from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from google import genai
from google.genai import errors
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.attachments import AI_TYPES, MAX_BYTES, can_access
from app.database import get_db
from app.deps import get_current_user
from app.llm import generate
from app.models import Attachment, ChatMessage, User

router = APIRouter(prefix="/api/chat", tags=["chat"])

SYSTEM_PROMPT = (
    "You are Anvesh, a helpful AI tutor for students. "
    "Explain concepts clearly, use simple language, give examples. "
    "If the student seems stuck, break the problem into smaller steps. "
    "Keep responses concise but thorough."
)


class ChatRequest(BaseModel):
    message: str = ""
    skill_context: str | None = None
    attachment_id: UUID | None = None


@router.post("")
async def chat(body: ChatRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    history = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.user_id == user.id)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.role.asc())
            .limit(20)
        )
    ).scalars().all()
    history.reverse()

    attachment = None
    if body.attachment_id:
        attachment = await db.get(Attachment, body.attachment_id)
        if not attachment or not await can_access(db, attachment, user.id):
            raise HTTPException(status_code=404, detail="Attachment not found")
        if attachment.content_type not in AI_TYPES:
            raise HTTPException(status_code=415, detail="The tutor can read images, PDFs and text files only")
    if not body.message.strip() and not attachment:
        raise HTTPException(status_code=400, detail="Message is empty")

    message = body.message.strip() or "Please help me with this file."
    db.add(ChatMessage(user_id=user.id, role="user", content=message, attachment_id=attachment.id if attachment else None))

    contents = []
    for msg in history:
        text = msg.content if not msg.attachment_id else f"{msg.content} [The student attached a file earlier.]"
        contents.append(genai.types.Content(role=msg.role if msg.role != "assistant" else "model", parts=[genai.types.Part(text=text)]))
    parts = [genai.types.Part(text=message)]
    if attachment:
        parts.insert(0, genai.types.Part.from_bytes(data=attachment.data, mime_type=attachment.content_type))
    contents.append(genai.types.Content(role="user", parts=parts))

    system_text = SYSTEM_PROMPT
    if body.skill_context:
        system_text += f"\n\nThe student is currently studying: {body.skill_context}"

    try:
        reply = await generate(contents, genai.types.GenerateContentConfig(system_instruction=system_text))
    except errors.APIError:
        raise HTTPException(status_code=503, detail="AI tutor is busy, please try again in a moment.")

    reply = reply or "I couldn't generate a response. Please try again."
    db.add(ChatMessage(user_id=user.id, role="assistant", content=reply))
    await db.commit()

    return {"reply": reply}


AUDIO_TYPES = {"audio/m4a", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "video/webm"}


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    content_type = (file.content_type or "").split(";")[0].lower()
    if content_type not in AUDIO_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported audio type: {content_type or 'unknown'}")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Recording too long")
    if not data:
        raise HTTPException(status_code=400, detail="Empty recording")
    mime = "audio/webm" if content_type == "video/webm" else content_type
    try:
        text = await generate([
            genai.types.Part.from_bytes(data=data, mime_type=mime),
            "Transcribe this student's spoken question exactly, in the language spoken. "
            "Return only the transcript. If there is no speech, return an empty string.",
        ])
    except errors.APIError:
        raise HTTPException(status_code=503, detail="Voice input is busy, please try again in a moment.")
    return {"text": text.strip()}


@router.get("/history")
async def chat_history(limit: int = 50, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(ChatMessage, Attachment.filename, Attachment.content_type)
            .outerjoin(Attachment, Attachment.id == ChatMessage.attachment_id)
            .where(ChatMessage.user_id == user.id)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.role.asc())
            .limit(limit)
        )
    ).all()
    rows.reverse()
    return [
        {
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat(),
            "attachment": {"id": str(m.attachment_id), "filename": fn, "content_type": ct} if m.attachment_id else None,
        }
        for m, fn, ct in rows
    ]
