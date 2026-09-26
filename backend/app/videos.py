import asyncio
import re
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Skill, SkillVideo, User

router = APIRouter(prefix="/api/videos", tags=["videos"])

YOUTUBE_PLAYLIST_RE = re.compile(r"[?&]list=([a-zA-Z0-9_-]+)")

_executor = ThreadPoolExecutor(max_workers=2)


def _extract_playlist(url: str) -> dict:
    """Use yt-dlp to extract playlist title + video entries."""
    try:
        import yt_dlp
    except ImportError:
        return {"title": "", "entries": []}
    opts = {"quiet": True, "extract_flat": True, "no_warnings": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if not info:
            return {"title": "", "entries": []}
        entries = [
            {"id": e["id"], "title": e.get("title") or e["id"], "url": f"https://www.youtube.com/watch?v={e['id']}"}
            for e in (info.get("entries") or []) if e and e.get("id")
        ]
        return {"title": info.get("title", ""), "entries": entries}


def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
    return slug[:100] if slug else "untitled"


class AddVideoRequest(BaseModel):
    skill_id: str = ""
    url: str
    title: str = ""


async def _ensure_skill(db: AsyncSession, skill_id: str, label: str, source_url: str = "") -> Skill:
    """Create skill if it doesn't exist, return it."""
    existing = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if existing:
        return existing
    skill = Skill(id=skill_id, label=label, source_url=source_url or None)
    db.add(skill)
    await db.flush()
    return skill


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
    is_playlist = bool(YOUTUBE_PLAYLIST_RE.search(body.url))

    if is_playlist:
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(_executor, _extract_playlist, body.url)
        entries = data["entries"]
        playlist_title = data["title"]
        if not entries:
            raise HTTPException(status_code=400, detail="Could not extract videos from playlist")

        skill_id = body.skill_id or _slugify(playlist_title)
        label = body.title or playlist_title or skill_id
        await _ensure_skill(db, skill_id, label, body.url)

        existing = (
            await db.execute(
                select(SkillVideo).where(SkillVideo.skill_id == skill_id, SkillVideo.user_id == user.id)
            )
        ).scalars().all()
        existing_urls = {v.url for v in existing}
        offset = len(existing)

        added = []
        for i, e in enumerate(entries):
            if e["url"] not in existing_urls:
                db.add(SkillVideo(
                    skill_id=skill_id, user_id=user.id,
                    title=e["title"], url=e["url"], display_order=offset + i,
                ))
                added.append(e["title"])
        await db.commit()
        return {"skill_id": skill_id, "skill_label": label, "added": len(added), "total_in_playlist": len(entries)}

    # Single video
    if not body.skill_id:
        raise HTTPException(status_code=400, detail="skill_id required for single videos")

    await _ensure_skill(db, body.skill_id, body.skill_id)

    existing = (
        await db.execute(
            select(SkillVideo).where(SkillVideo.skill_id == body.skill_id, SkillVideo.user_id == user.id)
        )
    ).scalars().all()

    video = SkillVideo(
        skill_id=body.skill_id, user_id=user.id,
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
