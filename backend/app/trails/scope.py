"""Which topics a student can see: those in their trails, with trail-level prerequisites applied."""

from dataclasses import dataclass, field

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Skill, Trail, TrailTopic


@dataclass
class TopicView:
    id: str
    label: str
    subject: str
    prerequisites: list[str]
    depth: int
    position: int
    trail_id: str
    trail_title: str
    summary: str | None = None
    equivalent_to: list[str] = field(default_factory=list)
    source_ref: str | None = None


def resolve_topics(rows) -> list[TopicView]:
    rows = sorted(rows, key=lambda r: (str(r[2].created_at), str(r[2].id), r[1].position))
    visible = {skill.id for skill, _, _ in rows}
    prereqs = {}
    for skill, tt, _ in rows:
        base = tt.prerequisites_override if tt.prerequisites_override is not None else (skill.prerequisites or [])
        prereqs[skill.id] = [p for p in dict.fromkeys(base) if p in visible and p != skill.id]

    memo: dict[str, int] = {}

    def depth(sid: str, seen: frozenset = frozenset()) -> int:
        if sid in memo:
            return memo[sid]
        if sid in seen:  # cycles are rejected on write; guard anyway
            return 0
        d = 1 + max((depth(p, seen | {sid}) for p in prereqs[sid]), default=-1)
        memo[sid] = d
        return d

    return [
        TopicView(
            id=skill.id, label=skill.label, subject=skill.subject, prerequisites=prereqs[skill.id],
            depth=depth(skill.id), position=tt.position, trail_id=str(trail.id), trail_title=trail.title,
            summary=skill.summary, equivalent_to=[e for e in tt.equivalent_to or [] if e in visible],
            source_ref=skill.source_ref,
        )
        for skill, tt, trail in rows
    ]


async def user_skills(db: AsyncSession, user_id) -> list[TopicView]:
    rows = (
        await db.execute(
            select(Skill, TrailTopic, Trail)
            .join(TrailTopic, TrailTopic.skill_id == Skill.id)
            .join(Trail, Trail.id == TrailTopic.trail_id)
            .where(Trail.user_id == user_id)
        )
    ).all()
    return resolve_topics([tuple(r) for r in rows])


async def require_topic(db: AsyncSession, user_id, skill_id: str) -> TopicView:
    for t in await user_skills(db, user_id):
        if t.id == skill_id:
            return t
    raise HTTPException(status_code=404, detail="Topic not found")
