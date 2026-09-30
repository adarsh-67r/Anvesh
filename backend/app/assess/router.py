"""Intelligent Assessment Engine: materials -> MCQ quizzes, diagnostics per competency, instant feedback."""

import re
import uuid
from datetime import datetime
from types import SimpleNamespace

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.assess.extract import extract_sections, kind_for
from app.assess.generate import diagnostic_mcqs, mcqs_from_sections
from app.competency.framework import BY_ID
from app.competency.levels import comp_skill_id
from app.database import async_session, get_db
from app.deps import get_current_user, require_role
from app.models import Assessment, AssessmentQuestion, Attempt, Enrolment, Material, User
from app.recommendation.orchestrator import record_answer
from app.trails.jobs import is_stale, spawn
from app.trails.youtube import parse_ref

router = APIRouter(tags=["assessments"])
MAX_UPLOAD = 15 * 1024 * 1024
PASS_MARK = 0.7


def _uuid(s: str) -> uuid.UUID:
    try:
        return uuid.UUID(s)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")


def can_edit(user: User, a: Assessment) -> bool:
    return user.role == "admin" or (user.role == "trainer" and a.created_by == user.id)


def video_sections(text: str) -> list[dict]:
    """Timestamped lecture text ("[m:ss] words" lines) -> ~2k-char sections referenced by start time."""
    out, buf, ref = [], [], None
    for line in text.splitlines():
        m = re.match(r"\[(\d+(?::\d+){1,2})\]", line.strip())
        if ref is None:
            ref = f"Video {m.group(1)}" if m else "Video"
        buf.append(line)
        if sum(len(b) for b in buf) > 2000:
            out.append({"ref": ref, "text": "\n".join(buf)})
            buf, ref = [], None
    if buf:
        out.append({"ref": ref or "Video", "text": "\n".join(buf)})
    return [s for s in out if len(s["text"]) >= 40]


# ---------- background generation ----------

async def _generate_material_quiz(material_id: uuid.UUID, assessment_id: uuid.UUID, data: bytes | None, n: int):
    from app.trails.grounding import lesson_context

    async with async_session() as db:
        m = await db.get(Material, material_id)
        a = await db.get(Assessment, assessment_id)
        try:
            if m.kind == "video":
                ref = parse_ref(m.source_url or "")
                lesson = SimpleNamespace(youtube_id=ref[1], start_sec=None, end_sec=None, duration=None, title=m.title)
                text, method = await lesson_context(db, lesson)
                if method == "titles":
                    raise ValueError("Couldn't read this video (no captions and it couldn't be watched). Try a document instead.")
                sections = video_sections(text)
            else:
                sections = extract_sections(m.kind, data or b"")
            if not sections:
                raise ValueError("No readable text found. Scanned PDFs (images only) aren't supported yet.")
            m.sections = sections
            await db.commit()
            qs = await mcqs_from_sections(sections, m.competency_ids or [], n)
            if not qs:
                raise ValueError("The AI couldn't write questions from this material. Try again.")
            for i, q in enumerate(qs):
                db.add(AssessmentQuestion(assessment_id=a.id, position=i, **q))
            m.status, a.status = "ready", "ready"
            await db.commit()
        except Exception as e:
            await db.rollback()
            m = await db.get(Material, material_id)
            a = await db.get(Assessment, assessment_id)
            m.status, a.status, m.error = "failed", "failed", str(e)[:300]
            await db.commit()


async def _generate_diagnostic(assessment_id: uuid.UUID, competency_id: str):
    async with async_session() as db:
        a = await db.get(Assessment, assessment_id)
        try:
            qs = await diagnostic_mcqs(competency_id)
            if len(qs) < 4:
                raise ValueError("too few questions")
            for i, q in enumerate(qs):
                db.add(AssessmentQuestion(assessment_id=a.id, position=i, **q))
            a.status = "ready"
        except Exception:
            await db.rollback()
            a = await db.get(Assessment, assessment_id)
            a.status = "failed"
        await db.commit()


# ---------- materials (trainers) ----------

