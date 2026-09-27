"""Ground a topic in its lectures: lecture text per lesson, then key concepts, then questions."""

import asyncio
from collections import Counter
from datetime import datetime, timedelta

from google import genai
from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import async_session
from app.llm import FAST, LOW_RES_VIDEO, generate, parse_json
from app.models import SkillVideo, TopicNotes, VideoContext
from app.trails import youtube
from app.trails.captions import parse_ts, shift_text, slice_text, trim
from app.trails.jobs import STALE_MINUTES, spawn

DAILY_WATCH_LIMIT = 7 * 3600
CLIP_SUPPORTED = True          # from Task 0
MAX_UNCLIPPED_SECONDS = 2 * 3600
TOPIC_CHARS = 120_000
FAILED_RETRY_MINUTES = 1


def can_watch(used_seconds: int, needed_seconds: int) -> bool:
    return used_seconds + needed_seconds <= DAILY_WATCH_LIMIT


def topic_method(methods: list[str]) -> str:
    real = [m for m in methods if m != "titles"]
    return Counter(real).most_common(1)[0][0] if real else "titles"


def _key(youtube_id: str, start, end) -> str:
    return f"{youtube_id}:{start or 0}:{end or 0}"


async def claim_topic(db, skill_id: str) -> bool:
    """Take the job for this topic. True if this caller should run it."""
    res = await db.execute(pg_insert(TopicNotes).values(skill_id=skill_id, status="preparing", progress="")
                           .on_conflict_do_nothing())
    await db.commit()
    if res.rowcount == 1:
        return True
    now = datetime.utcnow()
    res = await db.execute(
        update(TopicNotes).where(
            TopicNotes.skill_id == skill_id,
            or_(
                (TopicNotes.status == "preparing") & (TopicNotes.updated_at < now - timedelta(minutes=STALE_MINUTES)),
                (TopicNotes.status == "failed") & (TopicNotes.updated_at < now - timedelta(minutes=FAILED_RETRY_MINUTES)),
            ),
        ).values(status="preparing", progress="", updated_at=now)
    )
    await db.commit()
    return res.rowcount == 1


async def ensure_notes(db, skill_id: str) -> TopicNotes:
    if await claim_topic(db, skill_id):
        spawn(run_grounding(skill_id))
    notes = await db.get(TopicNotes, skill_id)
    await db.refresh(notes)
    return notes


async def _watched_today(db) -> int:
    since = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return (await db.execute(
        select(func.coalesce(func.sum(VideoContext.seconds), 0)).where(VideoContext.method == "gemini", VideoContext.created_at >= since)
    )).scalar()


async def watch_video(youtube_id: str, start: int | None, end: int | None) -> str:
    video = genai.types.Part(
        file_data=genai.types.FileData(file_uri=f"https://www.youtube.com/watch?v={youtube_id}"),
        video_metadata=genai.types.VideoMetadata(start_offset=f"{start}s", end_offset=f"{end}s") if CLIP_SUPPORTED and (start or end) else None,
    )
    text = await generate([video, (
        "Write detailed notes of what this lecture teaches: definitions, steps, examples, code ideas, formulas. "
        "One line per point, each starting with a timestamp [m:ss] measured from the start of this video clip. "
        "Write in English even if the lecture is in Hindi."
    )], LOW_RES_VIDEO)
    return shift_text(text, start or 0) if CLIP_SUPPORTED and start else text


