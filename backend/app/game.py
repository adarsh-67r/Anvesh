import json
import random
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import GameSession, Skill, User

router = APIRouter(prefix="/api/game", tags=["game"])


class SubmitAnswersRequest(BaseModel):
    session_id: str
    answers: list[dict]


_quiz_cache: dict[str, list[dict]] = {}


async def _generate_questions(skill_label: str) -> list[dict]:
    """Generate quiz questions using Gemini."""
    if skill_label in _quiz_cache:
        return _quiz_cache[skill_label]

    try:
        from google import genai
        client = genai.Client(api_key=settings.gemini_api_key)
        prompt = (
            f"Generate 5 multiple choice questions about '{skill_label}'. "
            f"Return ONLY a JSON array, each object with: "
            f'"text" (question), "options" (4 strings), "answer" (the correct option string). '
            f"No markdown, no explanation, just the JSON array."
        )
        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        questions = json.loads(text)
        _quiz_cache[skill_label] = questions
        return questions
    except Exception:
        return []


@router.get("/quiz/{skill_id}")
async def get_quiz(skill_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    skill = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    questions = await _generate_questions(skill.label)
    if not questions:
        raise HTTPException(status_code=404, detail="Could not generate questions")

    selected = random.sample(questions, min(5, len(questions)))

    session = GameSession(user_id=user.id, skill_id=skill_id, total_questions=len(selected))
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "session_id": str(session.id),
        "skill": {"id": skill.id, "label": skill.label},
        "questions": [
            {"idx": i, "text": q["text"], "options": q["options"]}
            for i, q in enumerate(selected)
        ],
    }


@router.post("/submit")
async def submit_answers(body: SubmitAnswersRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    session = (
        await db.execute(select(GameSession).where(GameSession.id == body.session_id))
    ).scalar_one_or_none()
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.completed_at:
        raise HTTPException(status_code=400, detail="Already completed")

    skill = (await db.execute(select(Skill).where(Skill.id == session.skill_id))).scalar_one_or_none()
    questions = await _generate_questions(skill.label) if skill else []

    score = 0
    for ans in body.answers:
        idx = ans.get("question_idx", -1)
        if 0 <= idx < len(questions):
            if ans.get("selected") == questions[idx].get("answer"):
                score += 1

    session.score = score
    session.completed_at = datetime.utcnow()
    await db.commit()

    return {
        "session_id": str(session.id),
        "score": score,
        "total": session.total_questions,
        "percentage": round(score / session.total_questions * 100) if session.total_questions else 0,
    }