@router.post("/api/materials")
async def upload_material(
    title: str = Form(..., max_length=300),
    competency_ids: str = Form(""),
    count: int = Form(10, ge=3, le=25),
    url: str = Form(""),
    file: UploadFile | None = File(None),
    user: User = Depends(require_role("trainer")),
    db: AsyncSession = Depends(get_db),
):
    comps = [c for c in (x.strip() for x in competency_ids.split(",")) if c]
    unknown = [c for c in comps if c not in BY_ID]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown competencies: {unknown}")
    data = None
    if file is not None and file.filename:
        kind = kind_for(file.filename, (file.content_type or "").split(";")[0])
        if not kind:
            raise HTTPException(status_code=415, detail="Upload a PDF, PPTX, DOCX or TXT file")
        data = await file.read(MAX_UPLOAD + 1)
        if len(data) > MAX_UPLOAD:
            raise HTTPException(status_code=413, detail="File is larger than 15 MB")
        filename = file.filename[:300]
    elif url.strip():
        ref = parse_ref(url.strip())
        if not ref or ref[0] != "video":
            raise HTTPException(status_code=400, detail="Paste a YouTube video link")
        kind, filename = "video", ""
    else:
        raise HTTPException(status_code=400, detail="Attach a file or paste a video link")

    m = Material(owner_id=user.id, title=title.strip() or filename, kind=kind, filename=filename,
                 source_url=url.strip() or None, competency_ids=comps)
    db.add(m)
    await db.flush()
    a = Assessment(kind="material", title=m.title, material_id=m.id, competency_ids=comps, created_by=user.id, status="generating")
    db.add(a)
    await db.commit()
    spawn(_generate_material_quiz(m.id, a.id, data, count))
    return {"material_id": str(m.id), "assessment_id": str(a.id), "status": "generating"}


@router.get("/api/materials")
async def list_materials(user: User = Depends(require_role("trainer")), db: AsyncSession = Depends(get_db)):
    q = select(Material, Assessment).join(Assessment, Assessment.material_id == Material.id).order_by(Material.created_at.desc())
    if user.role != "admin":
        q = q.where(Material.owner_id == user.id)
    rows = (await db.execute(q)).all()
    counts = dict((await db.execute(
        select(AssessmentQuestion.assessment_id, func.count()).group_by(AssessmentQuestion.assessment_id)
    )).all())
    return [{
        "id": str(m.id), "title": m.title, "kind": m.kind, "filename": m.filename, "status": m.status, "error": m.error,
        "competency_ids": m.competency_ids, "sections": len(m.sections or []), "created_at": m.created_at.isoformat(),
        "assessment": {"id": str(a.id), "published": a.published, "questions": counts.get(a.id, 0)},
    } for m, a in rows]


# ---------- assessments ----------

def question_dict(q: AssessmentQuestion, with_answer: bool) -> dict:
    d = {"id": str(q.id), "text": q.text, "options": q.options, "source_ref": q.source_ref,
         "competency_id": q.competency_id, "difficulty": q.difficulty}
    if with_answer:
        d |= {"answer": q.answer, "explanation": q.explanation}
    return d


async def _load(db: AsyncSession, assessment_id: str, user: User) -> Assessment:
    a = await db.get(Assessment, _uuid(assessment_id))
    if not a or not (a.published or can_edit(user, a)):
        raise HTTPException(status_code=404, detail="Assessment not found")
    return a


