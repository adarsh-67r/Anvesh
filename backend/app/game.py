import random
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import GameSession, User
from app.recommendation.knowledge_graph import get_graph

router = APIRouter(prefix="/api/game", tags=["game"])


class SubmitAnswersRequest(BaseModel):
    session_id: str
    answers: list[dict]  # [{question_idx: int, selected: str}]


@router.get("/quiz/{skill_id}")
async def get_quiz(skill_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    graph = get_graph()
    node = graph.get_node(skill_id)
    if not node:
        raise HTTPException(status_code=404, detail="Skill not found")

    if not node.questions:
        raise HTTPException(status_code=404, detail="No questions available for this skill")

    questions = random.sample(node.questions, min(5, len(node.questions)))

    session = GameSession(user_id=user.id, skill_id=skill_id, total_questions=len(questions))
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "session_id": str(session.id),
        "skill": {"id": node.id, "label": node.label},
        "questions": [
            {
                "idx": i,
                "text": q["text"],
                "options": q["options"],
            }
            for i, q in enumerate(questions)
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

    graph = get_graph()
    node = graph.get_node(session.skill_id)
    questions = node.questions if node else []

    score = 0
    for ans in body.answers:
        idx = ans.get("question_idx", -1)
        if 0 <= idx < len(questions):
            if ans.get("selected") == questions[idx].get("answer"):
                score += 1

    session.score = score
    session.completed_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "session_id": str(session.id),
        "score": score,
        "total": session.total_questions,
        "percentage": round(score / session.total_questions * 100) if session.total_questions else 0,
    }
