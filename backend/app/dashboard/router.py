"""Learner and administrator dashboards, and user role management."""

import uuid
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.competency.framework import COMPETENCIES, DOMAINS, ROLE_BY_ID
from app.competency.levels import CompetencyLevel, ranked_gaps
from app.competency.router import competency_levels, levels_for
from app.database import get_db
from app.deps import get_current_user, require_role
from app.models import Assessment, AssessmentQuestion, Attempt, Course, Enrolment, LearningEvent, OfficialProfile, SkillMastery, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
MIN_RESPONSES = 3  # before a question's hit rate counts
EMERGING = {"ai_ml", "cloud_computing", "apis", "open_data", "government_cloud", "dpi", "cybersecurity", "data_privacy", "python", "gis"}


def readiness(levels: list[CompetencyLevel]) -> int:
    req = [lv for lv in levels if lv.required]
    return round(100 * sum(min(lv.current, lv.required) for lv in req) / max(1, sum(lv.required for lv in req)))


def projected(levels: list[CompetencyLevel], courses: list[Course]) -> list[CompetencyLevel]:
    """Levels if the official completes the courses they're enrolled in (each lifts its competencies to its level)."""
    lift = defaultdict(float)
    for c in courses:
        for cid in c.competencies or []:
            lift[cid] = max(lift[cid], c.level)
    return [CompetencyLevel(lv.id, lv.name, lv.domain, lv.required, max(lv.current, min(lift[lv.id], 5)) if lv.id in lift else lv.current,
                            lv.source, max(0.0, lv.required - max(lv.current, lift.get(lv.id, 0)))) for lv in levels]


def by_domain(levels: list[CompetencyLevel]) -> list[dict]:
    out = []
    for d, name in DOMAINS.items():
        req = [lv for lv in levels if lv.domain == d and lv.required]
        out.append({"domain": d, "name": name, "competencies": len(req),
                    "current": round(sum(lv.current for lv in req) / len(req), 1) if req else None,
                    "required": round(sum(lv.required for lv in req) / len(req), 1) if req else None})
    return out


async def learning_hours(db: AsyncSession, user_id) -> float:
    ens = (await db.execute(select(Enrolment, Course).join(Course, Course.id == Enrolment.course_id)
                            .where(Enrolment.user_id == user_id))).all()
    course_h = sum(c.duration_hours * (1 if e.status == "completed" else e.progress / 100) for e, c in ens)
    minutes = (await db.execute(select(LearningEvent.context).where(
        LearningEvent.user_id == user_id, LearningEvent.event_type == "study_session"))).scalars().all()
    return round(course_h + sum(int((m or {}).get("minutes", 0) or 0) for m in minutes) / 60, 1)


async def officials_levels(db: AsyncSession, profiles: list[OfficialProfile] | None = None) -> list[tuple[OfficialProfile, list[CompetencyLevel]]]:
    """Every profiled official with their competency levels (mastery bulk-loaded in one query)."""
    if profiles is None:
        profiles = (await db.execute(select(OfficialProfile).where(OfficialProfile.role_id.is_not(None)))).scalars().all()
    mastery = defaultdict(list)
    for r in (await db.execute(select(SkillMastery).where(SkillMastery.skill_id.like("comp:%")))).scalars():
        mastery[r.user_id].append(r)
    return [(p, levels_for(p, mastery[p.user_id])) for p in profiles]


def competency_distribution(all_levels: list[tuple[OfficialProfile, list[CompetencyLevel]]]) -> list[dict]:
    per_comp = defaultdict(lambda: {"current": [], "met": 0, "gap": 0.0})
    for _, levels in all_levels:
        for lv in levels:
            if lv.required:
                s = per_comp[lv.id]
                s["current"].append(lv.current)
                s["met"] += lv.gap == 0
                s["gap"] += lv.gap
    return [{"id": c.id, "name": c.name, "domain": c.domain, "officials": len(s["current"]),
             "average_level": round(sum(s["current"]) / len(s["current"]), 1),
             "percent_meeting": round(100 * s["met"] / len(s["current"])), "total_gap": round(s["gap"], 1)}
            for c in COMPETENCIES if (s := per_comp.get(c.id))]


