"""Topic plans: how a playlist's lessons group into topics. Pure functions, no I/O."""

from dataclasses import dataclass, field

CHUNK = 8


@dataclass(frozen=True)
class Item:
    youtube_id: str
    title: str
    duration: int | None
    start_sec: int | None = None
    end_sec: int | None = None
    chapter: str | None = None

    @property
    def label(self) -> str:
        return f"{self.chapter} (part of: {self.title})" if self.chapter else self.title


@dataclass
class PlannedTopic:
    title: str
    summary: str
    items: list[int]
    prerequisites: list[int] = field(default_factory=list)
    same_as: list[str] = field(default_factory=list)
    needs_existing: list[str] = field(default_factory=list)


def _mins(seconds: int | None) -> str:
    return f"{round(seconds / 60)} min" if seconds else "?"


def plan_prompt(items: list[Item], existing: list[tuple[str, str]]) -> str:
    lines = "\n".join(f"{i}. {it.label} [{_mins((it.end_sec or it.duration or 0) - (it.start_sec or 0))}]" for i, it in enumerate(items))
    existing_block = (
        "The student's trail already has these topics (id: title):\n" + "\n".join(f"{sid}: {title}" for sid, title in existing)
        if existing else "The trail has no other topics yet."
    )
    return (
        "You are organising a course made of the numbered lessons below into topics for a learning path.\n"
        "Rules:\n"
        "- Group consecutive lessons that teach one topic. Typical topics have 3 to 15 lessons; follow the content, not a fixed size.\n"
        "- Every lesson index belongs to exactly one topic. Keep lessons in their original order.\n"
        "- Setup, introduction or motivation lessons join the topic they introduce.\n"
        "- prerequisites: indices of EARLIER topics in your list that a student must know first.\n"
        "- same_as: ids of existing topics that teach the same thing as this topic.\n"
        "- needs_existing: ids of existing topics that are prerequisites of this topic.\n"
        f"{existing_block}\n\n"
        "Return ONLY a JSON array. Each element: "
        '{"title": str, "summary": one sentence, "items": [lesson indices], "prerequisites": [topic indices], '
        '"same_as": [existing ids], "needs_existing": [existing ids]}.\n\n'
        f"Lessons:\n{lines}"
    )


def validate_plan(raw, n_items: int, existing_ids: set[str]) -> list[PlannedTopic]:
    """Repair Gemini's plan: full coverage, original order, prerequisites only on earlier topics."""
    if not isinstance(raw, list) or not raw:
        raise ValueError("plan is not a non-empty list")
    topics: list[PlannedTopic] = []
    raw_prereqs: list[list[int]] = []
    kept_from_raw: dict[int, int] = {}
    owner: dict[int, int] = {}
    for r, t in enumerate(raw):
        if not isinstance(t, dict):
            continue
        title = str(t.get("title") or "").strip()[:300]
        items = [i for i in dict.fromkeys(t.get("items") or []) if isinstance(i, int) and 0 <= i < n_items and i not in owner]
        if not title or not items:
            continue
        kept_from_raw[r] = len(topics)
        for i in items:
            owner[i] = len(topics)
        topics.append(PlannedTopic(
            title=title,
            summary=str(t.get("summary") or "").strip()[:500],
            items=items,
            same_as=[e for e in t.get("same_as") or [] if e in existing_ids],
            needs_existing=[e for e in t.get("needs_existing") or [] if e in existing_ids],
        ))
        raw_prereqs.append([p for p in t.get("prerequisites") or [] if isinstance(p, int)])
    if not topics:
        raise ValueError("plan has no usable topics")

    for i in range(n_items):
        if i in owner:
            continue
        near = next((owner[j] for j in range(i - 1, -1, -1) if j in owner), None)
        if near is None:
            near = next(owner[j] for j in range(i + 1, n_items) if j in owner)
        owner[i] = near
        topics[near].items.append(i)

    order = sorted(range(len(topics)), key=lambda k: min(topics[k].items))
    new_index = {old: new for new, old in enumerate(order)}
    result = []
    for new, old in enumerate(order):
        t = topics[old]
        t.items.sort()
        mapped = {new_index[kept_from_raw[p]] for p in raw_prereqs[old] if p in kept_from_raw}
        t.prerequisites = sorted(p for p in mapped if p < new)
        result.append(t)
    return result


def chunk_plan(items: list[Item]) -> list[PlannedTopic]:
    """Fallback when Gemini is unavailable: fixed chunks in order, chained."""
    plan = []
    for n, start in enumerate(range(0, len(items), CHUNK)):
        idx = list(range(start, min(start + CHUNK, len(items))))
        first = items[start]
        plan.append(PlannedTopic(title=(first.chapter or first.title)[:300], summary="", items=idx,
                                 prerequisites=[n - 1] if n else []))
    return plan
