from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import SkillMastery, SkillVideo, User
from app.recommendation import orchestrator
from app.recommendation.knowledge_graph import get_graph

router = APIRouter(prefix="/api/recommend", tags=["recommendation"])


class AnswerRequest(BaseModel):
    skill_id: str
    correct: bool
    response_time_ms: int | None = None


@router.get("/next")
async def next_skills(limit: int = 3, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    skills = await orchestrator.get_next_recommended_skills(db, str(user.id), limit)
    for skill in skills:
        videos = (
            await db.execute(
                select(SkillVideo).where(SkillVideo.skill_id == skill["skill_id"]).order_by(SkillVideo.display_order)
            )
        ).scalars().all()
        skill["videos"] = [{"id": str(v.id), "title": v.title, "url": v.url} for v in videos]
    return skills


@router.post("/answer")
async def submit_answer(body: AnswerRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await orchestrator.submit_answer(db, str(user.id), body.skill_id, body.correct)


@router.get("/mastery")
async def all_mastery(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(select(SkillMastery).where(SkillMastery.user_id == user.id))
    ).scalars().all()
    return [
        {
            "skill_id": r.skill_id,
            "mastery_score": round(r.mastery_score, 4),
            "is_mastered": r.is_mastered,
            "consecutive_mastery": r.consecutive_mastery,
        }
        for r in rows
    ]


@router.get("/mastery/{skill_id}")
async def skill_mastery(skill_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    score, phase = await orchestrator.get_mastery(db, str(user.id), skill_id)
    return {"skill_id": skill_id, "mastery_score": round(score, 4), "phase": phase}


@router.get("/graph")
async def full_graph(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    graph = get_graph()
    mastery_rows = (
        await db.execute(select(SkillMastery).where(SkillMastery.user_id == user.id))
    ).scalars().all()
    mastery_map = {r.skill_id: r for r in mastery_rows}

    nodes = []
    for node in graph.get_all_nodes():
        m = mastery_map.get(node.id)
        prereqs_met = all(
            mastery_map.get(p) and mastery_map[p].is_mastered for p in node.prerequisites
        ) if node.prerequisites else True
        nodes.append({
            "id": node.id,
            "label": node.label,
            "depth": node.depth,
            "subject": node.subject,
            "grade": node.grade,
            "prerequisites": node.prerequisites,
            "mastery_score": round(m.mastery_score, 4) if m else 0.0,
            "is_mastered": m.is_mastered if m else False,
            "status": "mastered" if (m and m.is_mastered) else ("available" if prereqs_met else "locked"),
        })
    return nodes


@router.get("/dropout-risk")
async def dropout_risk(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    risk = await orchestrator.get_dropout_risk(db, str(user.id))
    return {"dropout_risk": round(risk, 4)}


@router.get("/videos/{skill_id}")
async def skill_videos(skill_id: str, db: AsyncSession = Depends(get_db)):
    videos = (
        await db.execute(
            select(SkillVideo).where(SkillVideo.skill_id == skill_id).order_by(SkillVideo.display_order)
        )
    ).scalars().all()
    return [{"id": str(v.id), "title": v.title, "url": v.url, "display_order": v.display_order} for v in videos]
