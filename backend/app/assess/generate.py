"""LLM question generation: MCQs from material sections, and diagnostic MCQs for a competency."""

import re

from app.competency.framework import BY_ID
from app.llm import FAST, generate, parse_json

BODY_CHARS = 30000


def pick_sections(sections: list[dict], budget: int = BODY_CHARS) -> list[dict]:
    """Every section if it fits, else an even spread across the material (so questions cover all of it)."""
    total = sum(len(s["text"]) for s in sections)
    if total <= budget:
        return sections
    per = max(400, budget // max(1, len(sections)))
    step = max(1, round(len(sections) * per / budget))
    return [{"ref": s["ref"], "text": s["text"][:per]} for s in sections[::step]]


def _ref_key(ref: str) -> str:
    return re.sub(r"[^a-z0-9:]", "", ref.lower().replace("pg", "page").replace("p.", "page"))


def validate_mcqs(raw, refs: set[str], competency_ids: set[str], n: int) -> list[dict]:
    """Keep well-formed questions only: 4 distinct options, answer among them, known ref/competency."""
    by_key = {_ref_key(r): r for r in refs}
    out, seen = [], set()
    for q in raw if isinstance(raw, list) else []:
        if not isinstance(q, dict):
            continue
        opts = q.get("options")
        text = str(q.get("question") or q.get("text") or "").strip()
        if not text or not isinstance(opts, list) or len(opts) != 4:
            continue
        opts = [str(o).strip() for o in opts]
        answer = str(q.get("answer") or "").strip()
        if answer not in opts or len(set(opts)) != 4 or text.lower() in seen:
            continue
        seen.add(text.lower())
        ref = str(q.get("source") or "").strip()
        comp = q.get("competency")
        diff = q.get("difficulty")
        out.append({
            "text": text, "options": opts, "answer": answer,
            "explanation": str(q.get("explanation") or "").strip(),
            "source_ref": by_key.get(_ref_key(ref), ""),
            "competency_id": comp if comp in competency_ids else (next(iter(competency_ids)) if len(competency_ids) == 1 else None),
            "difficulty": diff if diff in (1, 2, 3) else 2,
        })
    return out[:n]


MATERIAL_PROMPT = (
    "You are an examiner for India's Official Statistical System (MoSPI / NSSTA). Below is training material split into "
    "sections, each with a reference.\n\nWrite {n} multiple-choice questions that test understanding of this material "
    "(concepts, methods, definitions, indicators, applications). Never ask about the document itself (its title, "
    "publisher, edition, dates or page numbers). Mix difficulty 1 (recall), "
    "2 (understanding), 3 (application). Every question must be answerable from the material.\n{comps}\n"
    'Return ONLY a JSON array; each item: {{"question": str, "options": [4 distinct strings], "answer": the correct '
    'option string, "explanation": one or two sentences citing the material, "source": the section reference it came '
    'from exactly as written, "competency": {comp_field}, "difficulty": 1|2|3}}.\n\nMATERIAL:\n{body}'
)


async def mcqs_from_sections(sections: list[dict], competency_ids: list[str], n: int) -> list[dict]:
    chosen = pick_sections(sections)
    body = "\n\n".join(f"[{s['ref']}]\n{s['text']}" for s in chosen)
    comps = [c for c in competency_ids if c in BY_ID]
    comp_text = ("Competencies this material builds (tag each question with the best one): "
                 + "; ".join(f"{c} = {BY_ID[c].name}" for c in comps)) if comps else ""
    prompt = MATERIAL_PROMPT.format(n=n + 3, comps=comp_text, comp_field="one of the competency ids above" if comps else "null", body=body)
    raw = parse_json(await generate(prompt, FAST))
    return validate_mcqs(raw, {s["ref"] for s in sections}, set(comps), n)


DIAGNOSTIC_PROMPT = (
    "You are assessing an official of India's Official Statistical System on the competency \"{name}\" ({desc}).\n"
    "Write {n} multiple-choice questions for a short diagnostic: 3 at difficulty 1 (awareness), 3 at difficulty 2 "
    "(working knowledge), 2 at difficulty 3 (applied / expert). Use the Indian official statistics context where relevant "
    "(MoSPI, NSO, NSS/PLFS, CPI, IIP, SDG NIF, NQAF, DPDP Act) but keep facts well established.\n"
    'Return ONLY a JSON array; each item: {{"question": str, "options": [4 distinct strings], "answer": the correct option '
    'string, "explanation": one sentence, "difficulty": 1|2|3}}.'
)


async def diagnostic_mcqs(competency_id: str, n: int = 8) -> list[dict]:
    c = BY_ID[competency_id]
    raw = parse_json(await generate(DIAGNOSTIC_PROMPT.format(name=c.name, desc=c.description, n=n + 2), FAST))
    return validate_mcqs(raw, set(), {competency_id}, n)
