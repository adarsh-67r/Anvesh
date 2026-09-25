import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import SkillVideo, User

router = APIRouter(prefix="/api/videos", tags=["videos"])

YOUTUBE_VIDEO_RE = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})"
)
YOUTUBE_PLAYLIST_RE = re.compile(r"[?&]list=([a-zA-Z0-9_-]+)")


def extract_video_ids(url: str) -> list[str]:
    """Extract YouTube video IDs from a URL. Handles single videos and playlist URLs."""
    vid = YOUTUBE_VIDEO_RE.search(url)
    return [vid.group(1)] if vid else []


class AddVideoRequest(BaseModel):
    skill_id: str
    url: str
    title: str = ""


class AddPlaylistRequest(BaseModel):
    skill_id: str
    urls: list[str]


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
    count = (
        await db.execute(
            select(SkillVideo).where(SkillVideo.skill_id == body.skill_id, SkillVideo.user_id == user.id)
        )
    ).scalars().all()

    video = SkillVideo(
        skill_id=body.skill_id,
        user_id=user.id,
        title=body.title or body.url,
        url=body.url,
        display_order=len(count),
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return {"id": str(video.id), "title": video.title, "url": video.url}


@router.post("/bulk")
async def add_videos_bulk(body: AddPlaylistRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    count = len(
        (await db.execute(
            select(SkillVideo).where(SkillVideo.skill_id == body.skill_id, SkillVideo.user_id == user.id)
        )).scalars().all()
    )

    added = []
    for i, url in enumerate(body.urls):
        video = SkillVideo(
            skill_id=body.skill_id,
            user_id=user.id,
            title=url,
            url=url,
            display_order=count + i,
        )
        db.add(video)
        added.append(url)

    await db.commit()
    return {"added": len(added), "urls": added}


@router.delete("/{video_id}")
async def delete_video(video_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    video = (await db.execute(select(SkillVideo).where(SkillVideo.id == video_id))).scalar_one_or_none()
    if not video or video.user_id != user.id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Video not found")
    await db.delete(video)
    await db.commit()
    return {"deleted": True}
