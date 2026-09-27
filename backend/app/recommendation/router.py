import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import SkillMastery, SkillVideo, TrailTopic, User
from app.recommendation import orchestrator
from app.recommendation.event_logger import log_event
from app.recommendation.knowledge_graph import KnowledgeGraph, SkillNode
from app.trails.groups import expand_mastered, groups_of
from app.trails.scope import require_topic, user_skills

router = APIRouter(prefix="/api/recommend", tags=["recommendation"])


class AnswerRequest(BaseModel):
    skill_id: str
    correct: bool
    question_id: str | None = None
    response_time_ms: int | None = None


class PrerequisitesRequest(BaseModel):
    prerequisites: list[str]


# Answers go through /answer so mastery updates; everything else is logged here.
EVENT_TYPES = {"video_play", "study_session", "hint", "content_view"}


class EventRequest(BaseModel):
    event_type: str
    skill_id: str = "general"
    response_time_ms: int | None = None
    context: dict | None = None


def visible_lessons(skill_id: str, user_id):
    """Imported lessons plus this student's own additions."""
    return (
        select(SkillVideo)
        .where(SkillVideo.skill_id == skill_id, or_(SkillVideo.user_id.is_(None), SkillVideo.user_id == user_id))
        .order_by(SkillVideo.display_order)
    )


async def build_graph(db: AsyncSession, user_id, trail_id: str | None = None) -> list[dict]:
    topics = await user_skills(db, user_id)
    groups = groups_of({t.id: t.equivalent_to for t in topics})
    rows = (await db.execute(select(SkillMastery).where(SkillMastery.user_id == user_id))).scalars().all()
    mastery = {r.skill_id: r for r in rows}
    mastered = {r.skill_id for r in rows if r.is_mastered}
    effective = expand_mastered(mastered, groups)
    labels = {t.id: t.label for t in topics}
    trail_of = {t.id: t.trail_title for t in topics}
    ids = [t.id for t in topics]
    counts = dict((await db.execute(
        select(SkillVideo.skill_id, sqlfunc.count(SkillVideo.id))
        .where(SkillVideo.skill_id.in_(ids), or_(SkillVideo.user_id.is_(None), SkillVideo.user_id == user_id))
        .group_by(SkillVideo.skill_id)
    )).all()) if ids else {}
    nodes = []
    for t in topics:
        if trail_id and t.trail_id != trail_id:
            continue
        m = mastery.get(t.id)
        nodes.append({
            "id": t.id, "label": t.label, "depth": t.depth, "subject": t.subject, "grade": 0,
            "prerequisites": t.prerequisites, "position": t.position, "summary": t.summary,
            "trail_id": t.trail_id, "trail_title": t.trail_title, "source_ref": t.source_ref,
            "equivalents": [{"id": e, "label": labels[e], "trail_title": trail_of[e]} for e in t.equivalent_to],
            "mastery_score": round(m.mastery_score, 4) if m else 0.0,
            "is_mastered": m.is_mastered if m else False,
            "status": orchestrator.skill_status(t, mastered, effective),
            "video_count": counts.get(t.id, 0),
        })
    return nodes


@router.get("/next")
async def next_skills(limit: int = 3, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    skills = await orchestrator.get_next_recommended_skills(db, str(user.id), limit)
    for skill in skills:
        videos = (await db.execute(visible_lessons(skill["skill_id"], user.id))).scalars().all()
        skill["videos"] = [
            {"id": str(v.id), "title": v.title, "url": v.url, "youtube_id": v.youtube_id, "start_sec": v.start_sec, "end_sec": v.end_sec}
            for v in videos
        ]
    return skills


@router.post("/answer")
async def submit_answer(body: AnswerRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_topic(db, user.id, body.skill_id)
    return await orchestrator.submit_answer(
        db, str(user.id), body.skill_id, body.correct, body.question_id, body.response_time_ms
    )


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
async def full_graph(trail_id: str | None = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await build_graph(db, user.id, trail_id)


@router.post("/events")
async def log_learning_event(body: EventRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.event_type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"event_type must be one of {sorted(EVENT_TYPES)}")
    if body.context and len(str(body.context)) > 2000:
        raise HTTPException(status_code=413, detail="context too large")
    if body.event_type == "study_session":
        minutes = (body.context or {}).get("minutes")
        if not isinstance(minutes, int) or not 1 <= minutes <= 25:
            raise HTTPException(status_code=400, detail="study_session needs context.minutes between 1 and 25")
    await log_event(db, str(user.id), body.skill_id[:100], body.event_type,
                    response_time_ms=body.response_time_ms, context=body.context)
    await db.commit()
    return {"ok": True}


@router.put("/skills/{skill_id}/prerequisites")
async def set_prerequisites(
    skill_id: str, body: PrerequisitesRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    topic = await require_topic(db, user.id, skill_id)
    topics = {t.id: t for t in await user_skills(db, user.id)}
    unknown = [p for p in body.prerequisites if p not in topics]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown prerequisites: {unknown}")
    new = list(dict.fromkeys(body.prerequisites))
    try:
        KnowledgeGraph([
            SkillNode(t.id, t.label, t.depth, t.subject, 0, new if t.id == skill_id else t.prerequisites)
            for t in topics.values()
        ])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    tt = await db.get(TrailTopic, (uuid.UUID(topic.trail_id), skill_id))
    tt.prerequisites_override = new
    await db.commit()
    return {"skill_id": skill_id, "prerequisites": new}


@router.get("/dropout-risk")
async def dropout_risk(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    risk = await orchestrator.get_dropout_risk(db, str(user.id))
    return {"risk_score": round(risk, 4), "risk_level": "Low" if risk < 0.5 else "High"}


@router.get("/videos/{skill_id}")
async def skill_videos(skill_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_topic(db, user.id, skill_id)
    videos = (await db.execute(visible_lessons(skill_id, user.id))).scalars().all()
    return [{"id": str(v.id), "title": v.title, "url": v.url, "display_order": v.display_order,
             "youtube_id": v.youtube_id, "start_sec": v.start_sec, "end_sec": v.end_sec, "duration": v.duration}
            for v in videos]
