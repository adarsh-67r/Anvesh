"""Import a source into a trail: reuse a playlist's shared plan or build a new one, then link topics."""

import asyncio
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.database import async_session
from app.llm import FAST, generate, parse_json
from app.models import Skill, SkillVideo, Source, TopicPlan, TrailTopic
from app.trails import youtube
from app.trails.plan import Item, PlannedTopic, chunk_plan, plan_prompt, validate_plan


def topic_rows(ref: str, version: int, items: list[Item], plan: list[PlannedTopic]) -> tuple[list[dict], list[dict]]:
    ids = [f"{ref}:v{version}:{n}" for n in range(len(plan))]
    skills, lessons = [], []
    for n, t in enumerate(plan):
        skills.append({"id": ids[n], "label": t.title, "summary": t.summary or None, "source_ref": ref,
                       "plan_version": version, "position": n, "prerequisites": [ids[p] for p in t.prerequisites]})
        for order, i in enumerate(t.items):
            it = items[i]
            url = f"https://www.youtube.com/watch?v={it.youtube_id}" + (f"&t={it.start_sec}s" if it.start_sec else "")
            lessons.append({"skill_id": ids[n], "user_id": None,
                            "title": (f"{it.chapter} · {it.title}" if it.chapter else it.title)[:500],
                            "url": url, "youtube_id": it.youtube_id, "start_sec": it.start_sec, "end_sec": it.end_sec,
                            "duration": it.duration, "display_order": order})
    return skills, lessons


async def _existing_topics(db, trail_id, exclude_ref: str) -> list[tuple[str, str]]:
    rows = (await db.execute(
        select(Skill.id, Skill.label).join(TrailTopic, TrailTopic.skill_id == Skill.id)
        .where(TrailTopic.trail_id == trail_id, Skill.source_ref != exclude_ref)
        .order_by(TrailTopic.position)
    )).all()
    return [(sid, label) for sid, label in rows]


async def _latest_plan(db, ref: str) -> TopicPlan | None:
    plans = (await db.execute(select(TopicPlan).where(TopicPlan.source_ref == ref))).scalars().all()
    usable = [p for p in plans if p.version > 0]
    return max(usable, key=lambda p: (p.method == "gemini", p.version), default=None)


async def _build_plan(db, src: Source, existing: list[tuple[str, str]]) -> tuple[int, list[PlannedTopic], list[Item], str, str]:
    info = await asyncio.to_thread(youtube.list_source, src.url)
    items = await youtube.expand_chapters(info["items"])
    if not items:
        raise ValueError("No videos found at this link")
    version = ((await db.execute(select(func.max(TopicPlan.version)).where(TopicPlan.source_ref == src.source_ref))).scalar() or 0) + 1
    try:
        raw = parse_json(await generate(plan_prompt(items, existing), FAST))
        plan, method = validate_plan(raw, len(items), {sid for sid, _ in existing}), "gemini"
    except Exception:
        plan, method = chunk_plan(items), "chunked"
    return version, plan, items, method, info["title"]


async def _detect_overlap(new: list[tuple[str, str]], existing: list[tuple[str, str]]) -> dict[str, dict]:
    """For a reused plan: which new topics match or depend on existing ones. Empty on any failure."""
    if not existing:
        return {}
    prompt = (
        "Existing topics (id: title):\n" + "\n".join(f"{i}: {t}" for i, t in existing) +
        "\n\nNew topics (id: title):\n" + "\n".join(f"{i}: {t}" for i, t in new) +
        '\n\nReturn ONLY JSON: {"<new id>": {"same_as": [existing ids teaching the same thing], '
        '"needs_existing": [existing ids that are prerequisites]}}. Omit new topics with no links.'
    )
    try:
        raw = parse_json(await generate(prompt, FAST))
        known = {i for i, _ in existing}
        return {k: {"same_as": [e for e in v.get("same_as", []) if e in known],
                    "needs_existing": [e for e in v.get("needs_existing", []) if e in known]}
                for k, v in raw.items() if isinstance(v, dict)}
    except Exception:
        return {}


async def run_import(source_id: UUID, rebuild: bool = False, _retry: bool = True) -> None:
    async with async_session() as db:
        src = await db.get(Source, source_id)
        if not src:
            return
        try:
            existing = await _existing_topics(db, src.trail_id, src.source_ref)
            plan_row = None if rebuild else await _latest_plan(db, src.source_ref)
            links: dict[str, dict] = {}
            if plan_row:
                version = plan_row.version
                skills = (await db.execute(
                    select(Skill).where(Skill.source_ref == src.source_ref, Skill.plan_version == version).order_by(Skill.position)
                )).scalars().all()
                skill_ids = [s.id for s in skills]
                src.title = src.title or plan_row.title
                links = await _detect_overlap([(s.id, s.label) for s in skills], existing)
            else:
                version, plan, items, method, title = await _build_plan(db, src, existing)
                skill_dicts, lesson_dicts = topic_rows(src.source_ref, version, items, plan)
                db.add(TopicPlan(source_ref=src.source_ref, version=version, method=method, title=title[:500]))
                for s in skill_dicts:
                    db.add(Skill(**s))
                for l in lesson_dicts:
                    db.add(SkillVideo(**l))
                skill_ids = [s["id"] for s in skill_dicts]
                links = {skill_ids[n]: {"same_as": t.same_as, "needs_existing": t.needs_existing}
                         for n, t in enumerate(plan) if t.same_as or t.needs_existing}
                src.title = title[:500]

            # Rebuild: unlink this trail's topics from older versions of the same source.
            old = (await db.execute(
                select(TrailTopic).join(Skill, Skill.id == TrailTopic.skill_id)
                .where(TrailTopic.trail_id == src.trail_id, Skill.source_ref == src.source_ref)
            )).scalars().all()
            for tt in old:
                await db.delete(tt)

            base = ((await db.execute(select(func.max(TrailTopic.position)).where(TrailTopic.trail_id == src.trail_id))).scalar() or -1) + 1
            shared_prereqs = {s.id: s.prerequisites for s in (await db.execute(select(Skill).where(Skill.id.in_(skill_ids)))).scalars()} if plan_row else {}
            for n, sid in enumerate(skill_ids):
                link = links.get(sid, {})
                override = None
                if link.get("needs_existing"):
                    own = shared_prereqs.get(sid) if plan_row else next(s["prerequisites"] for s in skill_dicts if s["id"] == sid)
                    override = list(dict.fromkeys((own or []) + link["needs_existing"]))
                db.add(TrailTopic(trail_id=src.trail_id, skill_id=sid, position=base + n,
                                  prerequisites_override=override, equivalent_to=link.get("same_as", [])))
            # Make overlap links symmetric on the existing side.
            for sid, link in links.items():
                for other in link.get("same_as", []):
                    tt = await db.get(TrailTopic, (src.trail_id, other))
                    if tt and sid not in (tt.equivalent_to or []):
                        tt.equivalent_to = [*(tt.equivalent_to or []), sid]

            src.plan_version, src.status, src.error = version, "ready", None
            await db.commit()
        except IntegrityError:
            # Another import built the same playlist's plan first: reuse it.
            await db.rollback()
            if _retry:
                await run_import(source_id, rebuild=False, _retry=False)
        except Exception as e:
            await db.rollback()
            await db.execute(update(Source).where(Source.id == source_id).values(status="failed", error=str(e)[:300]))
            await db.commit()
