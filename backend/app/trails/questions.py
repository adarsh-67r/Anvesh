"""A shared, persistent question bank per topic, generated from the topic's key concepts."""

import hashlib
import random
from datetime import datetime

from sqlalchemy import func, literal_column, select

from app.database import async_session
from app.llm import FAST, generate, parse_json
from app.models import LearningEvent, Question, TopicNotes
from app.trails.jobs import spawn

BANK_CAP = 60
TOP_UP = 8


def question_id(skill_id: str, text: str) -> str:
    return hashlib.sha1(f"{skill_id}\n{text}".encode()).hexdigest()[:16]


def order_for_user(ids: list[str], last_seen: dict[str, datetime], n: int, rng) -> list[str]:
    unseen = [i for i in ids if i not in last_seen]
    rng.shuffle(unseen)
    seen = sorted((i for i in ids if i in last_seen), key=lambda i: last_seen[i])
    return (unseen + seen)[:n]


async def generate_questions(db, skill_id: str, concepts: list[dict], count: int, avoid=()) -> int:
    listing = "\n".join(f"{n}. {c['concept']}: {c['explanation']}" for n, c in enumerate(concepts))
    avoid_block = ("Do not repeat these existing questions:\n" + "\n".join(f"- {a}" for a in avoid)) if avoid else ""
    prompt = (
        f"Key concepts of one topic, from its lectures:\n{listing}\n\n{avoid_block}\n"
        f"Write {count} multiple choice questions testing understanding of these concepts (not trivia about the course). "
        'Return ONLY a JSON array; each item: {"concept_index": int, "text": str, "options": [4 strings], '
        '"answer": the correct option string, "explanation": one sentence}.'
    )
    await db.commit()  # release the pooled connection during the slow call
    raw = parse_json(await generate(prompt, FAST))
    existing = set((await db.execute(select(Question.id).where(Question.skill_id == skill_id))).scalars())
    added = 0
    for q in raw if isinstance(raw, list) else []:
        opts = q.get("options")
        if not (isinstance(opts, list) and len(opts) == 4 and q.get("answer") in opts and q.get("text")):
            continue
        qid = question_id(skill_id, q["text"])
        if qid in existing:
            continue
        idx = q.get("concept_index")
        c = concepts[idx] if isinstance(idx, int) and 0 <= idx < len(concepts) else {}
        db.add(Question(id=qid, skill_id=skill_id, text=q["text"], options=opts, answer=q["answer"],
                        explanation=q.get("explanation"), concept=(c.get("concept") or "")[:300],
                        lesson_id=c.get("lesson_id"), timestamp_sec=c.get("timestamp_sec")))
        existing.add(qid)
        added += 1
    await db.commit()
    return added


async def _top_up(skill_id: str):
    async with async_session() as db:
        notes = await db.get(TopicNotes, skill_id)
        texts = (await db.execute(select(Question.text).where(Question.skill_id == skill_id))).scalars().all()
        if notes and notes.concepts and len(texts) < BANK_CAP:
            await generate_questions(db, skill_id, notes.concepts, TOP_UP, avoid=texts[-40:])


def seen_query(user_id, skill_id: str):
    """Last time this student answered each question of the topic."""
    qid = LearningEvent.context["question_id"].as_string().label("qid")
    return (
        select(qid, func.max(LearningEvent.created_at))
        .where(LearningEvent.user_id == user_id, LearningEvent.skill_id == skill_id, LearningEvent.event_type == "answer")
        .group_by(literal_column("qid"))
    )


async def pick_questions(db, user_id, skill_id: str, n: int = 5, lesson_id=None) -> list[Question]:
    q = select(Question).where(Question.skill_id == skill_id)
    if lesson_id:
        q = q.where(Question.lesson_id == lesson_id)
    bank = {x.id: x for x in (await db.execute(q)).scalars()}
    seen_rows = (await db.execute(seen_query(user_id, skill_id))).all()
    last_seen = {qid: at for qid, at in seen_rows if qid in bank}
    if not lesson_id and len(bank) - len(last_seen) < n and len(bank) < BANK_CAP:
        spawn(_top_up(skill_id))
    return [bank[i] for i in order_for_user(list(bank), last_seen, n, random.Random())]


def question_payload(q: Question, lessons: dict) -> dict:
    lesson = lessons.get(str(q.lesson_id)) if q.lesson_id else None
    return {
        "id": q.id, "text": q.text, "options": q.options, "answer": q.answer, "explanation": q.explanation,
        "lesson_id": str(q.lesson_id) if q.lesson_id else None,
        "lesson_title": lesson.title if lesson else None,
        "lesson_index": lesson.display_order + 1 if lesson else None,
        "timestamp_sec": q.timestamp_sec,
    }
