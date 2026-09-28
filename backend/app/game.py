from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.recommendation.router import MAX_SESSION_MINUTES
from app.models import GameSession, LearningEvent, SkillVideo, User
from app.recommendation.orchestrator import record_answer
from app.trails.grounding import ensure_notes
from app.trails.questions import pick_questions, question_payload
from app.trails.scope import require_topic

router = APIRouter(prefix="/api/game", tags=["game"])


class SubmitAnswersRequest(BaseModel):
    session_id: str
    answers: list[dict]


async def _study_minutes_today(db: AsyncSession, user_id) -> int:
    """Focus minutes logged by the pomodoro timer in the last 24 hours."""
    rows = (
        await db.execute(
            select(LearningEvent.context).where(
                LearningEvent.user_id == user_id,
                LearningEvent.event_type == "study_session",
                LearningEvent.created_at >= datetime.utcnow() - timedelta(hours=24),
            )
        )
    ).scalars().all()
    # ponytail: minutes are client-reported (capped per session); verify server-side timing if it matters
    return sum(min(max(int((c or {}).get("minutes", 0) or 0), 0), MAX_SESSION_MINUTES) for c in rows)


async def _ready_questions(db, user, skill_id: str, n: int, lesson_id=None):
    """(questions, method) when the topic is grounded, else a 202 response to poll."""
    topic = await require_topic(db, user.id, skill_id)
    notes = await ensure_notes(db, skill_id)
    if notes.status != "ready":
        return None, JSONResponse(status_code=202, content={"status": notes.status, "progress": notes.progress})
    questions = await pick_questions(db, user.id, skill_id, n, lesson_id)
    if not questions:
        raise HTTPException(status_code=503, detail="No questions for this yet. Try again shortly.")
    ids = {q.lesson_id for q in questions if q.lesson_id}
    lessons = {str(v.id): v for v in (await db.execute(select(SkillVideo).where(SkillVideo.id.in_(ids)))).scalars()} if ids else {}
    return (topic, notes.method, [question_payload(q, lessons) for q in questions]), None


@router.get("/practice/{skill_id}")
async def practice(skill_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ready, wait = await _ready_questions(db, user, skill_id, 5)
    if wait:
        return wait
    topic, method, questions = ready
    return {"skill": {"id": topic.id, "label": topic.label}, "method": method, "questions": questions}


@router.get("/status")
async def game_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    minutes = await _study_minutes_today(db, user.id)
    required = settings.game_unlock_minutes
    return {"study_minutes": minutes, "required_minutes": required, "unlocked": minutes >= required}


@router.get("/quiz/{skill_id}")
async def get_quiz(skill_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    minutes = await _study_minutes_today(db, user.id)
    if minutes < settings.game_unlock_minutes:
        raise HTTPException(
            status_code=403,
            detail=f"Quiz unlocks after {settings.game_unlock_minutes} minutes of focused study. "
                   f"You have {minutes} so far today.",
        )
    ready, wait = await _ready_questions(db, user, skill_id, 5)
    if wait:
        return wait
    topic, _, questions = ready
    selected = [{"id": q["id"], "text": q["text"], "options": q["options"], "answer": q["answer"]} for q in questions]

    session = GameSession(user_id=user.id, skill_id=skill_id, total_questions=len(selected), questions=selected)
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "session_id": str(session.id),
        "skill": {"id": topic.id, "label": topic.label},
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

    questions = session.questions or []

    score = 0
    for ans in body.answers:
        idx = ans.get("question_idx", -1)
        if not isinstance(idx, int) or not 0 <= idx < len(questions):
            continue
        q = questions[idx]
        correct = ans.get("selected") == q.get("answer")
        score += correct
        qid = q.get("id")
        time_ms = ans.get("time_ms")
        await record_answer(db, str(user.id), session.skill_id, correct, question_id=qid,
                            response_time_ms=time_ms if isinstance(time_ms, int) and 0 < time_ms < 600000 else None)

    session.score = score
    session.completed_at = datetime.utcnow()
    await db.commit()

    return {
        "session_id": str(session.id),
        "score": score,
        "total": session.total_questions,
        "percentage": round(score / session.total_questions * 100) if session.total_questions else 0,
    }
