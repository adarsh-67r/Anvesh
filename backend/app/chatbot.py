from fastapi import APIRouter, Depends
from google import genai
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import ChatMessage, User

router = APIRouter(prefix="/api/chat", tags=["chat"])

SYSTEM_PROMPT = (
    "You are Anvesh, a helpful AI tutor for students. "
    "Explain concepts clearly, use simple language, give examples. "
    "If the student seems stuck, break the problem into smaller steps. "
    "Keep responses concise but thorough."
)


class ChatRequest(BaseModel):
    message: str
    skill_context: str | None = None


@router.post("")
async def chat(body: ChatRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    history = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.user_id == user.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(20)
        )
    ).scalars().all()
    history.reverse()

    db.add(ChatMessage(user_id=user.id, role="user", content=body.message))

    contents = []
    for msg in history:
        contents.append(genai.types.Content(role=msg.role if msg.role != "assistant" else "model", parts=[genai.types.Part(text=msg.content)]))
    contents.append(genai.types.Content(role="user", parts=[genai.types.Part(text=body.message)]))

    system_text = SYSTEM_PROMPT
    if body.skill_context:
        system_text += f"\n\nThe student is currently studying: {body.skill_context}"

    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
        config=genai.types.GenerateContentConfig(system_instruction=system_text),
    )

    reply = response.text or "I couldn't generate a response. Please try again."
    db.add(ChatMessage(user_id=user.id, role="assistant", content=reply))
    await db.commit()

    return {"reply": reply}


@router.get("/history")
async def chat_history(limit: int = 50, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    messages = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.user_id == user.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    messages.reverse()
    return [{"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in messages]