async def lesson_context(db, lesson: SkillVideo) -> tuple[str, str]:
    """(timestamped lecture text, method). Cheapest source first; never raises."""
    yid, start, end = lesson.youtube_id, lesson.start_sec, lesson.end_sec
    if not yid:
        return lesson.title, "titles"
    if cached := await db.get(VideoContext, _key(yid, start, end)):
        return cached.text, cached.method
    whole = await db.get(VideoContext, _key(yid, None, None))
    if whole and whole.method == "captions" and (start or end):
        return slice_text(whole.text, start, end), "captions"

    await db.commit()  # release the pooled connection during the slow calls below
    try:
        captions = await asyncio.to_thread(youtube.fetch_captions, yid)
    except Exception:
        captions = None
    if captions:
        if not whole:
            db.add(VideoContext(key=_key(yid, None, None), youtube_id=yid, text=captions, method="captions"))
        part = slice_text(captions, start, end)
        if start or end:
            db.add(VideoContext(key=_key(yid, start, end), youtube_id=yid, text=part, method="captions"))
        await db.commit()
        return part, "captions"

    length = (end or lesson.duration or 0) - (start or 0)
    too_long = not CLIP_SUPPORTED and (lesson.duration or 0) > MAX_UNCLIPPED_SECONDS
    if length and not too_long and can_watch(await _watched_today(db), length):
        await db.commit()
        try:
            text = await watch_video(yid, start, end)
            db.add(VideoContext(key=_key(yid, start, end), youtube_id=yid, text=text, method="gemini", seconds=length))
            await db.commit()
            return text, "gemini"
        except Exception:
            await db.rollback()
    return lesson.title, "titles"


NOTES_PROMPT = (
    "Below are the lessons of one topic, with lecture text. Timestamps are positions in each lesson's video.\n"
    "Return ONLY JSON: {{\"summary\": two sentences, \"concepts\": [{{\"concept\": short name, \"explanation\": 1-3 sentences, "
    "\"lesson\": lesson number, \"timestamp\": \"m:ss\" where it is taught or null}}]}} with 8 to 15 concepts "
    "that a student must understand. Use only what the lessons teach. Write in English.\n\n{body}"
)


async def run_grounding(skill_id: str) -> None:
    from app.trails.questions import generate_questions

    async with async_session() as db:
        try:
            lessons = (await db.execute(
                select(SkillVideo).where(SkillVideo.skill_id == skill_id, SkillVideo.user_id.is_(None))
                .order_by(SkillVideo.display_order)
            )).scalars().all()
            texts, methods = [], []
            for n, lesson in enumerate(lessons, 1):
                await db.execute(update(TopicNotes).where(TopicNotes.skill_id == skill_id)
                                 .values(progress=f"{n} of {len(lessons)} lessons", updated_at=datetime.utcnow()))
                await db.commit()
                text, method = await lesson_context(db, lesson)
                texts.append(text)
                methods.append(method)

            per = TOPIC_CHARS // max(1, len(lessons))
            body = "\n\n".join(f"Lesson {n}: {l.title}\n{trim(t, per)}" for n, (l, t) in enumerate(zip(lessons, texts), 1))
            await db.commit()  # release the pooled connection during the slow call
            raw = parse_json(await generate(NOTES_PROMPT.format(body=body), FAST))
            concepts = []
            for c in raw.get("concepts") or []:
                n = c.get("lesson")
                lesson = lessons[n - 1] if isinstance(n, int) and 1 <= n <= len(lessons) else None
                concepts.append({
                    "concept": str(c.get("concept") or "")[:300], "explanation": str(c.get("explanation") or ""),
                    "lesson_id": str(lesson.id) if lesson else None,
                    "timestamp_sec": parse_ts(c["timestamp"]) if lesson and c.get("timestamp") else None,
                })
            concepts = [c for c in concepts if c["concept"]]
            if not concepts:
                raise ValueError("no concepts")
            await generate_questions(db, skill_id, concepts, 12)
            await db.execute(update(TopicNotes).where(TopicNotes.skill_id == skill_id).values(
                status="ready", summary=str(raw.get("summary") or "")[:2000], concepts=concepts,
                method=topic_method(methods), progress="", updated_at=datetime.utcnow()))
            await db.commit()
        except Exception as e:
            await db.rollback()
            await db.execute(update(TopicNotes).where(TopicNotes.skill_id == skill_id)
                             .values(status="failed", progress=str(e)[:40], updated_at=datetime.utcnow()))
            await db.commit()
