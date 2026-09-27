import asyncio
import re
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Skill, SkillVideo, TopicNotes, User
from app.recommendation.router import visible_lessons
from app.trails.scope import require_topic
from app.trails.youtube import parse_ref

router = APIRouter(prefix="/api/videos", tags=["videos"])

YOUTUBE_PLAYLIST_RE = re.compile(r"[?&]list=([a-zA-Z0-9_-]+)")

_executor = ThreadPoolExecutor(max_workers=2)


class AddVideoRequest(BaseModel):
    skill_id: str = ""
    url: str
    title: str = ""


# ponytail: in-process cache of YouTube metadata; a restart re-fetches, fine at demo scale
_detail_cache: dict[str, dict] = {}


def _extract_video(url: str) -> dict:
    """Channel, description and duration for one video; empty on any failure."""
    try:
        import yt_dlp
        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
            info = ydl.extract_info(url, download=False) or {}
        return {
            "channel": info.get("channel") or info.get("uploader"),
            "description": (info.get("description") or "").strip()[:4000] or None,
            "duration": info.get("duration"),
        }
    except Exception:
        return {"channel": None, "description": None, "duration": None}


@router.get("/detail/{video_id}")
async def video_detail(video_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    video = await db.get(SkillVideo, video_id)
    if not video or video.user_id not in (None, user.id):
        raise HTTPException(status_code=404, detail="Video not found")
    await require_topic(db, user.id, video.skill_id)
    skill = await db.get(Skill, video.skill_id)
    lessons = (await db.execute(visible_lessons(video.skill_id, user.id))).scalars().all()
    notes = await db.get(TopicNotes, video.skill_id)
    concepts = [c for c in (notes.concepts or []) if c.get("lesson_id") == str(video.id)] if notes and notes.status == "ready" else []

    if video.url not in _detail_cache:
        loop = asyncio.get_running_loop()
        _detail_cache[video.url] = await loop.run_in_executor(_executor, _extract_video, video.url)

    ids = [l.id for l in lessons]
    return {
        "id": str(video.id),
        "title": video.title,
        "url": video.url,
        "skill_id": video.skill_id,
        "skill_label": skill.label if skill else video.skill_id,
        "index": ids.index(video.id) + 1 if video.id in ids else None,
        "total": len(lessons),
        **_detail_cache[video.url],
        "youtube_id": video.youtube_id,
        "start_sec": video.start_sec,
        "end_sec": video.end_sec,
        "concepts": concepts,
        "lessons": [
            {"id": str(l.id), "title": l.title, "url": l.url, "start_sec": l.start_sec, "end_sec": l.end_sec} for l in lessons
        ],
    }


@router.get("/{skill_id}")
async def get_videos(skill_id: str, db: AsyncSession = Depends(get_db)):
    videos = (
        await db.execute(
            select(SkillVideo).where(SkillVideo.skill_id == skill_id).order_by(SkillVideo.display_order)
        )
    ).scalars().all()
    return [{"id": str(v.id), "title": v.title, "url": v.url, "display_order": v.display_order} for v in videos]


@router.post("")
async def add_video(body: AddVideoRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if YOUTUBE_PLAYLIST_RE.search(body.url):
        raise HTTPException(status_code=400, detail="Add playlists from a trail's Sources section")
    if not body.skill_id:
        raise HTTPException(status_code=400, detail="skill_id required")
    await require_topic(db, user.id, body.skill_id)
    ref = parse_ref(body.url)
    if not ref or ref[0] != "video":
        raise HTTPException(status_code=400, detail="Paste a YouTube video link")

    existing = (
        await db.execute(
            select(SkillVideo).where(SkillVideo.skill_id == body.skill_id, SkillVideo.user_id == user.id)
        )
    ).scalars().all()

    video = SkillVideo(
        skill_id=body.skill_id, user_id=user.id, youtube_id=ref[1],
        title=body.title or body.url, url=body.url,
        display_order=len(existing),
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return {"id": str(video.id), "title": video.title, "url": video.url}


@router.delete("/{video_id}")
async def delete_video(video_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    video = (await db.execute(select(SkillVideo).where(SkillVideo.id == video_id))).scalar_one_or_none()
    if not video or video.user_id != user.id:
        raise HTTPException(status_code=404, detail="Video not found")
    await db.delete(video)
    await db.commit()
    return {"deleted": True}