@router.get("/me")
async def my_dashboard(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p, levels = await competency_levels(db, user.id)
    ens = (await db.execute(select(Enrolment, Course).join(Course, Course.id == Enrolment.course_id)
                            .where(Enrolment.user_id == user.id))).all()
    attempts = (await db.execute(select(Attempt, Assessment.kind).join(Assessment, Assessment.id == Attempt.assessment_id)
                                 .where(Attempt.user_id == user.id).order_by(Attempt.created_at))).all()
    since = datetime.utcnow() - timedelta(weeks=8)
    weekly = defaultdict(lambda: [0, 0])
    for ev in (await db.execute(select(LearningEvent.created_at, LearningEvent.correct).where(
            LearningEvent.user_id == user.id, LearningEvent.event_type == "answer", LearningEvent.skill_id.like("comp:%"),
            LearningEvent.created_at >= since))).all():
        wk = (ev.created_at - timedelta(days=ev.created_at.weekday())).date().isoformat()
        weekly[wk][0] += 1
        weekly[wk][1] += bool(ev.correct)
    enrolled = [c for e, c in ens if e.status != "completed"]
    return {
        "role": {"id": p.role_id, "name": ROLE_BY_ID[p.role_id].name} if p and p.role_id in ROLE_BY_ID else None,
        "readiness": readiness(levels),
        "projected_readiness": readiness(projected(levels, enrolled)),
        "domains": by_domain(levels),
        "gaps": [lv.__dict__ for lv in ranked_gaps(levels)[:8]],
        "assessed": sum(lv.source == "assessed" for lv in levels),
        "learning_hours": await learning_hours(db, user.id),
        "courses": {"completed": sum(e.status == "completed" for e, _ in ens), "in_progress": len(enrolled)},
        "assessments": {"taken": len(attempts),
                        "average": round(sum(100 * a.score / a.total for a, _ in attempts) / len(attempts)) if attempts else None},
        "weekly_activity": [{"week": k, "answers": v[0], "accuracy": round(100 * v[1] / v[0])} for k, v in sorted(weekly.items())],
    }


@router.get("/org")
async def org_dashboard(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    profiles = (await db.execute(select(OfficialProfile).where(OfficialProfile.role_id.is_not(None)))).scalars().all()
    all_ens = (await db.execute(select(Enrolment, Course).join(Course, Course.id == Enrolment.course_id))).all()
    ens_by_user = defaultdict(list)
    for e, c in all_ens:
        ens_by_user[e.user_id].append((e, c))

    dept, role_rows, officials = defaultdict(list), defaultdict(list), []
    proj_scores = []
    all_levels = await officials_levels(db, profiles)
    for p, levels in all_levels:
        r = readiness(levels)
        enrolled = [c for e, c in ens_by_user[p.user_id] if e.status != "completed"]
        proj_scores.append(readiness(projected(levels, enrolled)))
        officials.append(r)
        dept[p.department or "Unspecified"].append(r)
        role_rows[p.role_id].append(r)

    distribution = competency_distribution(all_levels)
    top_gaps = sorted(distribution, key=lambda d: -d["total_gap"])[:8]
    emerging = sorted([d for d in distribution if d["id"] in EMERGING], key=lambda d: d["percent_meeting"])[:6]

    courses = defaultdict(lambda: {"enrolled": 0, "completed": 0, "scores": []})
    titles = {}
    for e, c in all_ens:
        s = courses[c.id]
        titles[c.id] = (c.title, c.source)
        s["enrolled"] += 1
        if e.status == "completed":
            s["completed"] += 1
            if e.score is not None:
                s["scores"].append(e.score)
    effectiveness = sorted([{
        "id": cid, "title": titles[cid][0], "source": titles[cid][1], "enrolled": s["enrolled"], "completed": s["completed"],
        "completion_rate": round(100 * s["completed"] / s["enrolled"]),
        "average_score": round(sum(s["scores"]) / len(s["scores"])) if s["scores"] else None,
    } for cid, s in courses.items()], key=lambda x: (-x["enrolled"], x["title"]))

    avg = lambda xs: round(sum(xs) / len(xs)) if xs else 0  # noqa: E731
    users = (await db.execute(select(func.count()).select_from(User))).scalar()
    return {
        "officials": len(profiles), "users": users,
        "average_readiness": avg(officials), "projected_readiness": avg(proj_scores),
        "enrolments": len(all_ens), "completions": sum(e.status == "completed" for e, _ in all_ens),
        "by_department": sorted([{"department": k, "officials": len(v), "readiness": avg(v)} for k, v in dept.items()], key=lambda x: x["readiness"]),
        "by_role": [{"role": ROLE_BY_ID[k].name, "officials": len(v), "readiness": avg(v)} for k, v in role_rows.items() if k in ROLE_BY_ID],
        "distribution": distribution,
        "top_gaps": top_gaps,
        "emerging_needs": emerging,
        "training_effectiveness": effectiveness,
    }


@router.get("/trainer")
async def trainer_dashboard(user: User = Depends(require_role("trainer")), db: AsyncSession = Depends(get_db)):
    """How the trainer's quizzes perform, which questions learners miss, and which org-wide gaps have no quiz yet."""
    q = select(Assessment).where(Assessment.kind == "material").order_by(Assessment.created_at.desc())
    if user.role != "admin":
        q = q.where(Assessment.created_by == user.id)
    quizzes = (await db.execute(q)).scalars().all()
    ids = [a.id for a in quizzes]
    questions = (await db.execute(select(AssessmentQuestion).where(AssessmentQuestion.assessment_id.in_(ids)))).scalars().all() if ids else []
    attempts = (await db.execute(select(Attempt).where(Attempt.assessment_id.in_(ids)))).scalars().all() if ids else []

    per_quiz = defaultdict(list)
    per_question = defaultdict(lambda: [0, 0])  # [responses, correct]
    for t in attempts:
        per_quiz[t.assessment_id].append(t)
        for ans in t.answers or []:
            c = per_question[str(ans.get("question_id"))]
            c[0] += 1
            c[1] += bool(ans.get("correct"))
    n_questions = defaultdict(int)
    for qn in questions:
        n_questions[qn.assessment_id] += 1
    pct = lambda ts: round(sum(100 * t.score / t.total for t in ts) / len(ts)) if ts else None  # noqa: E731

    titles = {a.id: a.title for a in quizzes}
    hardest = sorted(
        [{"id": str(qn.id), "text": qn.text, "quiz": titles[qn.assessment_id], "assessment_id": str(qn.assessment_id),
          "responses": per_question[str(qn.id)][0], "percent_correct": round(100 * per_question[str(qn.id)][1] / per_question[str(qn.id)][0])}
         for qn in questions if per_question[str(qn.id)][0] >= MIN_RESPONSES],
        key=lambda x: x["percent_correct"])[:5]

    covered = {cid for a in quizzes if a.published for cid in (a.competency_ids or [])}
    distribution = competency_distribution(await officials_levels(db))
    uncovered = sorted([d for d in distribution if d["id"] not in covered and d["total_gap"] > 0], key=lambda d: -d["total_gap"])[:6]

    return {
        "quizzes": len(quizzes), "published": sum(a.published for a in quizzes), "questions": len(questions),
        "attempts": len(attempts), "learners": len({t.user_id for t in attempts}), "average_score": pct(attempts),
        "quiz_stats": [{"id": str(a.id), "title": a.title, "status": a.status, "published": a.published, "questions": n_questions[a.id],
                        "attempts": len(per_quiz[a.id]), "learners": len({t.user_id for t in per_quiz[a.id]}),
                        "average_score": pct(per_quiz[a.id])} for a in quizzes],
        "hardest_questions": hardest,
        "uncovered_gaps": uncovered,
    }


@router.get("/users")
async def list_users(user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(User, OfficialProfile).outerjoin(OfficialProfile, OfficialProfile.user_id == User.id)
                             .order_by(User.created_at.desc()).limit(500))).all()
    return [{"id": str(u.id), "name": u.name, "email": u.email, "role": u.role,
             "designation": p.designation if p else None, "department": p.department if p else None} for u, p in rows]


class RoleBody(BaseModel):
    role: str


@router.patch("/users/{user_id}")
async def set_role(user_id: str, body: RoleBody, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    if body.role not in ("learner", "trainer", "admin"):
        raise HTTPException(status_code=400, detail="Role must be learner, trainer or admin")
    try:
        target = await db.get(User, uuid.UUID(user_id))
    except ValueError:
        target = None
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id and body.role != "admin":
        raise HTTPException(status_code=400, detail="You can't remove your own admin access")
    target.role = body.role
    await db.commit()
    return {"id": str(target.id), "role": target.role}

