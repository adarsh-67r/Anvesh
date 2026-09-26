from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Skill, SkillMastery, SkillVideo, User
from app.recommendation import orchestrator

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
    all_skills = (await db.execute(select(Skill).order_by(Skill.created_at))).scalars().all()
    mastery_rows = (
        await db.execute(select(SkillMastery).where(SkillMastery.user_id == user.id))
    ).scalars().all()
    mastery_map = {r.skill_id: r for r in mastery_rows}

    # Get video counts per skill
    video_counts = dict(
        (await db.execute(
            select(SkillVideo.skill_id, sqlfunc.count(SkillVideo.id))
            .group_by(SkillVideo.skill_id)
        )).all()
    )

    nodes = []
    for skill in all_skills:
        m = mastery_map.get(skill.id)
        nodes.append({
            "id": skill.id,
            "label": skill.label,
            "depth": skill.depth,
            "subject": skill.subject,
            "grade": 0,
            "prerequisites": [],
            "mastery_score": round(m.mastery_score, 4) if m else 0.0,
            "is_mastered": m.is_mastered if m else False,
            "status": "mastered" if (m and m.is_mastered) else "available",
            "video_count": video_counts.get(skill.id, 0),
        })
    return nodes


@router.get("/dropout-risk")
async def dropout_risk(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    risk = await orchestrator.get_dropout_risk(db, str(user.id))
    return {"risk_score": round(risk, 4), "risk_level": "Low" if risk < 0.5 else "High"}


@router.get("/videos/{skill_id}")
async def skill_videos(skill_id: str, db: AsyncSession = Depends(get_db)):
    videos = (
        await db.execute(
            select(SkillVideo).where(SkillVideo.skill_id == skill_id).order_by(SkillVideo.display_order)
        )
    ).scalars().all()
    return [{"id": str(v.id), "title": v.title, "url": v.url, "display_order": v.display_order} for v in videos]