@router.get("/api/assessments")
async def list_assessments(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = select(Assessment).where(Assessment.kind == "material").order_by(Assessment.created_at.desc())
    rows = (await db.execute(q)).scalars().all()
    rows = [a for a in rows if a.published or can_edit(user, a)]
    counts = dict((await db.execute(
        select(AssessmentQuestion.assessment_id, func.count()).group_by(AssessmentQuestion.assessment_id)
    )).all())
    best = dict((await db.execute(
        select(Attempt.assessment_id, func.max(Attempt.score * 100 / Attempt.total)).where(Attempt.user_id == user.id).group_by(Attempt.assessment_id)
    )).all())
    return [{
        "id": str(a.id), "title": a.title, "status": a.status, "published": a.published, "competency_ids": a.competency_ids,
        "questions": counts.get(a.id, 0), "best_percent": best.get(a.id), "editable": can_edit(user, a),
        "created_at": a.created_at.isoformat(),
    } for a in rows]


@router.get("/api/assessments/{assessment_id}")
async def get_assessment(assessment_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    a = await _load(db, assessment_id, user)
    qs = (await db.execute(
        select(AssessmentQuestion).where(AssessmentQuestion.assessment_id == a.id).order_by(AssessmentQuestion.position)
    )).scalars().all()
    edit = can_edit(user, a)
    m = await db.get(Material, a.material_id) if a.material_id else None
    return {
        "id": str(a.id), "kind": a.kind, "title": a.title, "status": a.status, "published": a.published, "editable": edit,
        "competency_ids": a.competency_ids, "error": m.error if m else None,
        "questions": [question_dict(q, edit) for q in qs],
    }


class AssessmentPatch(BaseModel):
    title: str | None = Field(None, max_length=300)
    published: bool | None = None


@router.patch("/api/assessments/{assessment_id}")
async def patch_assessment(assessment_id: str, body: AssessmentPatch, user: User = Depends(require_role("trainer")), db: AsyncSession = Depends(get_db)):
    a = await _load(db, assessment_id, user)
    if not can_edit(user, a):
        raise HTTPException(status_code=403, detail="Only the author can edit this quiz")
    if body.published and a.status != "ready":
        raise HTTPException(status_code=409, detail="Questions aren't ready yet")
    if body.title is not None:
        a.title = body.title.strip() or a.title
    if body.published is not None:
        a.published = body.published
    await db.commit()
    return {"id": str(a.id), "title": a.title, "published": a.published}


class QuestionEdit(BaseModel):
    text: str = Field(..., min_length=5, max_length=2000)
    options: list[str] = Field(..., min_length=4, max_length=4)
    answer: str
    explanation: str = Field("", max_length=2000)


@router.put("/api/assessments/{assessment_id}/questions/{question_id}")
async def edit_question(assessment_id: str, question_id: str, body: QuestionEdit,
                        user: User = Depends(require_role("trainer")), db: AsyncSession = Depends(get_db)):
    a = await _load(db, assessment_id, user)
    q = await db.get(AssessmentQuestion, _uuid(question_id))
    if not can_edit(user, a) or not q or q.assessment_id != a.id:
        raise HTTPException(status_code=404, detail="Question not found")
    opts = [o.strip() for o in body.options]
    if body.answer.strip() not in opts or len(set(opts)) != 4 or not all(opts):
        raise HTTPException(status_code=400, detail="Give 4 different options and pick one of them as the answer")
    q.text, q.options, q.answer, q.explanation = body.text.strip(), opts, body.answer.strip(), body.explanation.strip()
    await db.commit()
    return question_dict(q, True)


@router.delete("/api/assessments/{assessment_id}/questions/{question_id}")
async def delete_question(assessment_id: str, question_id: str, user: User = Depends(require_role("trainer")), db: AsyncSession = Depends(get_db)):
    a = await _load(db, assessment_id, user)
    q = await db.get(AssessmentQuestion, _uuid(question_id))
    if not can_edit(user, a) or not q or q.assessment_id != a.id:
        raise HTTPException(status_code=404, detail="Question not found")
    await db.delete(q)
    await db.commit()
    return {"deleted": True}


class AnswerBody(BaseModel):
    question_id: str
    selected: str = Field(..., max_length=2000)
    time_ms: int | None = None


@router.post("/api/assessments/{assessment_id}/answer")
async def answer(assessment_id: str, body: AnswerBody, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Instant feedback on one question; also feeds the competency's mastery model."""
    a = await _load(db, assessment_id, user)
    q = await db.get(AssessmentQuestion, _uuid(body.question_id))
    if not q or q.assessment_id != a.id:
        raise HTTPException(status_code=404, detail="Question not found")
    correct = body.selected.strip() == q.answer
    mastery = None
    cid = q.competency_id or (a.competency_ids[0] if len(a.competency_ids or []) == 1 else None)
    if cid in BY_ID:
        t = body.time_ms if isinstance(body.time_ms, int) and 0 < body.time_ms < 600000 else None
        mastery = await record_answer(db, str(user.id), comp_skill_id(cid), correct, question_id=str(q.id), response_time_ms=t)
        await db.commit()
    return {"correct": correct, "answer": q.answer, "explanation": q.explanation, "source_ref": q.source_ref,
            "competency_id": cid, "level": round(mastery["mastery_score"] * 5, 1) if mastery else None}


@router.get("/api/assessments/{assessment_id}/results")
async def results(assessment_id: str, user: User = Depends(require_role("trainer")), db: AsyncSession = Depends(get_db)):
    """For the quiz's author: every attempt, and how often each question (and each option) was chosen."""
    a = await _load(db, assessment_id, user)
    if not can_edit(user, a):
        raise HTTPException(status_code=403, detail="Only the author can see results")
    qs = (await db.execute(
        select(AssessmentQuestion).where(AssessmentQuestion.assessment_id == a.id).order_by(AssessmentQuestion.position)
    )).scalars().all()
    rows = (await db.execute(select(Attempt, User.name).join(User, User.id == Attempt.user_id)
                             .where(Attempt.assessment_id == a.id).order_by(Attempt.created_at.desc()))).all()
    picks = {str(q.id): {} for q in qs}
    for t, _ in rows:
        for ans in t.answers or []:
            if (c := picks.get(str(ans.get("question_id")))) is not None:
                c[ans.get("selected", "")] = c.get(ans.get("selected", ""), 0) + 1
    questions = []
    for q in qs:
        c = picks[str(q.id)]
        n = sum(c.values())
        questions.append({**question_dict(q, True), "responses": n,
                          "percent_correct": round(100 * c.get(q.answer, 0) / n) if n else None,
                          "option_counts": [c.get(o, 0) for o in q.options]})
    percents = [100 * t.score / t.total for t, _ in rows]
    return {
        "id": str(a.id), "title": a.title, "published": a.published, "competency_ids": a.competency_ids,
        "attempts": len(rows), "learners": len({t.user_id for t, _ in rows}),
        "average_score": round(sum(percents) / len(percents)) if percents else None,
        "pass_rate": round(100 * sum(p >= 100 * PASS_MARK for p in percents) / len(percents)) if percents else None,
        "questions": questions,
        "recent": [{"name": name, "score": t.score, "total": t.total, "percent": round(100 * t.score / t.total),
                    "at": t.created_at.isoformat()} for t, name in rows[:20]],
    }


class FinishBody(BaseModel):
    answers: list[dict] = Field(..., max_length=100)  # [{question_id, selected}]


@router.post("/api/assessments/{assessment_id}/finish")
async def finish(assessment_id: str, body: FinishBody, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    a = await _load(db, assessment_id, user)
    qs = {str(q.id): q for q in (await db.execute(
        select(AssessmentQuestion).where(AssessmentQuestion.assessment_id == a.id))).scalars()}
    graded = []
    for ans in body.answers:
        q = qs.get(str(ans.get("question_id")))
        if q and not any(g["question_id"] == str(q.id) for g in graded):
            graded.append({"question_id": str(q.id), "selected": str(ans.get("selected", ""))[:2000],
                           "correct": str(ans.get("selected", "")).strip() == q.answer})
    score, total = sum(g["correct"] for g in graded), max(1, len(qs))
    db.add(Attempt(assessment_id=a.id, user_id=user.id, score=score, total=total, answers=graded))
    completed_course = None
    if a.kind == "course" and a.course_id and score / total >= PASS_MARK:
        e = (await db.execute(select(Enrolment).where(Enrolment.user_id == user.id, Enrolment.course_id == a.course_id))).scalar_one_or_none()
        if e and e.status != "completed":
            e.status, e.progress, e.score, e.completed_at = "completed", 100, round(100 * score / total), datetime.utcnow()
            completed_course = a.course_id
    await db.commit()
    return {"score": score, "total": total, "percent": round(100 * score / total), "passed": score / total >= PASS_MARK,
            "completed_course": completed_course}


# ---------- diagnostics ----------

@router.get("/api/competency/{competency_id}/diagnostic")
async def diagnostic(competency_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """The shared diagnostic quiz for a competency (generated once, reused by everyone). 202 while it's being written."""
    if competency_id not in BY_ID:
        raise HTTPException(status_code=404, detail="Unknown competency")
    rows = (await db.execute(select(Assessment).where(Assessment.kind == "diagnostic").order_by(Assessment.created_at.desc()))).scalars().all()
    a = next((x for x in rows if x.competency_ids == [competency_id] and x.status != "failed"), None)
    if a and a.status == "generating" and is_stale(a.created_at, datetime.utcnow()):
        a.status = "failed"
        await db.commit()
        a = None
    if not a:
        a = Assessment(kind="diagnostic", title=f"{BY_ID[competency_id].name} - diagnostic", competency_ids=[competency_id],
                       published=True, status="generating")
        db.add(a)
        await db.commit()
        spawn(_generate_diagnostic(a.id, competency_id))
    if a.status != "ready":
        return JSONResponse(status_code=202, content={"id": str(a.id), "status": a.status})
    return {"id": str(a.id), "status": "ready"}
