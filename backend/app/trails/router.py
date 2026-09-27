import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.game import _ready_questions
from app.deps import get_current_user
from app.models import SkillVideo, Source, TopicNotes, Trail, User
from app.recommendation.router import build_graph
from app.trails import youtube
from app.trails.grounding import ensure_notes
from app.trails.importer import run_import
from app.trails.jobs import is_stale, spawn
from app.trails.scope import require_topic

router = APIRouter(prefix="/api/trails", tags=["trails"])
topics_router = APIRouter(prefix="/api/topics", tags=["topics"])


class NewTrail(BaseModel):
    title: str
    url: str


class NewSource(BaseModel):
    url: str


async def _own_trail(db: AsyncSession, trail_id: str, user_id) -> Trail:
    try:
        trail = await db.get(Trail, uuid.UUID(trail_id))
    except ValueError:
        trail = None
    if not trail or trail.user_id != user_id:
        raise HTTPException(status_code=404, detail="Trail not found")
    return trail


async def _add_source(db: AsyncSession, trail: Trail, user_id, url: str) -> Source:
    ref = youtube.parse_ref(url.strip())
    if not ref:
        raise HTTPException(status_code=400, detail="Paste a YouTube playlist or video link")
    kind, source_ref = ref
    clash = (await db.execute(
        select(Trail.title).join(Source, Source.trail_id == Trail.id)
        .where(Trail.user_id == user_id, Source.source_ref == source_ref)
    )).scalar()
    if clash:
        raise HTTPException(status_code=409, detail=f"Already in your {clash}")
    src = Source(trail_id=trail.id, kind=kind, url=url.strip(), source_ref=source_ref)
    db.add(src)
    await db.commit()
    await db.refresh(src)
    spawn(run_import(src.id))
    return src


@router.post("")
async def create_trail(body: NewTrail, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    title = body.title.strip()[:200]
    if not title:
        raise HTTPException(status_code=400, detail="Give your trail a name")
    if not youtube.parse_ref(body.url.strip()):
        raise HTTPException(status_code=400, detail="Paste a YouTube playlist or video link")
    trail = Trail(user_id=user.id, title=title)
    db.add(trail)
    await db.flush()
    try:
        await _add_source(db, trail, user.id, body.url)
    except HTTPException:
        await db.rollback()
        raise
    return {"id": str(trail.id), "title": trail.title}


@router.get("")
async def list_trails(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trails = (await db.execute(select(Trail).where(Trail.user_id == user.id).order_by(Trail.created_at))).scalars().all()
    graph = await build_graph(db, user.id)
    out = []
    for t in trails:
        sources = (await db.execute(select(Source).where(Source.trail_id == t.id))).scalars().all()
        nodes = [n for n in graph if n["trail_id"] == str(t.id)]
        nxt = next((n for n in nodes if n["status"] == "available"), None)
        out.append({
            "id": str(t.id), "title": t.title, "source_count": len(sources), "topic_count": len(nodes),
            "mastered_count": sum(n["status"] in ("mastered", "covered") for n in nodes),
            "importing": any(s.status == "importing" for s in sources),
            "next_topic": {"id": nxt["id"], "label": nxt["label"]} if nxt else None,
        })
    return out


@router.get("/{trail_id}")
async def get_trail(trail_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trail = await _own_trail(db, trail_id, user.id)
    sources = (await db.execute(select(Source).where(Source.trail_id == trail.id).order_by(Source.updated_at))).scalars().all()
    now = datetime.utcnow()
    for s in sources:
        if s.status == "importing" and is_stale(s.updated_at, now):
            claimed = await db.execute(
                update(Source).where(Source.id == s.id, Source.updated_at == s.updated_at).values(updated_at=now)
            )
            await db.commit()
            if claimed.rowcount == 1:
                spawn(run_import(s.id))
    topics = await build_graph(db, user.id, str(trail.id))
    per_source: dict[str, int] = {}
    for n in topics:
        per_source[n["source_ref"]] = per_source.get(n["source_ref"], 0) + 1
    return {
        "id": str(trail.id), "title": trail.title,
        "sources": [{"id": str(s.id), "kind": s.kind, "url": s.url, "title": s.title, "status": s.status,
                     "error": s.error, "topic_count": per_source.get(s.source_ref, 0)} for s in sources],
        "topics": topics,
    }


@router.post("/{trail_id}/sources")
async def add_source(trail_id: str, body: NewSource, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trail = await _own_trail(db, trail_id, user.id)
    src = await _add_source(db, trail, user.id, body.url)
    return {"id": str(src.id), "status": src.status}


async def _own_source(db, trail_id, source_id, user_id) -> Source:
    trail = await _own_trail(db, trail_id, user_id)
    try:
        src = await db.get(Source, uuid.UUID(source_id))
    except ValueError:
        src = None
    if not src or src.trail_id != trail.id:
        raise HTTPException(status_code=404, detail="Source not found")
    return src


@router.post("/{trail_id}/sources/{source_id}/retry")
async def retry_source(trail_id: str, source_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    src = await _own_source(db, trail_id, source_id, user.id)
    if src.status != "failed":
        raise HTTPException(status_code=409, detail="Only a failed source can be retried")
    src.status, src.error = "importing", None
    await db.commit()
    spawn(run_import(src.id))
    return {"status": "importing"}


@router.post("/{trail_id}/sources/{source_id}/rebuild")
async def rebuild_source(trail_id: str, source_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    src = await _own_source(db, trail_id, source_id, user.id)
    if src.status == "importing":
        raise HTTPException(status_code=409, detail="Already importing")
    src.status, src.error = "importing", None
    await db.commit()
    spawn(run_import(src.id, rebuild=True))
    return {"status": "importing"}


@router.delete("/{trail_id}")
async def delete_trail(trail_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trail = await _own_trail(db, trail_id, user.id)
    await db.delete(trail)  # sources and trail_topics cascade; shared topics stay
    await db.commit()
    return {"deleted": True}


async def notes_payload(db, notes: TopicNotes | None) -> dict:
    if not notes:
        return {"status": "none", "progress": "", "summary": None, "method": None, "concepts": []}
    concepts = notes.concepts or []
    ids = {uuid.UUID(c["lesson_id"]) for c in concepts if c.get("lesson_id")}
    lessons = {str(v.id): v for v in (await db.execute(select(SkillVideo).where(SkillVideo.id.in_(ids)))).scalars()} if ids else {}
    return {
        "status": notes.status, "progress": notes.progress, "summary": notes.summary, "method": notes.method,
        "concepts": [{**c, "lesson_title": lessons[c["lesson_id"]].title if c.get("lesson_id") in lessons else None,
                      "lesson_index": lessons[c["lesson_id"]].display_order + 1 if c.get("lesson_id") in lessons else None}
                     for c in concepts],
    }


@topics_router.get("/{skill_id}/notes")
async def topic_notes(skill_id: str, prepare: bool = False, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_topic(db, user.id, skill_id)
    notes = await ensure_notes(db, skill_id) if prepare else await db.get(TopicNotes, skill_id)
    return await notes_payload(db, notes)


@topics_router.get("/{skill_id}/lessons/{lesson_id}/check")
async def lesson_check(skill_id: str, lesson_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Lesson not found")
    ready, wait = await _ready_questions(db, user, skill_id, 3, lid)
    if wait:
        return wait
    _, method, questions = ready
    return {"method": method, "questions": questions}
