"""Course catalogue (iGOT + NSSTA connectors), personalized pathway, enrolment and completion."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.assess.generate import course_mcqs
from app.catalog.connectors import CONNECTORS
from app.catalog.recommend import rank_courses
from app.competency.router import competency_levels
from app.database import async_session, get_db
from app.deps import get_current_user, require_role
from app.models import Assessment, AssessmentQuestion, Course, Enrolment, User
from app.trails.jobs import is_stale, spawn

router = APIRouter(prefix="/api/courses", tags=["courses"])


async def sync_catalogue(db: AsyncSession) -> dict:
    counts = {}
    for conn in CONNECTORS:
        records = await conn.fetch()
        for r in records:
            cid = f"{conn.source}:{r.external_id}"
            c = await db.get(Course, cid) or Course(id=cid, source=conn.source)
            c.title, c.provider, c.programme, c.description = r.title, r.provider, r.programme, r.description
            c.mode, c.duration_hours, c.level, c.competencies, c.url, c.sample = r.mode, r.duration_hours, r.level, r.competencies, r.url, conn.sample
            db.add(c)
        counts[conn.source] = len(records)
    await db.commit()
    return counts


async def all_courses(db: AsyncSession) -> list[Course]:
    rows = (await db.execute(select(Course).order_by(Course.source, Course.title))).scalars().all()
    if not rows:  # first use: pull the catalogue
        await sync_catalogue(db)
        rows = (await db.execute(select(Course).order_by(Course.source, Course.title))).scalars().all()
    return rows


def course_dict(c: Course, e: Enrolment | None = None) -> dict:
    return {
        "id": c.id, "source": c.source, "title": c.title, "provider": c.provider, "programme": c.programme,
        "description": c.description, "mode": c.mode, "duration_hours": c.duration_hours, "level": c.level,
        "competencies": c.competencies, "url": c.url, "sample": c.sample,
        "enrolment": {"status": e.status, "progress": e.progress, "score": e.score,
                      "completed_at": e.completed_at.isoformat() if e.completed_at else None} if e else None,
    }


async def my_enrolments(db: AsyncSession, user_id) -> dict[str, Enrolment]:
    return {e.course_id: e for e in (await db.execute(select(Enrolment).where(Enrolment.user_id == user_id))).scalars()}


@router.post("/sync")
async def sync(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    return {"synced": await sync_catalogue(db)}


@router.get("")
async def catalogue(source: str | None = None, competency: str | None = None, q: str | None = None,
                    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ens = await my_enrolments(db, user.id)
    out = []
    for c in await all_courses(db):
        if source and c.source != source:
            continue
        if competency and competency not in (c.competencies or []):
            continue
        if q and q.lower() not in f"{c.title} {c.description} {c.programme}".lower():
            continue
        out.append(course_dict(c, ens.get(c.id)))
    return out


@router.get("/recommended")
async def recommended(limit: int = 8, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Personalized pathway: courses ranked by how much of the official's role gaps they close."""
    _, levels = await competency_levels(db, user.id)
    courses = await all_courses(db)
    ens = await my_enrolments(db, user.id)
    done = {cid for cid, e in ens.items() if e.status == "completed"}
    by_id = {c.id: c for c in courses}
    return [course_dict(by_id[p.course_id], ens.get(p.course_id)) | {"score": p.score, "reasons": p.reasons}
            for p in rank_courses(courses, levels, done, max(1, min(limit, 30)))]


@router.get("/mine")
async def mine(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ens = await my_enrolments(db, user.id)
    courses = {c.id: c for c in (await db.execute(select(Course).where(Course.id.in_(list(ens))))).scalars()} if ens else {}
    rows = sorted(ens.values(), key=lambda e: (e.status == "completed", e.enrolled_at), reverse=False)
    return [course_dict(courses[e.course_id], e) for e in rows if e.course_id in courses]


async def _course(db: AsyncSession, course_id: str) -> Course:
    c = await db.get(Course, course_id)
    if not c:
        raise HTTPException(status_code=404, detail="Course not found")
    return c


@router.post("/{course_id}/enrol")
async def enrol(course_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    c = await _course(db, course_id)
    e = (await my_enrolments(db, user.id)).get(c.id)
    if not e:
        e = Enrolment(user_id=user.id, course_id=c.id)
        db.add(e)
        await db.commit()
    return course_dict(c, e)


class ProgressBody(BaseModel):
    progress: int = Field(..., ge=0, le=100)


@router.post("/{course_id}/progress")
async def progress(course_id: str, body: ProgressBody, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Progress reported by the catalogue (iGOT sync) or the learner. Completion needs the course quiz."""
    c = await _course(db, course_id)
    e = (await my_enrolments(db, user.id)).get(c.id)
    if not e:
        raise HTTPException(status_code=409, detail="Enrol first")
    if e.status != "completed":
        e.progress = min(body.progress, 99)
    await db.commit()
    return course_dict(c, e)


async def _generate_course_quiz(assessment_id: uuid.UUID, course_id: str):
    async with async_session() as db:
        a = await db.get(Assessment, assessment_id)
        c = await db.get(Course, course_id)
        try:
            await db.commit()  # release the connection during the LLM call
            qs = await course_mcqs(c.title, c.provider, c.description, c.competencies or [])
            if len(qs) < 4:
                raise ValueError("too few questions")
            for i, q in enumerate(qs):
                db.add(AssessmentQuestion(assessment_id=a.id, position=i, **q))
            a.status = "ready"
        except Exception:
            await db.rollback()
            a = await db.get(Assessment, assessment_id)
            a.status = "failed"
        await db.commit()


@router.get("/{course_id}/quiz")
async def course_quiz(course_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Completion quiz for a course (shared by all learners). Passing it (70%) completes the enrolment."""
    c = await _course(db, course_id)
    a = (await db.execute(select(Assessment).where(Assessment.kind == "course", Assessment.course_id == c.id,
                                                   Assessment.status != "failed").order_by(Assessment.created_at.desc()))).scalars().first()
    if a and a.status == "generating" and is_stale(a.created_at, datetime.utcnow()):
        a.status = "failed"
        await db.commit()
        a = None
    if not a:
        a = Assessment(kind="course", title=f"{c.title} - completion quiz", course_id=c.id, competency_ids=c.competencies or [],
                       published=True, status="generating")
        db.add(a)
        await db.commit()
        spawn(_generate_course_quiz(a.id, c.id))
    if a.status != "ready":
        return JSONResponse(status_code=202, content={"id": str(a.id), "status": a.status})
    return {"id": str(a.id), "status": "ready"}
