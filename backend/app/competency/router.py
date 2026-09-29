"""Competency framework, official profile, and each official's levels and skill gaps."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.competency.framework import BY_ID, COMPETENCIES, DOMAINS, ROLE_BY_ID, ROLES
from app.competency.levels import ProfileText, build_levels, comp_skill_id, ranked_gaps
from app.database import get_db
from app.deps import get_current_user
from app.models import OfficialProfile, SkillMastery, User

router = APIRouter(prefix="/api/competency", tags=["competency"])


@router.get("/framework")
async def framework():
    return {
        "domains": [{"id": k, "name": v} for k, v in DOMAINS.items()],
        "competencies": [
            {"id": c.id, "name": c.name, "domain": c.domain, "description": c.description, "prerequisites": list(c.prerequisites)}
            for c in COMPETENCIES
        ],
        "roles": [
            {"id": r.id, "name": r.name, "cadre": r.cadre, "description": r.description, "requirements": r.requirements}
            for r in ROLES
        ],
    }


class ProfileBody(BaseModel):
    designation: str = Field("", max_length=150)
    role_id: str | None = None
    cadre: str = Field("", max_length=40)
    department: str = Field("", max_length=150)
    division: str = Field("", max_length=150)
    current_assignment: str = Field("", max_length=300)
    qualifications: list[str] = Field(default_factory=list, max_length=20)
    experience_years: int = Field(0, ge=0, le=45)
    past_trainings: list[str] = Field(default_factory=list, max_length=60)


def profile_dict(p: OfficialProfile | None) -> dict | None:
    if not p:
        return None
    return {
        "designation": p.designation, "role_id": p.role_id, "cadre": p.cadre, "department": p.department,
        "division": p.division, "current_assignment": p.current_assignment, "qualifications": p.qualifications or [],
        "experience_years": p.experience_years, "past_trainings": p.past_trainings or [],
    }


@router.get("/profile")
async def get_profile(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"profile": profile_dict(await db.get(OfficialProfile, user.id))}


@router.put("/profile")
async def put_profile(body: ProfileBody, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.role_id and body.role_id not in ROLE_BY_ID:
        raise HTTPException(status_code=400, detail="Unknown role")
    clean = lambda xs: [x.strip()[:200] for x in xs if x.strip()]  # noqa: E731
    p = await db.get(OfficialProfile, user.id) or OfficialProfile(user_id=user.id)
    for k, v in body.model_dump().items():
        setattr(p, k, clean(v) if isinstance(v, list) else (v.strip() if isinstance(v, str) else v))
    if p.role_id:
        p.cadre = ROLE_BY_ID[p.role_id].cadre
    db.add(p)
    await db.commit()
    return {"profile": profile_dict(p)}


async def competency_levels(db: AsyncSession, user_id) -> tuple[OfficialProfile | None, list]:
    p = await db.get(OfficialProfile, user_id)
    rows = (await db.execute(
        select(SkillMastery).where(SkillMastery.user_id == user_id, SkillMastery.skill_id.like("comp:%"))
    )).scalars().all()
    assessed = {r.skill_id.removeprefix("comp:"): r.mastery_score for r in rows if r.skill_id.removeprefix("comp:") in BY_ID}
    text = ProfileText(
        qualifications=(p.qualifications if p else []) or [], past_trainings=(p.past_trainings if p else []) or [],
        current_assignment=p.current_assignment if p else "", experience_years=p.experience_years if p else 0,
    )
    role = ROLE_BY_ID.get(p.role_id) if p and p.role_id else None
    return p, build_levels(role, text, assessed)


@router.get("/me")
async def my_competencies(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p, levels = await competency_levels(db, user.id)
    role = ROLE_BY_ID.get(p.role_id) if p and p.role_id else None
    required = [lv for lv in levels if lv.required]
    met = sum(1 for lv in required if lv.gap == 0)
    return {
        "role": {"id": role.id, "name": role.name} if role else None,
        "profile_complete": bool(p and p.role_id),
        "summary": {
            "required": len(required), "met": met, "gaps": len(required) - met,
            "readiness": round(100 * sum(min(lv.current, lv.required) for lv in required) / max(1, sum(lv.required for lv in required))),
        },
        "levels": [lv.__dict__ | {"skill_id": comp_skill_id(lv.id)} for lv in levels],
        "gaps": [lv.__dict__ for lv in ranked_gaps(levels)],
    }
