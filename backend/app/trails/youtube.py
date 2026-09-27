"""YouTube access: the Data API for video metadata when YOUTUBE_API_KEY is set (servers get bot-blocked),
yt-dlp otherwise and for playlists and captions. Every function here blocks: call it with asyncio.to_thread."""

import asyncio
import json
import re
import urllib.parse
import urllib.request

from app.config import settings

from app.trails.captions import lines_to_text, parse_json3
from app.trails.plan import Item

_LIST = re.compile(r"[?&]list=([A-Za-z0-9_-]+)")
_VIDEO = re.compile(r"(?:[?&]v=|youtu\.be/|/shorts/|/live/|/embed/)([A-Za-z0-9_-]{11})")
LANGS = ["en", "en-US", "en-GB", "en-IN", "hi"]


def parse_ref(url: str) -> tuple[str, str] | None:
    if m := _LIST.search(url):
        return "playlist", m.group(1)
    if m := _VIDEO.search(url):
        return "video", m.group(1)
    return None


def _ydl(**opts):
    import yt_dlp
    return yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True, **opts})


def list_source(url: str) -> dict:
    kind, ref = parse_ref(url) or (None, None)
    if kind == "playlist":
        with _ydl(extract_flat=True) as y:
            info = y.extract_info(f"https://www.youtube.com/playlist?list={ref}", download=False) or {}
        items = [Item(e["id"], e.get("title") or e["id"], e.get("duration"))
                 for e in info.get("entries") or [] if e and e.get("id")]
        return {"title": info.get("title") or ref, "items": items}
    if kind == "video":
        info = video_info(ref)
        return {"title": info.get("title") or ref, "items": [Item(ref, info.get("title") or ref, info.get("duration"))]}
    raise ValueError("Not a YouTube playlist or video link")


def _ytdlp_info(youtube_id: str) -> dict:
    with _ydl() as y:
        return y.extract_info(f"https://www.youtube.com/watch?v={youtube_id}", download=False) or {}


_ISO = re.compile(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")
_TS_LINE = re.compile(r"^\s*((?:\d+:)?\d{1,2}:\d{2})\s*[-–—:|]?\s*(.+?)\s*$")


def iso_seconds(value: str) -> int | None:
    m = _ISO.match(value or "")
    if not value or not m:
        return None
    d, h, mi, sec = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + sec


def chapters_from_description(desc: str, duration: int | None) -> list[dict]:
    """YouTube's own rule: chapters exist when the description lists 3+ timestamps starting at 0:00."""
    marks = []
    for line in (desc or "").splitlines():
        if m := _TS_LINE.match(line):
            parts = [int(x) for x in m.group(1).split(":")]
            marks.append((sum(v * 60 ** i for i, v in enumerate(reversed(parts))), m.group(2)))
    if len(marks) < 3 or marks[0][0] != 0:
        return []
    ends = [s for s, _ in marks[1:]] + [duration or marks[-1][0]]
    return [{"start_time": s, "end_time": e, "title": t} for (s, t), e in zip(marks, ends)]


def _api_info(youtube_id: str) -> dict:
    q = urllib.parse.urlencode({"part": "snippet,contentDetails", "id": youtube_id, "key": settings.youtube_api_key})
    with urllib.request.urlopen(f"https://www.googleapis.com/youtube/v3/videos?{q}", timeout=20) as r:
        items = json.load(r).get("items") or []
    if not items:
        raise ValueError("Video is private or unavailable")
    sn, cd = items[0]["snippet"], items[0]["contentDetails"]
    duration = iso_seconds(cd.get("duration", ""))
    return {"title": sn.get("title"), "channel": sn.get("channelTitle"), "description": sn.get("description"),
            "duration": duration, "chapters": chapters_from_description(sn.get("description", ""), duration)}


def video_info(youtube_id: str) -> dict:
    """Title, channel, description, duration and chapters."""
    if settings.youtube_api_key:
        try:
            return _api_info(youtube_id)
        except Exception:
            pass
    return _ytdlp_info(youtube_id)


def _json3(tracks) -> str | None:
    return next((t["url"] for t in tracks or [] if t.get("ext") == "json3"), None)


def pick_caption_url(info: dict) -> str | None:
    manual, auto = info.get("subtitles") or {}, info.get("automatic_captions") or {}
    for lang in LANGS:
        if url := _json3(manual.get(lang)):
            return url
    for tracks in manual.values():
        if url := _json3(tracks):
            return url
    for lang, tracks in auto.items():
        if lang.endswith("-orig") and (url := _json3(tracks)):
            return url
    for lang in LANGS:
        if url := _json3(auto.get(lang)):
            return url
    return None


def fetch_captions(youtube_id: str, info: dict | None = None) -> str | None:
    info = info or _ytdlp_info(youtube_id)  # the Data API has no caption text
    url = pick_caption_url(info)
    if not url:
        return None
    with urllib.request.urlopen(url, timeout=20) as r:
        text = lines_to_text(parse_json3(json.load(r)))
    return text or None


async def expand_chapters(items: list[Item], long_after: int = 2700) -> list[Item]:
    """Split videos longer than `long_after` seconds at their YouTube chapters; keep them whole otherwise."""
    sem = asyncio.Semaphore(4)

    async def expand(it: Item) -> list[Item]:
        if not it.duration or it.duration <= long_after:
            return [it]
        async with sem:
            try:
                info = await asyncio.to_thread(video_info, it.youtube_id)
            except Exception:
                return [it]
        chapters = info.get("chapters") or []
        if len(chapters) < 2:
            return [it]
        return [
            Item(it.youtube_id, it.title, it.duration, int(c["start_time"]), int(c["end_time"]), (c.get("title") or "").strip()[:200] or None)
            for c in chapters
        ]

    nested = await asyncio.gather(*(expand(it) for it in items))
    return [x for group in nested for x in group]
