# Trails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn YouTube playlists and videos into personal trails of shared, lecture-grounded topics that the existing recommendation engine tracks per topic.

**Architecture:** A new backend package `app/trails/` holds pure logic (plan validation, caption parsing, overlap groups, scoping, question ordering) and async shells (YouTube I/O, import job, grounding job, API router). Topics stay `Skill` rows so EMA/BKT/IRT are untouched; a scoping helper feeds the orchestrator only the caller's topics. The app gains Trails screens and reuses the existing skill, lesson and practice screens with grounded data.

**Tech Stack:** FastAPI, async SQLAlchemy 2.1, asyncpg, Alembic, Supabase Postgres, google-genai 2.25 (`gemini-3.8-flash`), yt-dlp; Expo SDK 57, Expo Router, React Native Reanimated.

**Spec:** `docs/design/2026-09-27-trails.md`

## Global Constraints

- Topics are `Skill` rows; skill ids are `{source_ref}:v{version}:{n}` and must stay ≤ 100 chars.
- EMA/BKT/IRT thresholds and algorithms do not change (`bkt.MIN_ATTEMPTS = 200`, `irt.MIN_RESPONSES = 200`, `irt.MIN_USERS = 10`).
- All Gemini calls go through `app.llm.generate` (retries + fallback model). Structured calls use `FAST`.
- All yt-dlp calls run in `asyncio.to_thread`.
- Stored timestamps are absolute seconds into the video.
- Gemini video budget: stop at 7 × 3600 seconds per UTC day, counted from `video_context` rows with method `gemini`.
- Jobs restart when `updated_at` is older than 5 minutes while `importing`/`preparing`.
- Lecture text sent to the notes call is capped at 120,000 characters per topic.
- Question bank: 12 per topic initially, top-ups of 8, hard cap 60.
- Migrations are run locally against Supabase (`alembic upgrade head`); Render's Docker deploy does not run them.
- Commits: no AI attribution lines, no AI tool files. UI copy never says "Expo".
- Frontend: run `npx tsc --noEmit` and `npx expo lint` before every frontend commit.

## Review Focus

- A student opens practice on a topic whose lessons have no subtitles and YouTube blocks the server → practice still works from titles, labelled "From lesson titles", never an endless spinner. (Task 7 test)
- Two students import the same new playlist at the same moment → both end up with the same topics, neither import stays failed. (Task 6 test)
- A Render restart mid-import or mid-grounding → the next request restarts the job; nothing stays `importing`/`preparing` forever. (Tasks 6, 7 tests)
- A student rebuilds a source while another student is mid-practice on the old topics → the other student's topics, mastery and questions are unchanged. (Task 6 test)
- A topic's only prerequisite lives in a source the student deleted from their trail → the topic is available, not permanently locked. (Task 3 test)

---

## File Structure

**Backend — new**
- `app/trails/__init__.py` — empty
- `app/trails/plan.py` — pure: `Item`, `PlannedTopic`, `plan_prompt`, `validate_plan`, `chunk_plan`
- `app/trails/captions.py` — pure: `Line`, `parse_json3`, `lines_to_text`, `parse_text`, `slice_text`, `shift_text`, `fmt_ts`, `parse_ts`
- `app/trails/groups.py` — pure: `groups_of`, `expand_mastered`, `pick_per_group`
- `app/trails/scope.py` — `TopicView`, pure `resolve_topics`, async `user_skills`, `require_topic`
- `app/trails/youtube.py` — yt-dlp I/O: `parse_ref`, `list_source`, `video_info`, `pick_caption_url`, `fetch_captions`, `expand_chapters`
- `app/trails/jobs.py` — `spawn`, `is_stale`
- `app/trails/importer.py` — `run_import`
- `app/trails/grounding.py` — `claim_topic`, `lesson_context`, `run_grounding`, `watch_video`, `can_watch`
- `app/trails/questions.py` — `question_id`, `order_for_user`, `pick_questions`, `generate_questions`
- `app/trails/router.py` — `/api/trails` and `/api/topics`
- `alembic/versions/a1b2c3d4e5f6_trails.py` — schema + data migration
- `tests/test_trails_plan.py`, `tests/test_trails_captions.py`, `tests/test_trails_scope.py`, `tests/test_trails_jobs.py`, `tests/test_trails_questions.py`
- `scripts/migration_dry_run.py` — runs the migration inside a transaction and rolls back

**Backend — modified**
- `app/models.py` — new models and columns
- `app/llm.py` — `parse_json`, `LOW_RES_VIDEO`
- `app/recommendation/orchestrator.py` — scoped skills, covered status, group dedupe, trail fields
- `app/recommendation/router.py` — `build_graph`, scoped `/graph`, `/next`, `/answer`, `/videos`, trail-level prerequisites
- `app/game.py` — practice/quiz from the question bank
- `app/todos.py` — scoped suggestions
- `app/videos.py` — single-video lessons only, visibility, lesson detail with range and concepts
- `app/chatbot.py` — `topic_id` context
- `app/main.py` — include trails router

**Frontend — new**
- `src/lib/trails.ts` — types and helpers
- `src/app/(tabs)/trails.tsx` — trails list
- `src/app/trail/new.tsx` — new trail form
- `src/app/trail/[id].tsx` — trail map + sources

**Frontend — modified / removed**
- `src/components/Sidebar.tsx`, `src/components/VideoPlayer.tsx`, `src/components/VideoPlayer.web.tsx`
- `src/app/(tabs)/index.tsx`, `src/app/(tabs)/chat.tsx`, `src/app/skill/[id].tsx`, `src/app/lecture/[id].tsx`, `src/app/practice/[skillId].tsx`
- Remove `src/app/(tabs)/learn.tsx` and `src/app/add-content.tsx`

---

### Task 0: Spike — can Gemini clip YouTube input by time range?

Throwaway. The answer sets one constant in Task 7.

**Files:**
- Create (scratchpad, not committed): `spike_clip.py`

- [ ] **Step 1: Write the probe**

```python
import asyncio
from google import genai
from app.config import settings

URL = "https://www.youtube.com/watch?v=OMcxQ3IY-qc"  # a public lecture already in the demo data

async def main():
    c = genai.Client(api_key=settings.gemini_api_key)
    part = genai.types.Part(
        file_data=genai.types.FileData(file_uri=URL),
        video_metadata=genai.types.VideoMetadata(start_offset="60s", end_offset="120s"),
    )
    cfg = genai.types.GenerateContentConfig(media_resolution=genai.types.MediaResolution.MEDIA_RESOLUTION_LOW)
    r = await c.aio.models.generate_content(
        model="gemini-3.8-flash",
        contents=[part, "What is said in this clip? Start each line with [mm:ss] measured from the start of the clip."],
        config=cfg,
    )
    print(r.text)
    print("prompt tokens:", r.usage_metadata.prompt_token_count)

asyncio.run(main())
```

- [ ] **Step 2: Run it from `backend/`**

Run: `python spike_clip.py`
Expected: a transcript-like answer. **Clipping works** if prompt tokens ≈ 60 s × 100 = ~6,000–8,000 and the content matches minute 1–2 of the video. **Clipping ignored** if prompt tokens reflect the whole video.

- [ ] **Step 3: Record the result**

Set in Task 7 `grounding.py`: `CLIP_SUPPORTED = True` or `False`. If False, `MAX_UNCLIPPED_SECONDS = 2 * 3600` applies (videos longer than that skip Gemini watching). Delete `spike_clip.py`.

---

### Task 1: Data model and migration

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/a1b2c3d4e5f6_trails.py`
- Create: `backend/scripts/migration_dry_run.py`

**Interfaces:**
- Produces: models `Trail`, `Source`, `TopicPlan`, `TrailTopic`, `VideoContext`, `TopicNotes`, `Question`; new columns `Skill.source_ref/plan_version/position/summary`, `SkillVideo.youtube_id/start_sec/end_sec/duration`, `SkillVideo.user_id` nullable.

- [ ] **Step 1: Add models** — append to `app/models.py` and extend `Skill`/`SkillVideo`:

```python
# in class Skill, after prerequisites:
    source_ref: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    plan_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

# in class SkillVideo, replace user_id and add fields:
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    youtube_id: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    start_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Trail(Base):
    __tablename__ = "trails"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trail_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trails.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    url: Mapped[str] = mapped_column(String(1000))
    source_ref: Mapped[str] = mapped_column(String(64), index=True)
    plan_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(500), default="", server_default="")
    status: Mapped[str] = mapped_column(String(12), default="importing", server_default="importing")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class TopicPlan(Base):
    __tablename__ = "topic_plans"

    source_ref: Mapped[str] = mapped_column(String(64), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    method: Mapped[str] = mapped_column(String(10))
    title: Mapped[str] = mapped_column(String(500), default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class TrailTopic(Base):
    __tablename__ = "trail_topics"

    trail_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trails.id", ondelete="CASCADE"), primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    prerequisites_override: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    equivalent_to: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")


class VideoContext(Base):
    __tablename__ = "video_context"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)  # "{youtube_id}:{start}:{end}", 0:0 = whole video
    youtube_id: Mapped[str] = mapped_column(String(20), index=True)
    text: Mapped[str] = mapped_column(Text)
    method: Mapped[str] = mapped_column(String(10))
    seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0")  # video seconds Gemini watched
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class TopicNotes(Base):
    __tablename__ = "topic_notes"

    skill_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    status: Mapped[str] = mapped_column(String(12))
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    concepts: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    progress: Mapped[str] = mapped_column(String(40), default="", server_default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    skill_id: Mapped[str] = mapped_column(String(100), index=True)
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    concept: Mapped[str] = mapped_column(String(300), default="", server_default="")
    text: Mapped[str] = mapped_column(Text)
    options: Mapped[list[str]] = mapped_column(JSON)
    answer: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

- [ ] **Step 2: Generate the schema migration**

Run (from `backend/`): `alembic revision --autogenerate -m "trails"`
Rename the file to `a1b2c3d4e5f6_trails.py` and set `revision = "a1b2c3d4e5f6"`, `down_revision = "85dfb0cc275d"`. Review: it must create the 7 tables, add the 8 columns, and alter `skill_videos.user_id` to nullable. Remove anything else autogenerate added.

- [ ] **Step 3: Append the data migration to `upgrade()`**

```python
    import re, uuid as _uuid
    conn = op.get_bind()
    list_re = re.compile(r"[?&]list=([A-Za-z0-9_-]+)")
    rows = conn.execute(sa.text(
        "SELECT DISTINCT v.user_id, s.id, s.label, s.source_url FROM skill_videos v JOIN skills s ON s.id = v.skill_id "
        "WHERE v.user_id IS NOT NULL ORDER BY v.user_id, s.id"
    )).fetchall()
    trails: dict = {}
    for user_id, skill_id, label, source_url in rows:
        if user_id not in trails:
            trails[user_id] = _uuid.uuid4()
            conn.execute(sa.text("INSERT INTO trails (id, user_id, title) VALUES (:id, :u, 'My first trail')"),
                         {"id": trails[user_id], "u": user_id})
        m = list_re.search(source_url or "")
        ref = m.group(1) if m else skill_id[:64]
        conn.execute(sa.text("INSERT INTO topic_plans (source_ref, version, method, title) VALUES (:r, 0, 'chunked', :t) "
                             "ON CONFLICT DO NOTHING"), {"r": ref, "t": label[:500]})
        conn.execute(sa.text("UPDATE skills SET source_ref = :r, plan_version = 0 WHERE id = :s"), {"r": ref, "s": skill_id})
        conn.execute(sa.text(
            "INSERT INTO sources (id, trail_id, kind, url, source_ref, plan_version, title, status) "
            "VALUES (:id, :t, :k, :url, :r, 0, :title, 'ready')"),
            {"id": _uuid.uuid4(), "t": trails[user_id], "k": "playlist" if m else "video",
             "url": source_url or "", "r": ref, "title": label[:500]})
        pos = conn.execute(sa.text("SELECT count(*) FROM trail_topics WHERE trail_id = :t"), {"t": trails[user_id]}).scalar()
        conn.execute(sa.text("INSERT INTO trail_topics (trail_id, skill_id, position) VALUES (:t, :s, :p)"),
                     {"t": trails[user_id], "s": skill_id, "p": pos})
    # Lessons that came from a playlist import become shared (no owner).
    conn.execute(sa.text(
        "UPDATE skill_videos SET user_id = NULL WHERE skill_id IN (SELECT id FROM skills WHERE source_url LIKE '%list=%')"
    ))
    conn.execute(sa.text(
        "UPDATE skill_videos SET youtube_id = substring(url from '[?&]v=([A-Za-z0-9_-]{11})') WHERE youtube_id IS NULL"
    ))
```

`downgrade()`: drop the 7 tables and 8 columns (autogenerate wrote this; keep `user_id` nullable on downgrade since owners were cleared).

- [ ] **Step 4: Write the dry-run script** `backend/scripts/migration_dry_run.py`

```python
"""Run pending migrations inside one transaction, print counts, then roll back. Postgres DDL is transactional."""
import asyncio

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings


def upgrade(conn):
    cfg = Config("alembic.ini")
    cfg.attributes["connection"] = conn
    command.upgrade(cfg, "head")


async def main():
    engine = create_async_engine(settings.database_url, connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0})
    async with engine.connect() as conn:
        trans = await conn.begin()
        await conn.run_sync(upgrade)
        for table in ("trails", "sources", "topic_plans", "trail_topics"):
            print(table, (await conn.execute(text(f"SELECT count(*) FROM {table}"))).scalar())
        print("shared lessons", (await conn.execute(text("SELECT count(*) FROM skill_videos WHERE user_id IS NULL"))).scalar())
        print("lessons without youtube_id", (await conn.execute(text("SELECT count(*) FROM skill_videos WHERE youtube_id IS NULL"))).scalar())
        await trans.rollback()
        print("rolled back")
    await engine.dispose()

asyncio.run(main())
```

Make `alembic/env.py` honour a passed connection: at the top of `run_migrations_online()` add

```python
    connectable = config.attributes.get("connection")
    if connectable is not None:
        do_run_migrations(connectable)
        return
```

- [ ] **Step 5: Dry run**

Run (from `backend/`): `python -m scripts.migration_dry_run`
Expected: `trails 1` (the demo user), `sources 2`, `topic_plans 2`, `trail_topics 2`, shared lessons = the two playlists' lesson count (about 428), lessons without youtube_id = 0, then `rolled back`. Afterwards `alembic current` still prints `85dfb0cc275d`, proving nothing was kept.

- [ ] **Step 6: Apply for real and verify**

Run: `alembic upgrade head` then `alembic check`
Expected: `No new upgrade operations detected.`

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/alembic backend/scripts/migration_dry_run.py
git commit -m "Add trails, sources, topic plans, grounding and question bank tables"
```

---

### Task 2: Topic plan validation

**Files:**
- Create: `backend/app/trails/__init__.py` (empty), `backend/app/trails/plan.py`
- Modify: `backend/app/llm.py`
- Test: `backend/tests/test_trails_plan.py`

**Interfaces:**
- Produces: `Item(youtube_id, title, duration, start_sec=None, end_sec=None, chapter=None)`; `PlannedTopic(title, summary, items: list[int], prerequisites: list[int], same_as: list[str], needs_existing: list[str])`; `plan_prompt(items, existing: list[tuple[str, str]]) -> str`; `validate_plan(raw, n_items, existing_ids: set[str]) -> list[PlannedTopic]` (raises `ValueError`); `chunk_plan(items) -> list[PlannedTopic]`; `llm.parse_json(text) -> Any`.

- [ ] **Step 1: Write the failing tests** `backend/tests/test_trails_plan.py`

```python
import pytest

from app.trails.plan import Item, chunk_plan, validate_plan

ITEMS = [Item(f"v{i}", f"Lecture {i}", 600) for i in range(10)]


def test_valid_plan_keeps_order_and_prereqs():
    raw = [
        {"title": "Basics", "summary": "s", "items": [0, 1, 2], "prerequisites": []},
        {"title": "Arrays", "items": [3, 4, 5, 6], "prerequisites": [0]},
        {"title": "Search", "items": [7, 8, 9], "prerequisites": [1]},
    ]
    plan = validate_plan(raw, 10, set())
    assert [t.title for t in plan] == ["Basics", "Arrays", "Search"]
    assert plan[2].prerequisites == [1]


def test_orphans_join_nearest_previous_topic():
    raw = [{"title": "A", "items": [0, 1]}, {"title": "B", "items": [5, 6, 7, 8, 9]}]
    plan = validate_plan(raw, 10, set())
    assert plan[0].items == [0, 1, 2, 3, 4]
    assert sorted(i for t in plan for i in t.items) == list(range(10))


def test_duplicate_items_go_to_first_claimant():
    raw = [{"title": "A", "items": [0, 1, 2, 3, 4]}, {"title": "B", "items": [4, 5, 6, 7, 8, 9]}]
    plan = validate_plan(raw, 10, set())
    assert 4 in plan[0].items and 4 not in plan[1].items


def test_forward_and_cyclic_prereqs_dropped():
    raw = [
        {"title": "A", "items": [0, 1, 2, 3, 4], "prerequisites": [1]},
        {"title": "B", "items": [5, 6, 7, 8, 9], "prerequisites": [0, 1]},
    ]
    plan = validate_plan(raw, 10, set())
    assert plan[0].prerequisites == []
    assert plan[1].prerequisites == [0]


def test_prereq_indices_follow_skipped_topics():
    raw = [
        {"title": "", "items": [0]},                       # dropped: no title
        {"title": "A", "items": [0, 1, 2, 3, 4]},
        {"title": "B", "items": [5, 6, 7, 8, 9], "prerequisites": [1]},
    ]
    plan = validate_plan(raw, 10, set())
    assert [t.title for t in plan] == ["A", "B"]
    assert plan[1].prerequisites == [0]


def test_topics_reordered_by_first_item():
    raw = [{"title": "Late", "items": [5, 6, 7, 8, 9]}, {"title": "Early", "items": [0, 1, 2, 3, 4], "prerequisites": []}]
    plan = validate_plan(raw, 10, set())
    assert [t.title for t in plan] == ["Early", "Late"]


def test_existing_links_filtered_to_known_ids():
    raw = [{"title": "A", "items": list(range(10)), "same_as": ["x:v1:0", "ghost"], "needs_existing": ["x:v1:1"]}]
    plan = validate_plan(raw, 10, {"x:v1:0", "x:v1:1"})
    assert plan[0].same_as == ["x:v1:0"] and plan[0].needs_existing == ["x:v1:1"]


@pytest.mark.parametrize("raw", [None, [], "text", [{"title": "A", "items": []}], [{"items": [0]}]])
def test_unusable_plan_raises(raw):
    with pytest.raises(ValueError):
        validate_plan(raw, 10, set())


def test_chunk_plan_covers_everything_in_order():
    plan = chunk_plan(ITEMS)
    assert [t.items for t in plan] == [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9]]
    assert plan[1].prerequisites == [0] and plan[0].title == "Lecture 0"
```

- [ ] **Step 2: Run to verify failure**

Run (from `backend/`): `python -m pytest tests/test_trails_plan.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'app.trails'`

- [ ] **Step 3: Implement** `backend/app/trails/plan.py`

```python
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
```

Add to `backend/app/llm.py`:

```python
import json

LOW_RES_VIDEO = genai.types.GenerateContentConfig(
    thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
    media_resolution=genai.types.MediaResolution.MEDIA_RESOLUTION_LOW,
)


def parse_json(text: str):
    """Parse a model reply that should be JSON, tolerating a ``` fence."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(text)
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_trails_plan.py -q`
Expected: `13 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/trails backend/app/llm.py backend/tests/test_trails_plan.py
git commit -m "Add topic plan validation with chunked fallback"
```

---

### Task 3: Scoping, overlap groups and the engine

**Files:**
- Create: `backend/app/trails/groups.py`, `backend/app/trails/scope.py`
- Modify: `backend/app/recommendation/orchestrator.py`, `backend/app/recommendation/router.py`, `backend/app/todos.py`
- Test: `backend/tests/test_trails_scope.py`

**Interfaces:**
- Consumes: `Skill`, `TrailTopic`, `Trail` (Task 1).
- Produces:
  - `groups_of(links: dict[str, list[str]]) -> dict[str, frozenset[str]]`
  - `expand_mastered(mastered: set[str], groups) -> set[str]`
  - `pick_per_group(ids_in_order: list[str], groups) -> list[str]`
  - `TopicView(id, label, subject, prerequisites, depth, position, trail_id, trail_title, summary, equivalent_to, source_ref)`
  - `resolve_topics(rows: list[tuple[Skill, TrailTopic, Trail]]) -> list[TopicView]`
  - `async user_skills(db, user_id) -> list[TopicView]`
  - `async require_topic(db, user_id, skill_id) -> TopicView` (404 otherwise)
  - `orchestrator.skill_status(topic, mastered_ids, effective=None) -> "mastered"|"covered"|"available"|"locked"`
  - `orchestrator.get_next_recommended_skills(db, user_id, limit)` results gain `trail_id`, `trail_title`
  - `router.build_graph(db, user_id, trail_id: str | None = None) -> list[dict]`

- [ ] **Step 1: Write the failing tests** `backend/tests/test_trails_scope.py`

```python
from types import SimpleNamespace as NS

from app.recommendation.orchestrator import skill_status
from app.trails.groups import expand_mastered, groups_of, pick_per_group
from app.trails.scope import resolve_topics


def row(sid, prereqs=(), override=None, equiv=(), pos=0, trail="t1", ref="p"):
    return (
        NS(id=sid, label=sid.upper(), subject="general", prerequisites=list(prereqs), summary=None, source_ref=ref),
        NS(skill_id=sid, position=pos, prerequisites_override=override, equivalent_to=list(equiv)),
        NS(id=trail, title="DSA Trail", created_at=0),
    )


def test_override_replaces_shared_prereqs():
    topics = {t.id: t for t in resolve_topics([row("a"), row("b", ["a"]), row("c", ["a"], override=["b"])])}
    assert topics["c"].prerequisites == ["b"]
    assert topics["c"].depth == 2


def test_prereqs_outside_trails_are_dropped():
    topics = {t.id: t for t in resolve_topics([row("b", ["deleted-source-topic"])])}
    assert topics["b"].prerequisites == []
    assert skill_status(topics["b"], set()) == "available"


def test_topics_ordered_by_position():
    assert [t.id for t in resolve_topics([row("x", pos=2), row("y", pos=0), row("z", pos=1)])] == ["y", "z", "x"]


def test_groups_are_transitive_and_symmetric():
    g = groups_of({"a": ["b"], "b": ["c"], "d": []})
    assert g["a"] == g["c"] == frozenset({"a", "b", "c"})
    assert g["d"] == frozenset({"d"})


def test_mastering_one_covers_its_group():
    g = groups_of({"luv-bs": ["striver-bs"]})
    eff = expand_mastered({"striver-bs"}, g)
    t = NS(id="luv-bs", prerequisites=[])
    assert skill_status(t, {"striver-bs"}, eff) == "covered"


def test_prereq_satisfied_by_equivalent():
    g = groups_of({"luv-bs": ["striver-bs"]})
    eff = expand_mastered({"luv-bs"}, g)
    assert skill_status(NS(id="striver-graphs", prerequisites=["striver-bs"]), {"luv-bs"}, eff) == "available"


def test_one_recommendation_per_group():
    g = groups_of({"a": ["b"]})
    assert pick_per_group(["b", "c", "a"], g) == ["b", "c"]


def test_equivalents_outside_scope_ignored():
    topics = resolve_topics([row("a", equiv=["gone"])])
    assert topics[0].equivalent_to == []
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_trails_scope.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'app.trails.groups'`

- [ ] **Step 3: Implement** `backend/app/trails/groups.py`

```python
"""Overlap groups: topics from different playlists that teach the same thing, within one trail."""


def groups_of(links: dict[str, list[str]]) -> dict[str, frozenset[str]]:
    parent = {k: k for k in links}
    for vs in links.values():
        for v in vs:
            parent.setdefault(v, v)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for k, vs in links.items():
        for v in vs:
            parent[find(k)] = find(v)
    members: dict[str, set[str]] = {}
    for x in parent:
        members.setdefault(find(x), set()).add(x)
    return {x: frozenset(members[find(x)]) for x in parent}


def expand_mastered(mastered: set[str], groups: dict[str, frozenset[str]]) -> set[str]:
    out = set(mastered)
    for m in mastered:
        out |= groups.get(m, frozenset())
    return out


def pick_per_group(ids_in_order: list[str], groups: dict[str, frozenset[str]]) -> list[str]:
    """Keep the first id of each group, preserving order."""
    seen: set[frozenset[str]] = set()
    out = []
    for i in ids_in_order:
        g = groups.get(i, frozenset({i}))
        if g in seen:
            continue
        seen.add(g)
        out.append(i)
    return out
```

`backend/app/trails/scope.py`:

```python
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
```

- [ ] **Step 4: Update the orchestrator** — in `orchestrator.py` replace `skill_status` and `get_next_recommended_skills`:

```python
from app.trails.groups import expand_mastered, groups_of, pick_per_group
from app.trails.scope import user_skills


def skill_status(skill, mastered_ids: set[str], effective: set[str] | None = None) -> str:
    """mastered: this topic. covered: an equivalent topic is mastered. available: prerequisites met."""
    eff = effective if effective is not None else mastered_ids
    if skill.id in mastered_ids:
        return "mastered"
    if skill.id in eff:
        return "covered"
    if all(p in eff for p in (skill.prerequisites or [])):
        return "available"
    return "locked"


async def get_next_recommended_skills(db: AsyncSession, user_id: str, limit: int = 3) -> list[dict]:
    """Top-K topics on the student's frontier across their trails; one per overlap group."""
    topics = await user_skills(db, user_id)
    groups = groups_of({t.id: t.equivalent_to for t in topics})
    mastered_ids = await ema.get_all_mastered_ids(db, user_id)
    effective = expand_mastered(mastered_ids, groups)
    counts = await _response_counts(db)

    results = []
    for t in topics:
        if skill_status(t, mastered_ids, effective) != "available":
            continue
        score, phase = await get_mastery(db, user_id, t.id, counts.get(t.id, (0, 0)))
        results.append({
            "skill_id": t.id, "label": t.label, "depth": t.depth, "subject": t.subject, "grade": 0,
            "prerequisites": t.prerequisites, "mastery_score": round(score, 4), "phase": phase,
            "trail_id": t.trail_id, "trail_title": t.trail_title, "position": t.position,
            "reason": "In progress" if score > 0 else ("Prerequisites complete" if t.prerequisites else "Not started"),
        })

    results.sort(key=lambda r: (r["depth"], r["mastery_score"] == 0.0, -r["mastery_score"], r["position"]))
    keep = set(pick_per_group([r["skill_id"] for r in results], groups))
    return [r for r in results if r["skill_id"] in keep][:limit]
```

Remove the now-unused `Skill` import if nothing else uses it.

- [ ] **Step 5: Scope the router** — in `recommendation/router.py`:

```python
from sqlalchemy import or_
from app.models import TrailTopic
from app.trails.groups import expand_mastered, groups_of
from app.trails.scope import require_topic, user_skills


def visible_lessons(skill_id: str, user_id):
    """Imported lessons plus this student's own additions."""
    return (
        select(SkillVideo)
        .where(SkillVideo.skill_id == skill_id, or_(SkillVideo.user_id.is_(None), SkillVideo.user_id == user_id))
        .order_by(SkillVideo.display_order)
    )


async def build_graph(db: AsyncSession, user_id, trail_id: str | None = None) -> list[dict]:
    topics = await user_skills(db, user_id)
    groups = groups_of({t.id: t.equivalent_to for t in topics})
    rows = (await db.execute(select(SkillMastery).where(SkillMastery.user_id == user_id))).scalars().all()
    mastery = {r.skill_id: r for r in rows}
    mastered = {r.skill_id for r in rows if r.is_mastered}
    effective = expand_mastered(mastered, groups)
    labels = {t.id: t.label for t in topics}
    trail_of = {t.id: t.trail_title for t in topics}
    ids = [t.id for t in topics]
    counts = dict((await db.execute(
        select(SkillVideo.skill_id, sqlfunc.count(SkillVideo.id))
        .where(SkillVideo.skill_id.in_(ids), or_(SkillVideo.user_id.is_(None), SkillVideo.user_id == user_id))
        .group_by(SkillVideo.skill_id)
    )).all()) if ids else {}
    nodes = []
    for t in topics:
        if trail_id and t.trail_id != trail_id:
            continue
        m = mastery.get(t.id)
        nodes.append({
            "id": t.id, "label": t.label, "depth": t.depth, "subject": t.subject, "grade": 0,
            "prerequisites": t.prerequisites, "position": t.position, "summary": t.summary,
            "trail_id": t.trail_id, "trail_title": t.trail_title, "source_ref": t.source_ref,
            "equivalents": [{"id": e, "label": labels[e], "trail_title": trail_of[e]} for e in t.equivalent_to],
            "mastery_score": round(m.mastery_score, 4) if m else 0.0,
            "is_mastered": m.is_mastered if m else False,
            "status": orchestrator.skill_status(t, mastered, effective),
            "video_count": counts.get(t.id, 0),
        })
    return nodes


@router.get("/graph")
async def full_graph(trail_id: str | None = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await build_graph(db, user.id, trail_id)
```

In `/next`, replace the lesson query with `visible_lessons(skill["skill_id"], user.id)` and add `"youtube_id"`, `"start_sec"`, `"end_sec"` to each video dict.

In `/answer`, first line: `await require_topic(db, user.id, body.skill_id)`.

Replace `/videos/{skill_id}` with an authenticated, scoped version:

```python
@router.get("/videos/{skill_id}")
async def skill_videos(skill_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_topic(db, user.id, skill_id)
    videos = (await db.execute(visible_lessons(skill_id, user.id))).scalars().all()
    return [{"id": str(v.id), "title": v.title, "url": v.url, "display_order": v.display_order,
             "youtube_id": v.youtube_id, "start_sec": v.start_sec, "end_sec": v.end_sec, "duration": v.duration}
            for v in videos]
```

Replace `set_prerequisites` so it writes the trail-level override:

```python
@router.put("/skills/{skill_id}/prerequisites")
async def set_prerequisites(
    skill_id: str, body: PrerequisitesRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    topic = await require_topic(db, user.id, skill_id)
    topics = {t.id: t for t in await user_skills(db, user.id)}
    unknown = [p for p in body.prerequisites if p not in topics]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown prerequisites: {unknown}")
    new = list(dict.fromkeys(body.prerequisites))
    try:
        KnowledgeGraph([
            SkillNode(t.id, t.label, t.depth, t.subject, 0, new if t.id == skill_id else t.prerequisites)
            for t in topics.values()
        ])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    tt = await db.get(TrailTopic, (topic.trail_id, skill_id))
    tt.prerequisites_override = new
    await db.commit()
    return {"skill_id": skill_id, "prerequisites": new}
```

`TrailTopic`'s primary key is `(trail_id, skill_id)`; `db.get` needs `uuid.UUID(topic.trail_id)` — import `uuid` and pass `(uuid.UUID(topic.trail_id), skill_id)`.

- [ ] **Step 6: Scope todos** — in `todos.py` `suggested_todos`:

```python
    from app.trails.scope import user_skills
    mastered = await get_all_mastered_ids(db, str(user.id))
    unmastered = [t for t in await user_skills(db, user.id) if t.id not in mastered]
    return [{"title": f"Study: {t.label}", "skill_id": t.id, "depth": t.depth} for t in unmastered[:5]]
```

- [ ] **Step 7: Run all tests**

Run: `python -m pytest tests -q`
Expected: all pass (3 existing + 13 plan + 8 scope).

- [ ] **Step 8: Smoke test against Supabase** (local server on :8000, demo login as in earlier sessions)

Run: `curl -s -H "Authorization: Bearer $T" localhost:8000/api/recommend/graph | python -m json.tool | head -30`
Expected: the demo account's two migrated topics, each with `trail_title: "My first trail"`, `status` and `video_count` > 0. `/api/recommend/next` returns them with `trail_title`.

- [ ] **Step 9: Commit**

```bash
git add backend/app/trails backend/app/recommendation backend/app/todos.py backend/tests/test_trails_scope.py
git commit -m "Scope topics to the student's trails and count overlapping topics as covered"
```

---

### Task 4: Captions and YouTube access

**Files:**
- Create: `backend/app/trails/captions.py`, `backend/app/trails/youtube.py`
- Test: `backend/tests/test_trails_captions.py`

**Interfaces:**
- Produces:
  - `Line(start: float, text: str)`; `parse_json3(data) -> list[Line]`; `lines_to_text(lines) -> str` (one `[m:ss] text` line per ~30 s block); `parse_text(text) -> list[Line]`; `slice_text(text, start, end) -> str`; `shift_text(text, offset) -> str`; `fmt_ts(sec) -> str`; `parse_ts(s) -> int | None`; `trim(text, max_chars) -> str`
  - `parse_ref(url) -> tuple[str, str] | None` (`("playlist", id)` / `("video", id)`)
  - `list_source(url) -> dict` `{title, items: [Item]}` (sync)
  - `video_info(youtube_id) -> dict` (sync, yt-dlp info)
  - `pick_caption_url(info) -> str | None`
  - `fetch_captions(youtube_id) -> str | None` (sync; timestamped text, whole video)
  - `async expand_chapters(items, long_after=2700) -> list[Item]`

- [ ] **Step 1: Write the failing tests** `backend/tests/test_trails_captions.py`

```python
from app.trails.captions import fmt_ts, parse_json3, parse_text, parse_ts, shift_text, slice_text, lines_to_text, trim
from app.trails.youtube import parse_ref, pick_caption_url


def test_parse_json3_joins_segments():
    data = {"events": [
        {"tStartMs": 0, "segs": [{"utf8": "hello "}, {"utf8": "world"}]},
        {"tStartMs": 1500},
        {"tStartMs": 31000, "segs": [{"utf8": "\n"}]},
        {"tStartMs": 62000, "segs": [{"utf8": "binary search"}]},
    ]}
    lines = parse_json3(data)
    assert [(l.start, l.text) for l in lines] == [(0.0, "hello world"), (62.0, "binary search")]


def test_text_roundtrip_and_blocks():
    lines = parse_json3({"events": [{"tStartMs": s * 1000, "segs": [{"utf8": f"w{s}"}]} for s in (0, 10, 20, 40, 3700)]})
    text = lines_to_text(lines)
    assert text.splitlines() == ["[0:00] w0 w10 w20", "[0:40] w40", "[1:01:40] w3700"]
    assert [l.start for l in parse_text(text)] == [0, 40, 3700]


def test_slice_uses_absolute_time():
    text = "[0:00] intro\n[10:00] arrays\n[42:10] bfs\n[1:05:00] dfs"
    assert slice_text(text, 2530, 3900) == "[42:10] bfs"
    assert slice_text(text, None, None) == text


def test_shift_clip_relative_to_absolute():
    assert shift_text("[0:30] queue\n[2:00] visited", 2530) == "[42:40] queue\n[44:10] visited"


def test_ts_helpers():
    assert fmt_ts(750) == "12:30" and fmt_ts(3725) == "1:02:05"
    assert parse_ts("12:30") == 750 and parse_ts("1:02:05") == 3725 and parse_ts("x") is None


def test_trim_keeps_evenly_spaced_lines():
    text = "\n".join(f"[{i}:00] line{i}" for i in range(100))
    out = trim(text, 200)
    assert len(out) <= 200 and out.startswith("[0:00] line0")


def test_parse_ref():
    assert parse_ref("https://youtube.com/playlist?list=PLauivoElc3ggagradg8MfOZreCMmXMmJ-&si=x") == ("playlist", "PLauivoElc3ggagradg8MfOZreCMmXMmJ-")
    assert parse_ref("https://youtu.be/OMcxQ3IY-qc?t=4") == ("video", "OMcxQ3IY-qc")
    assert parse_ref("https://www.youtube.com/watch?v=OMcxQ3IY-qc&list=PLx") == ("playlist", "PLx")
    assert parse_ref("https://example.com") is None


def test_pick_caption_prefers_manual_then_original_auto():
    info = {
        "subtitles": {},
        "automatic_captions": {
            "fr": [{"ext": "json3", "url": "fr"}],
            "hi-orig": [{"ext": "vtt", "url": "v"}, {"ext": "json3", "url": "hi-orig"}],
            "en": [{"ext": "json3", "url": "en-auto"}],
        },
    }
    assert pick_caption_url(info) == "hi-orig"
    info["subtitles"] = {"en": [{"ext": "json3", "url": "en-manual"}]}
    assert pick_caption_url(info) == "en-manual"
    assert pick_caption_url({"subtitles": {}, "automatic_captions": {}}) is None
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_trails_captions.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'app.trails.captions'`

- [ ] **Step 3: Implement** `backend/app/trails/captions.py`

```python
"""Lecture text as timestamped lines: '[m:ss] words'. All times are absolute seconds into the video."""

import re
from dataclasses import dataclass

BLOCK = 30
_TS = re.compile(r"^\[(\d+(?::\d{2}){1,2})\]\s?(.*)$")


@dataclass(frozen=True)
class Line:
    start: float
    text: str


def fmt_ts(sec: float) -> str:
    sec = int(sec)
    h, m, s = sec // 3600, sec % 3600 // 60, sec % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def parse_ts(s: str) -> int | None:
    try:
        parts = [int(p) for p in str(s).strip().split(":")]
    except ValueError:
        return None
    if not 2 <= len(parts) <= 3:
        return None
    total = 0
    for p in parts:
        total = total * 60 + p
    return total


def parse_json3(data: dict) -> list[Line]:
    out = []
    for ev in data.get("events") or []:
        text = "".join(s.get("utf8", "") for s in ev.get("segs") or []).replace("\n", " ").strip()
        if text:
            out.append(Line(ev.get("tStartMs", 0) / 1000, text))
    return out


def lines_to_text(lines: list[Line]) -> str:
    blocks: list[tuple[float, list[str]]] = []
    for line in lines:
        if blocks and line.start - blocks[-1][0] < BLOCK:
            blocks[-1][1].append(line.text)
        else:
            blocks.append((line.start, [line.text]))
    return "\n".join(f"[{fmt_ts(start)}] {' '.join(words)}" for start, words in blocks)


def parse_text(text: str) -> list[Line]:
    out = []
    for raw in text.splitlines():
        m = _TS.match(raw.strip())
        if m and (sec := parse_ts(m.group(1))) is not None:
            out.append(Line(sec, m.group(2)))
    return out


def slice_text(text: str, start: int | None, end: int | None) -> str:
    if start is None and end is None:
        return text
    lo, hi = start or 0, end if end is not None else float("inf")
    return "\n".join(f"[{fmt_ts(l.start)}] {l.text}" for l in parse_text(text) if lo <= l.start < hi)


def shift_text(text: str, offset: int) -> str:
    return "\n".join(f"[{fmt_ts(l.start + offset)}] {l.text}" for l in parse_text(text))


def trim(text: str, max_chars: int) -> str:
    """Keep evenly spaced lines so the whole lecture stays represented."""
    if len(text) <= max_chars:
        return text
    lines = text.splitlines()
    step = len(text) / max_chars
    kept, size = [], 0
    for i in range(0, len(lines), max(1, round(step))):
        if size + len(lines[i]) + 1 > max_chars:
            break
        kept.append(lines[i])
        size += len(lines[i]) + 1
    return "\n".join(kept)
```

`backend/app/trails/youtube.py`:

```python
"""YouTube access through yt-dlp. Every function here blocks: call it with asyncio.to_thread."""

import asyncio
import json
import re
import urllib.request

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


def video_info(youtube_id: str) -> dict:
    with _ydl() as y:
        return y.extract_info(f"https://www.youtube.com/watch?v={youtube_id}", download=False) or {}


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
    info = info or video_info(youtube_id)
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
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_trails_captions.py -q`
Expected: `9 passed`

- [ ] **Step 5: Live check from this machine**

Run: `python -c "from app.trails.youtube import fetch_captions; t=fetch_captions('OMcxQ3IY-qc'); print((t or 'NONE')[:400])"`
Expected: timestamped Hindi or English lines. Then:
`python -c "import asyncio; from app.trails.youtube import list_source, expand_chapters; s=list_source('https://www.youtube.com/playlist?list=PLKnIA16_Rmvbr7zKYQuBfsVkjoLcJgxHH'); x=asyncio.run(expand_chapters(s['items'])); print(len(s['items']), '->', len(x))"`
Expected: `134 -> ` a larger number (CampusX has 18 videos over 45 minutes).

- [ ] **Step 6: Commit**

```bash
git add backend/app/trails backend/tests/test_trails_captions.py
git commit -m "Add caption parsing and YouTube listing with chapter splits"
```

---

### Task 5: Background jobs

**Files:**
- Create: `backend/app/trails/jobs.py`
- Test: `backend/tests/test_trails_jobs.py`

**Interfaces:**
- Produces: `spawn(coro) -> asyncio.Task` (keeps a strong reference until done); `is_stale(updated_at: datetime, now: datetime, minutes: int = 5) -> bool`; `STALE_MINUTES = 5`.

- [ ] **Step 1: Write the failing test** `backend/tests/test_trails_jobs.py`

```python
import asyncio
from datetime import datetime, timedelta

from app.trails.jobs import is_stale, spawn


def test_is_stale():
    now = datetime(2026, 9, 27, 12, 0)
    assert is_stale(now - timedelta(minutes=6), now)
    assert not is_stale(now - timedelta(minutes=4), now)


def test_spawn_runs_and_forgets():
    async def main():
        box = []

        async def job():
            box.append(1)

        t = spawn(job())
        await t
        return box

    assert asyncio.run(main()) == [1]
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_trails_jobs.py -q`
Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Implement** `backend/app/trails/jobs.py`

```python
"""In-process background jobs. Render restarts kill them; stale rows are restarted by the next request."""

import asyncio
import logging
from datetime import datetime, timedelta

STALE_MINUTES = 5
_running: set[asyncio.Task] = set()
log = logging.getLogger("anvesh.jobs")


def spawn(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _running.add(task)

    def done(t: asyncio.Task):
        _running.discard(t)
        if not t.cancelled() and t.exception():
            log.error("background job failed", exc_info=t.exception())

    task.add_done_callback(done)
    return task


def is_stale(updated_at: datetime, now: datetime, minutes: int = STALE_MINUTES) -> bool:
    return now - updated_at > timedelta(minutes=minutes)
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_trails_jobs.py -q`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/trails/jobs.py backend/tests/test_trails_jobs.py
git commit -m "Add background job helpers with stale detection"
```

---

### Task 6: Import and the trails API

**Files:**
- Create: `backend/app/trails/importer.py`, `backend/app/trails/router.py`
- Modify: `backend/app/main.py`, `backend/app/videos.py`
- Test: `backend/tests/test_trails_plan.py` (append: `save_rows` pure builder)

**Interfaces:**
- Consumes: `plan.*` (Task 2), `youtube.*` (Task 4), `jobs.*` (Task 5), `scope.*`, `build_graph` (Task 3).
- Produces:
  - `importer.topic_rows(ref, version, items, plan) -> tuple[list[dict], list[dict]]` (pure: skill dicts, lesson dicts)
  - `async importer.run_import(source_id: UUID, rebuild: bool = False) -> None`
  - `POST /api/trails {title, url}` → `{id, title}`
  - `GET /api/trails` → `[{id, title, source_count, topic_count, mastered_count, importing, next_topic}]`
  - `GET /api/trails/{id}` → `{id, title, sources: [{id, kind, url, title, status, error, topic_count}], topics: build_graph(...)}`
  - `POST /api/trails/{id}/sources {url}`, `POST /api/trails/{id}/sources/{sid}/retry`, `POST /api/trails/{id}/sources/{sid}/rebuild`, `DELETE /api/trails/{id}`

- [ ] **Step 1: Write the failing test for the pure row builder** (append to `tests/test_trails_plan.py`)

```python
from app.trails.importer import topic_rows
from app.trails.plan import PlannedTopic


def test_topic_rows_ids_order_and_ranges():
    items = [Item("aaaaaaaaaaa", "Intro", 300), Item("bbbbbbbbbbb", "Graphs course", 7200, 0, 2530, "BFS"),
             Item("bbbbbbbbbbb", "Graphs course", 7200, 2530, 3900, "DFS")]
    plan = [PlannedTopic("Basics", "s", [0]), PlannedTopic("Graphs", "g", [1, 2], prerequisites=[0])]
    skills, lessons = topic_rows("PLx", 2, items, plan)
    assert [s["id"] for s in skills] == ["PLx:v2:0", "PLx:v2:1"]
    assert skills[1]["prerequisites"] == ["PLx:v2:0"]
    assert lessons[2] == {"skill_id": "PLx:v2:1", "user_id": None, "title": "DFS · Graphs course",
                          "url": "https://www.youtube.com/watch?v=bbbbbbbbbbb&t=2530s", "youtube_id": "bbbbbbbbbbb",
                          "start_sec": 2530, "end_sec": 3900, "duration": 7200, "display_order": 1}
    assert all(len(s["id"]) <= 100 for s in skills)
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_trails_plan.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'app.trails.importer'`

- [ ] **Step 3: Implement** `backend/app/trails/importer.py`

```python
"""Import a source into a trail: reuse a playlist's shared plan or build a new one, then link topics."""

import asyncio
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.database import async_session
from app.llm import FAST, generate, parse_json
from app.models import Skill, SkillVideo, Source, TopicPlan, Trail, TrailTopic
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
```

`backend/app/trails/router.py`:

```python
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import SkillMastery, Source, Trail, TrailTopic, User
from app.recommendation.router import build_graph
from app.trails import youtube
from app.trails.importer import run_import
from app.trails.jobs import is_stale, spawn

router = APIRouter(prefix="/api/trails", tags=["trails"])


class NewTrail(BaseModel):
    title: str
    url: str


class NewSource(BaseModel):
    url: str


async def _own_trail(db: AsyncSession, trail_id: str, user_id) -> Trail:
    try:
        trail = await db.get(Trail, uuid.UUID(trail_id))
    except ValueError:
        trail = None
    if not trail or trail.user_id != user_id:
        raise HTTPException(status_code=404, detail="Trail not found")
    return trail


async def _add_source(db: AsyncSession, trail: Trail, user_id, url: str) -> Source:
    ref = youtube.parse_ref(url.strip())
    if not ref:
        raise HTTPException(status_code=400, detail="Paste a YouTube playlist or video link")
    kind, source_ref = ref
    clash = (await db.execute(
        select(Trail.title).join(Source, Source.trail_id == Trail.id)
        .where(Trail.user_id == user_id, Source.source_ref == source_ref)
    )).scalar()
    if clash:
        raise HTTPException(status_code=409, detail=f"Already in your {clash}")
    src = Source(trail_id=trail.id, kind=kind, url=url.strip(), source_ref=source_ref)
    db.add(src)
    await db.commit()
    await db.refresh(src)
    spawn(run_import(src.id))
    return src


@router.post("")
async def create_trail(body: NewTrail, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    title = body.title.strip()[:200]
    if not title:
        raise HTTPException(status_code=400, detail="Give your trail a name")
    if not youtube.parse_ref(body.url.strip()):
        raise HTTPException(status_code=400, detail="Paste a YouTube playlist or video link")
    trail = Trail(user_id=user.id, title=title)
    db.add(trail)
    await db.flush()
    try:
        await _add_source(db, trail, user.id, body.url)
    except HTTPException:
        await db.rollback()
        raise
    return {"id": str(trail.id), "title": trail.title}


@router.get("")
async def list_trails(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trails = (await db.execute(select(Trail).where(Trail.user_id == user.id).order_by(Trail.created_at))).scalars().all()
    graph = await build_graph(db, user.id)
    out = []
    for t in trails:
        sources = (await db.execute(select(Source).where(Source.trail_id == t.id))).scalars().all()
        nodes = [n for n in graph if n["trail_id"] == str(t.id)]
        nxt = next((n for n in nodes if n["status"] == "available"), None)
        out.append({
            "id": str(t.id), "title": t.title, "source_count": len(sources), "topic_count": len(nodes),
            "mastered_count": sum(n["status"] in ("mastered", "covered") for n in nodes),
            "importing": any(s.status == "importing" for s in sources),
            "next_topic": {"id": nxt["id"], "label": nxt["label"]} if nxt else None,
        })
    return out


@router.get("/{trail_id}")
async def get_trail(trail_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trail = await _own_trail(db, trail_id, user.id)
    sources = (await db.execute(select(Source).where(Source.trail_id == trail.id).order_by(Source.updated_at))).scalars().all()
    now = datetime.utcnow()
    for s in sources:
        if s.status == "importing" and is_stale(s.updated_at, now):
            claimed = await db.execute(
                update(Source).where(Source.id == s.id, Source.updated_at == s.updated_at).values(updated_at=now)
            )
            await db.commit()
            if claimed.rowcount == 1:
                spawn(run_import(s.id))
    topics = await build_graph(db, user.id, str(trail.id))
    per_source: dict[str, int] = {}
    for n in topics:
        per_source[n["source_ref"]] = per_source.get(n["source_ref"], 0) + 1
    return {
        "id": str(trail.id), "title": trail.title,
        "sources": [{"id": str(s.id), "kind": s.kind, "url": s.url, "title": s.title, "status": s.status,
                     "error": s.error, "topic_count": per_source.get(s.source_ref, 0)} for s in sources],
        "topics": topics,
    }


@router.post("/{trail_id}/sources")
async def add_source(trail_id: str, body: NewSource, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trail = await _own_trail(db, trail_id, user.id)
    src = await _add_source(db, trail, user.id, body.url)
    return {"id": str(src.id), "status": src.status}


async def _own_source(db, trail_id, source_id, user_id) -> Source:
    trail = await _own_trail(db, trail_id, user_id)
    try:
        src = await db.get(Source, uuid.UUID(source_id))
    except ValueError:
        src = None
    if not src or src.trail_id != trail.id:
        raise HTTPException(status_code=404, detail="Source not found")
    return src


@router.post("/{trail_id}/sources/{source_id}/retry")
async def retry_source(trail_id: str, source_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    src = await _own_source(db, trail_id, source_id, user.id)
    if src.status != "failed":
        raise HTTPException(status_code=409, detail="Only a failed source can be retried")
    src.status, src.error = "importing", None
    await db.commit()
    spawn(run_import(src.id))
    return {"status": "importing"}


@router.post("/{trail_id}/sources/{source_id}/rebuild")
async def rebuild_source(trail_id: str, source_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    src = await _own_source(db, trail_id, source_id, user.id)
    if src.status == "importing":
        raise HTTPException(status_code=409, detail="Already importing")
    src.status, src.error = "importing", None
    await db.commit()
    spawn(run_import(src.id, rebuild=True))
    return {"status": "importing"}


@router.delete("/{trail_id}")
async def delete_trail(trail_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trail = await _own_trail(db, trail_id, user.id)
    await db.delete(trail)  # sources and trail_topics cascade; shared topics stay
    await db.commit()
    return {"deleted": True}
```

`trails.id` → `sources`/`trail_topics` use `ondelete="CASCADE"` at the database level; `db.delete(trail)` issues a DELETE that Postgres cascades.

Register in `app/main.py`:

```python
from app.trails.router import router as trails_router
app.include_router(trails_router)
```

Restrict `POST /api/videos` in `app/videos.py` to single videos added to a visible topic:

```python
    if YOUTUBE_PLAYLIST_RE.search(body.url):
        raise HTTPException(status_code=400, detail="Add playlists from a trail's Sources section")
    if not body.skill_id:
        raise HTTPException(status_code=400, detail="skill_id required")
    from app.trails.scope import require_topic
    from app.trails.youtube import parse_ref
    await require_topic(db, user.id, body.skill_id)
    ref = parse_ref(body.url)
    if not ref or ref[0] != "video":
        raise HTTPException(status_code=400, detail="Paste a YouTube video link")
```

Then create the `SkillVideo` with `youtube_id=ref[1]` and `user_id=user.id` (the existing single-video code below it, minus `_ensure_skill`). Delete the playlist branch, `_extract_playlist`, `_slugify` and `_ensure_skill`.

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests -q`
Expected: all pass.

- [ ] **Step 5: Live import checks** (local server, demo token in `$T`)

```bash
curl -s -X POST localhost:8000/api/trails -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"title":"DSA Trail","url":"https://youtube.com/playlist?list=PLgUwDviBIf0oF6QL8m22w1hIDC1vJ_BHz"}'
```
(Striver's playlist id: read it from the demo account's migrated source URL.) Then poll `GET /api/trails/{id}` every 5 s until the source is `ready`.
Expected: `ready` within ~60 s; topics count between 15 and 60; topic ids `…:v1:n`.

Then add Luv's playlist to the same trail via `POST /api/trails/{id}/sources`.
Expected: `ready`; at least one Luv topic has non-empty `equivalents` pointing at a Striver topic.

Then `POST /api/trails` `{"title":"ML Trail","url":"https://youtube.com/playlist?list=PLKnIA16_Rmvbr7zKYQuBfsVkjoLcJgxHH"}`.
Expected: `ready`; `GET /api/recommend/videos/{a topic id}` for a long-video topic shows lessons with `start_sec`/`end_sec` set.

Review-focus checks:
- Duplicate: add Luv's URL again → HTTP 409 `Already in your DSA Trail`.
- Concurrency: create a second test account, POST the CampusX playlist from both accounts in the same second (two background curls) → both sources end `ready` with the same topic ids.
- Stale restart: set one source to `importing` with `updated_at = now() - interval '10 minutes'` via SQL, call `GET /api/trails/{id}` → the source goes back through import and ends `ready`.
- Rebuild isolation: with the second account linked to CampusX v1, rebuild CampusX in the demo account → demo trail moves to v2; the second account's `GET /api/recommend/graph` still shows the v1 ids.

Delete the second test account's rows afterwards.

- [ ] **Step 6: Commit**

```bash
git add backend/app/trails backend/app/main.py backend/app/videos.py backend/tests/test_trails_plan.py
git commit -m "Add trails API and background import with shared, versioned topic plans"
```

---

### Task 7: Grounding — lecture text and topic notes

**Files:**
- Create: `backend/app/trails/grounding.py`
- Modify: `backend/app/trails/router.py` (topics router), `backend/app/main.py`
- Test: `backend/tests/test_trails_jobs.py` (append budget and method tests)

**Interfaces:**
- Consumes: `captions.*`, `youtube.fetch_captions/video_info`, `jobs.*`, `llm.generate/parse_json/LOW_RES_VIDEO/FAST`, `scope.require_topic`.
- Produces:
  - `DAILY_WATCH_LIMIT = 7 * 3600`; `can_watch(used_seconds: int, needed_seconds: int) -> bool`
  - `topic_method(methods: list[str]) -> str`
  - `async claim_topic(db, skill_id) -> bool`
  - `async ensure_notes(db, skill_id) -> TopicNotes` (starts the job if needed, returns the row)
  - `async run_grounding(skill_id: str) -> None` (writes `topic_notes` and the first 12 questions via `questions.generate_questions`, Task 8)
  - `GET /api/topics/{skill_id}/notes?prepare=false` → `{status, progress, summary, method, concepts: [{concept, explanation, lesson_id, lesson_title, lesson_index, timestamp_sec}]}`

- [ ] **Step 1: Write the failing tests** (append to `tests/test_trails_jobs.py`)

```python
from app.trails.grounding import DAILY_WATCH_LIMIT, can_watch, topic_method


def test_budget_guard():
    assert can_watch(0, 3600)
    assert can_watch(DAILY_WATCH_LIMIT - 600, 600)
    assert not can_watch(DAILY_WATCH_LIMIT - 599, 600)


def test_topic_method():
    assert topic_method(["titles", "titles"]) == "titles"
    assert topic_method(["captions", "titles", "gemini", "captions"]) == "captions"
    assert topic_method(["gemini"]) == "gemini"
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_trails_jobs.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'app.trails.grounding'`

- [ ] **Step 3: Implement** `backend/app/trails/grounding.py` (set `CLIP_SUPPORTED` from Task 0)

```python
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
from app.trails.captions import fmt_ts, parse_ts, shift_text, slice_text, trim
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
```

Add the topics router at the bottom of `app/trails/router.py`:

```python
from app.models import SkillVideo, TopicNotes
from app.trails.grounding import ensure_notes
from app.trails.scope import require_topic

topics_router = APIRouter(prefix="/api/topics", tags=["topics"])


async def notes_payload(db, notes: TopicNotes | None) -> dict:
    if not notes:
        return {"status": "none", "progress": "", "summary": None, "method": None, "concepts": []}
    concepts = notes.concepts or []
    ids = {uuid.UUID(c["lesson_id"]) for c in concepts if c.get("lesson_id")}
    lessons = {str(v.id): v for v in (await db.execute(select(SkillVideo).where(SkillVideo.id.in_(ids)))).scalars()} if ids else {}
    return {
        "status": notes.status, "progress": notes.progress, "summary": notes.summary, "method": notes.method,
        "concepts": [{**c, "lesson_title": lessons[c["lesson_id"]].title if c.get("lesson_id") in lessons else None,
                      "lesson_index": lessons[c["lesson_id"]].display_order + 1 if c.get("lesson_id") in lessons else None}
                     for c in concepts],
    }


@topics_router.get("/{skill_id}/notes")
async def topic_notes(skill_id: str, prepare: bool = False, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_topic(db, user.id, skill_id)
    notes = await ensure_notes(db, skill_id) if prepare else await db.get(TopicNotes, skill_id)
    return await notes_payload(db, notes)
```

Include it in `app/main.py`: `from app.trails.router import topics_router` and `app.include_router(topics_router)`.

`generate_questions` is created in Task 8; until then, import it lazily as written (inside `run_grounding`). Implement Task 8 before the live check in Step 5.

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests -q`
Expected: all pass.

- [ ] **Step 5: Live grounding check** — after Task 8 is in place

Call `GET /api/topics/{a Luv topic}/notes?prepare=true`, then poll `?prepare=false` every 3 s.
Expected: `progress` counts up ("2 of 5 lessons"); within ~60 s `status: "ready"`, `method: "captions"` (or `gemini`), 8–15 concepts each with `lesson_title` and a `timestamp_sec` inside that lesson's range.

Review-focus check (no subtitles, blocked YouTube): temporarily set `youtube.fetch_captions = lambda *a, **k: None` and `DAILY_WATCH_LIMIT = 0` in a Python shell, run `asyncio.run(run_grounding(sid))` on a fresh topic → `status: "ready"`, `method: "titles"`.

Stale check: set a `topic_notes` row to `preparing` with `updated_at` 10 minutes ago; the next `?prepare=true` restarts it.

- [ ] **Step 6: Commit**

```bash
git add backend/app/trails backend/app/main.py backend/tests/test_trails_jobs.py
git commit -m "Ground topics in their lectures: subtitles, Gemini watching, then key concepts"
```

---

### Task 8: Question bank, practice, quiz and quick checks

**Files:**
- Create: `backend/app/trails/questions.py`
- Modify: `backend/app/game.py`, `backend/app/trails/router.py`
- Test: `backend/tests/test_trails_questions.py`

**Interfaces:**
- Consumes: `Question` model, `ensure_notes` (Task 7), `require_topic`.
- Produces:
  - `question_id(skill_id, text) -> str`
  - `order_for_user(ids: list[str], last_seen: dict[str, datetime], n: int, rng) -> list[str]`
  - `async generate_questions(db, skill_id, concepts, count, avoid: list[str] = ()) -> int` (rows added)
  - `async pick_questions(db, user_id, skill_id, n=5, lesson_id=None) -> list[Question]` (tops up in the background)
  - `question_payload(q, lessons) -> dict`
  - `GET /api/game/practice/{skill_id}` → 202 `{status: "preparing", progress}` or 200 `{skill, method, questions: [{id, text, options, answer, explanation, lesson_id, lesson_title, lesson_index, timestamp_sec}]}`
  - `GET /api/topics/{skill_id}/lessons/{lesson_id}/check` → same shapes, 2–3 questions for that lesson

- [ ] **Step 1: Write the failing tests** `backend/tests/test_trails_questions.py`

```python
import random
from datetime import datetime, timedelta

from app.trails.questions import order_for_user, question_id


def test_question_id_depends_on_topic():
    assert question_id("a", "What is BFS?") != question_id("b", "What is BFS?")
    assert question_id("a", "What is BFS?") == question_id("a", "What is BFS?")


def test_unseen_first_then_least_recent():
    now = datetime(2026, 9, 27)
    seen = {"q1": now - timedelta(days=1), "q2": now - timedelta(days=5)}
    order = order_for_user(["q1", "q2", "q3", "q4"], seen, 4, random.Random(0))
    assert set(order[:2]) == {"q3", "q4"}
    assert order[2:] == ["q2", "q1"]


def test_order_limits_to_n():
    assert len(order_for_user([f"q{i}" for i in range(20)], {}, 5, random.Random(1))) == 5
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_trails_questions.py -q`
Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Implement** `backend/app/trails/questions.py`

```python
"""A shared, persistent question bank per topic, generated from the topic's key concepts."""

import hashlib
import json
import random
from datetime import datetime

from sqlalchemy import func, select

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


async def pick_questions(db, user_id, skill_id: str, n: int = 5, lesson_id=None) -> list[Question]:
    q = select(Question).where(Question.skill_id == skill_id)
    if lesson_id:
        q = q.where(Question.lesson_id == lesson_id)
    bank = {x.id: x for x in (await db.execute(q)).scalars()}
    seen_rows = (await db.execute(
        select(LearningEvent.context["question_id"].as_string(), func.max(LearningEvent.created_at))
        .where(LearningEvent.user_id == user_id, LearningEvent.skill_id == skill_id, LearningEvent.event_type == "answer")
        .group_by(LearningEvent.context["question_id"].as_string())
    )).all()
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
```

`LearningEvent.context` is a `JSON` column; `context["question_id"].as_string()` compiles to `context ->> 'question_id'` on Postgres.

Replace practice and quiz in `app/game.py` (delete `_quiz_cache`, `_generate_questions`, `_question_id`):

```python
from fastapi.responses import JSONResponse
from app.models import SkillVideo
from app.trails.grounding import ensure_notes
from app.trails.questions import pick_questions, question_payload
from app.trails.scope import require_topic


async def _ready_questions(db, user, skill_id: str, n: int, lesson_id=None):
    """(questions, method) when the topic is grounded, else a 202 response to poll."""
    topic = await require_topic(db, user.id, skill_id)
    notes = await ensure_notes(db, skill_id)
    if notes.status != "ready":
        return None, JSONResponse(status_code=202, content={"status": notes.status, "progress": notes.progress})
    questions = await pick_questions(db, user.id, skill_id, n, lesson_id)
    if not questions:
        raise HTTPException(status_code=503, detail="No questions for this yet. Try again shortly.")
    ids = {q.lesson_id for q in questions if q.lesson_id}
    lessons = {str(v.id): v for v in (await db.execute(select(SkillVideo).where(SkillVideo.id.in_(ids)))).scalars()} if ids else {}
    return (topic, notes.method, [question_payload(q, lessons) for q in questions]), None


@router.get("/practice/{skill_id}")
async def practice(skill_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ready, wait = await _ready_questions(db, user, skill_id, 5)
    if wait:
        return wait
    topic, method, questions = ready
    return {"skill": {"id": topic.id, "label": topic.label}, "method": method, "questions": questions}
```

In `get_quiz`: after the study-minutes check, call `ready, wait = await _ready_questions(db, user, skill_id, 5)`; return `wait` if set; store `selected = [{"id": q["id"], "text": q["text"], "options": q["options"], "answer": q["answer"]} for q in questions]` in the `GameSession`. In `submit_answers`, use `qid = q.get("id")` instead of `_question_id(q)`.

Add the quick check to `app/trails/router.py`:

```python
from app.game import _ready_questions


@topics_router.get("/{skill_id}/lessons/{lesson_id}/check")
async def lesson_check(skill_id: str, lesson_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        lid = uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Lesson not found")
    ready, wait = await _ready_questions(db, user, skill_id, 3, lid)
    if wait:
        return wait
    _, method, questions = ready
    return {"method": method, "questions": questions}
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests -q`
Expected: all pass.

- [ ] **Step 5: Live checks**

`GET /api/game/practice/{Luv topic}` on a fresh topic → 202 with progress, then 200 with 5 questions whose `lesson_title`/`timestamp_sec` are set. Answer them via `POST /api/recommend/answer` with each `question_id`; call practice again → none of the 5 repeat while ≥ 5 unseen remain. `POST /api/recommend/answer` with a topic id from the ML trail of *another* account → 404.

- [ ] **Step 6: Commit**

```bash
git add backend/app/trails backend/app/game.py backend/tests/test_trails_questions.py
git commit -m "Serve practice, quizzes and lesson checks from a persistent question bank"
```

---

### Task 9: Lesson detail and tutor context

**Files:**
- Modify: `backend/app/videos.py`, `backend/app/chatbot.py`

**Interfaces:**
- Produces:
  - `GET /api/videos/detail/{id}` adds `youtube_id`, `start_sec`, `end_sec`, `concepts` (this lesson's concepts from ready notes), and lists only visible lessons; now authenticated.
  - `POST /api/chat` accepts `topic_id`.

- [ ] **Step 1: Lesson detail** — in `video_detail`, add `user: User = Depends(get_current_user)`, then:

```python
    from app.recommendation.router import visible_lessons
    from app.trails.scope import require_topic
    await require_topic(db, user.id, video.skill_id)
    lessons = (await db.execute(visible_lessons(video.skill_id, user.id))).scalars().all()
    notes = await db.get(TopicNotes, video.skill_id)
    concepts = [c for c in (notes.concepts or []) if c.get("lesson_id") == str(video.id)] if notes and notes.status == "ready" else []
```

Return additionally `"youtube_id": video.youtube_id, "start_sec": video.start_sec, "end_sec": video.end_sec, "concepts": concepts`, and include `start_sec`/`end_sec` in each `lessons` entry.

- [ ] **Step 2: Tutor context** — in `chatbot.py`:

```python
class ChatRequest(BaseModel):
    message: str = ""
    skill_context: str | None = None
    topic_id: str | None = None
    attachment_id: UUID | None = None
```

After `system_text` is built:

```python
    if body.topic_id:
        from app.models import TopicNotes
        from app.trails.captions import fmt_ts
        from app.trails.scope import user_skills
        topic = next((t for t in await user_skills(db, user.id) if t.id == body.topic_id), None)
        notes = await db.get(TopicNotes, body.topic_id) if topic else None
        if topic and notes and notes.status == "ready":
            lines = "\n".join(
                f"- {c['concept']}: {c['explanation']}" + (f" (at {fmt_ts(c['timestamp_sec'])})" if c.get("timestamp_sec") is not None else "")
                for c in notes.concepts or []
            )
            system_text += (
                f"\n\nThe student is studying the topic '{topic.label}' from their trail '{topic.trail_title}'. "
                f"Its lectures teach:\n{notes.summary}\n{lines}\n"
                "Answer from these lectures where possible and point the student to the moment in the lecture that covers it."
            )
```

- [ ] **Step 3: Live check**

`GET /api/videos/detail/{a CampusX chapter lesson}` → `start_sec`/`end_sec` set, `concepts` non-empty after that topic is grounded. `POST /api/chat {"message":"Explain the key idea again","topic_id":"<grounded topic>"}` → reply references the topic's concepts.

- [ ] **Step 4: Commit**

```bash
git add backend/app/videos.py backend/app/chatbot.py
git commit -m "Return lesson ranges and concepts, and give the tutor the topic's lectures"
```

---

### Task 10: Trails screens in the app

**Files:**
- Create: `frontend/src/lib/trails.ts`, `frontend/src/app/(tabs)/trails.tsx`, `frontend/src/app/trail/new.tsx`, `frontend/src/app/trail/[id].tsx`
- Modify: `frontend/src/components/Sidebar.tsx`, `frontend/src/app/(tabs)/index.tsx`
- Delete: `frontend/src/app/(tabs)/learn.tsx`, `frontend/src/app/add-content.tsx`

**Interfaces:**
- Consumes: `/api/trails`, `/api/trails/{id}`, `/api/trails/{id}/sources`, `.../retry`, `.../rebuild`, `DELETE /api/trails/{id}`.
- Produces: `lib/trails.ts` exports `TrailSummary`, `TrailDetail`, `TrailSource`, `TopicNode`, `levelsOf(nodes)`, `fmtTs(sec)`, `rangeLabel(start, end)`, `errorDetail(e)`.

- [ ] **Step 1: `frontend/src/lib/trails.ts`**

```ts
export type TopicStatus = "mastered" | "covered" | "available" | "locked";

export type TopicNode = {
  id: string;
  label: string;
  prerequisites: string[];
  position: number;
  summary: string | null;
  trail_id: string;
  trail_title: string;
  equivalents: { id: string; label: string; trail_title: string }[];
  mastery_score: number;
  status: TopicStatus;
  video_count: number;
};

export type TrailSource = {
  id: string;
  kind: "playlist" | "video";
  url: string;
  title: string;
  status: "importing" | "ready" | "failed";
  error: string | null;
  topic_count: number;
};

export type TrailSummary = {
  id: string;
  title: string;
  source_count: number;
  topic_count: number;
  mastered_count: number;
  importing: boolean;
  next_topic: { id: string; label: string } | null;
};

export type TrailDetail = { id: string; title: string; sources: TrailSource[]; topics: TopicNode[] };

/** Level = longest prerequisite chain below a topic (foundations are level 0). */
export function levelsOf(nodes: TopicNode[]): TopicNode[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number>();
  const level = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const prereqs = byId.get(id)?.prerequisites.filter((p) => byId.has(p)) ?? [];
    const l = prereqs.length ? 1 + Math.max(...prereqs.map((p) => level(p, seen))) : 0;
    memo.set(id, l);
    return l;
  };
  const tiers: TopicNode[][] = [];
  for (const n of [...nodes].sort((a, b) => a.position - b.position)) (tiers[level(n.id, new Set())] ??= []).push(n);
  return tiers.filter(Boolean);
}

export function fmtTs(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function rangeLabel(start: number | null, end: number | null): string | null {
  if (start == null && end == null) return null;
  return `${fmtTs(start ?? 0)}–${end != null ? fmtTs(end) : "end"}`;
}

export function errorDetail(e: unknown, fallback: string): string {
  try { return JSON.parse((e as Error).message).detail || fallback; } catch { return fallback; }
}
```

- [ ] **Step 2: Trails list** `frontend/src/app/(tabs)/trails.tsx`

```tsx
import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { TrailSummary } from "../../lib/trails";
import { ScreenHeader } from "../../components/Sidebar";
import { PressableScale, ProgressBar, Skeleton, enter } from "../../components/Motion";
import { colors, typography, spacing, radii } from "../../lib/theme";

export default function TrailsScreen() {
  const [trails, setTrails] = useState<TrailSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setTrails(await api.get<TrailSummary[]>("/api/trails").catch(() => []));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScreenHeader
        title="Trails"
        subtitle="Your learning paths from YouTube"
        right={
          <TouchableOpacity onPress={() => router.push("/trail/new")} accessibilityLabel="New trail" hitSlop={8}>
            <MaterialIcons name="add" size={28} color={colors.primary} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[colors.primary]} />}
      >
        {trails === null && [0, 1].map((i) => <Skeleton key={i} height={132} radius={radii.xl} style={{ marginBottom: spacing.md }} />)}

        {trails?.length === 0 && (
          <Animated.View entering={enter(0)} style={styles.empty}>
            <MaterialIcons name="route" size={52} color={colors.primary} />
            <Text style={styles.emptyTitle}>Start your first trail</Text>
            <Text style={styles.emptyText}>Paste a YouTube playlist. Anvesh splits it into topics, quizzes you on what the lectures teach, and picks what to study next.</Text>
            <PressableScale style={styles.primaryBtn} onPress={() => router.push("/trail/new")}>
              <Text style={styles.primaryBtnText}>New trail</Text>
            </PressableScale>
          </Animated.View>
        )}

        {trails?.map((t, i) => (
          <Animated.View key={t.id} entering={enter(i)}>
            <PressableScale style={styles.card} onPress={() => router.push(`/trail/${t.id}`)} scaleTo={0.98}>
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}><MaterialIcons name="route" size={22} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.cardMeta}>
                    {t.source_count} {t.source_count === 1 ? "source" : "sources"} · {t.topic_count} topics
                    {t.importing ? " · importing…" : ""}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
              </View>
              <ProgressBar value={t.topic_count ? t.mastered_count / t.topic_count : 0} color={colors.tertiary} delay={200 + i * 80} style={{ marginTop: spacing.md }} />
              <Text style={styles.cardMeta}>{t.mastered_count} of {t.topic_count} topics done</Text>
              {t.next_topic && <Text style={styles.next} numberOfLines={1}>Next: {t.next_topic.label}</Text>}
            </PressableScale>
          </Animated.View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surfaceWhite, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: spacing.md, marginBottom: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardIcon: { width: 40, height: 40, borderRadius: radii.lg, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  cardTitle: { ...typography.headlineSm, color: colors.text },
  cardMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 4 },
  next: { ...typography.labelLg, color: colors.primary, marginTop: spacing.sm },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: 80, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.headlineSm, color: colors.text },
  emptyText: { ...typography.bodyMd, color: colors.textSecondary, textAlign: "center" },
  primaryBtn: { marginTop: spacing.sm, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radii.full },
  primaryBtnText: { ...typography.labelLg, color: "#FFFFFF" },
});
```

- [ ] **Step 3: New trail form** `frontend/src/app/trail/new.tsx`

```tsx
import { useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "../../lib/api";
import { errorDetail } from "../../lib/trails";
import { PressableScale } from "../../components/Motion";
import { colors, typography, spacing, radii } from "../../lib/theme";

export default function NewTrailScreen() {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!title.trim() || !url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const t = await api.post<{ id: string }>("/api/trails", { title: title.trim(), url: url.trim() });
      router.replace(`/trail/${t.id}`);
    } catch (e) {
      setError(errorDetail(e, "Could not create the trail. Check the link and try again."));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>New trail</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.body}>
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} placeholder="DSA Placements" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} maxLength={200} />
        <Text style={styles.label}>YouTube playlist or video link</Text>
        <TextInput style={styles.input} placeholder="https://youtube.com/playlist?list=…" placeholderTextColor={colors.textMuted} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />
        <Text style={styles.hint}>You can add more playlists to this trail later.</Text>
        {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
        <PressableScale style={[styles.primaryBtn, (!title.trim() || !url.trim() || busy) && { opacity: 0.5 }]} onPress={create} disabled={!title.trim() || !url.trim() || busy}>
          <Text style={styles.primaryBtnText}>{busy ? "Creating…" : "Create trail"}</Text>
        </PressableScale>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  topTitle: { ...typography.headlineMd, color: colors.text },
  body: { padding: spacing.md, gap: spacing.sm },
  label: { ...typography.labelMd, color: colors.textSecondary, marginTop: spacing.sm },
  input: { height: 48, borderWidth: 1.5, borderColor: colors.borderMuted, borderRadius: radii.lg, paddingHorizontal: spacing.md, ...typography.bodyMd, color: colors.text, backgroundColor: colors.surfaceWhite },
  hint: { ...typography.bodySm, color: colors.textMuted },
  error: { ...typography.bodyMd, color: colors.error },
  primaryBtn: { marginTop: spacing.md, height: 52, borderRadius: radii.full, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { ...typography.labelLg, color: "#FFFFFF" },
});
```

- [ ] **Step 4: Trail screen** `frontend/src/app/trail/[id].tsx` — the map from the old `learn.tsx` plus sources. Polls every 3 s while any source is importing.

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "../../lib/api";
import { TopicStatus, TrailDetail, errorDetail, levelsOf } from "../../lib/trails";
import { PressableScale, ProgressBar, Skeleton, enter } from "../../components/Motion";
import { colors, typography, spacing, radii } from "../../lib/theme";

const STATUS: Record<TopicStatus, { label: string; icon: "check-circle" | "done-all" | "play-circle" | "lock"; fg: string; bg: string; border: string }> = {
  mastered: { label: "Mastered", icon: "check-circle", fg: colors.tertiaryDark, bg: colors.tertiaryLight, border: colors.tertiary },
  covered: { label: "Covered", icon: "done-all", fg: colors.tertiaryDark, bg: colors.surfaceWhite, border: colors.tertiary },
  available: { label: "Ready", icon: "play-circle", fg: colors.primary, bg: colors.surfaceWhite, border: colors.primary },
  locked: { label: "Locked", icon: "lock", fg: colors.textMuted, bg: colors.locked, border: colors.border },
};

export default function TrailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trail, setTrail] = useState<TrailDetail | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");

  const load = useCallback(async () => {
    try { setTrail(await api.get<TrailDetail>(`/api/trails/${id}`)); } catch { router.back(); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const importing = trail?.sources.some((s) => s.status === "importing") ?? false;
  useEffect(() => {
    if (!importing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [importing, load]);

  const tiers = useMemo(() => levelsOf(trail?.topics ?? []), [trail]);
  const labelOf = (tid: string) => trail?.topics.find((n) => n.id === tid)?.label ?? tid;
  const done = trail?.topics.filter((n) => n.status === "mastered" || n.status === "covered").length ?? 0;

  const addSource = async () => {
    if (!url.trim()) return;
    try {
      await api.post(`/api/trails/${id}/sources`, { url: url.trim() });
      setUrl("");
      setAdding(false);
      load();
    } catch (e) {
      Alert.alert("Could not add", errorDetail(e, "Check the link and try again."));
    }
  };

  const sourceAction = async (sid: string, action: "retry" | "rebuild") => {
    await api.post(`/api/trails/${id}/sources/${sid}/${action}`, {}).catch(() => {});
    load();
  };

  const remove = () =>
    Alert.alert("Delete trail?", "Your progress on its topics is kept if you add the same playlists again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.delete(`/api/trails/${id}`).catch(() => {}); router.back(); } },
    ]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle} numberOfLines={1}>{trail?.title ?? "Trail"}</Text>
          {trail && <Text style={styles.topMeta}>{done} of {trail.topics.length} topics done</Text>}
        </View>
        <TouchableOpacity onPress={remove} accessibilityLabel="Delete trail" hitSlop={8}>
          <MaterialIcons name="delete-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[colors.primary]} />}
      >
        {!trail && [0, 1, 2].map((i) => <Skeleton key={i} height={78} radius={radii.xl} style={{ marginBottom: spacing.sm }} />)}

        {trail && trail.topics.length > 0 && <ProgressBar value={done / trail.topics.length} color={colors.tertiary} height={8} style={{ marginBottom: spacing.md }} />}

        {tiers.map((tier, i) => (
          <View key={i}>
            {i > 0 && (
              <View style={styles.connector}>
                <View style={styles.connectorLine} />
                <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.borderMuted} />
              </View>
            )}
            <Text style={styles.levelLabel}>{i === 0 ? "FOUNDATIONS" : `LEVEL ${i}`}</Text>
            {tier.map((n, j) => {
              const st = STATUS[n.status];
              const missing = n.prerequisites.filter((p) => !["mastered", "covered"].includes(trail!.topics.find((x) => x.id === p)?.status ?? ""));
              return (
                <Animated.View key={n.id} entering={enter(tiers.slice(0, i).reduce((a, t) => a + t.length, 0) + j)}>
                  <PressableScale
                    scaleTo={0.98}
                    style={[styles.node, { backgroundColor: st.bg, borderColor: st.border }]}
                    onPress={() => router.push(`/skill/${n.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${n.label}, ${st.label}, ${Math.round(n.mastery_score * 100)} percent mastery`}
                  >
                    <MaterialIcons name={st.icon} size={24} color={st.border} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nodeTitle, n.status === "locked" && { color: colors.textSecondary }]} numberOfLines={2}>{n.label}</Text>
                      {n.status === "locked" && missing.length > 0 ? (
                        <Text style={styles.nodeMeta} numberOfLines={2}>Needs: {missing.map(labelOf).join(", ")}</Text>
                      ) : (
                        <View style={styles.nodeBarRow}>
                          <ProgressBar value={n.mastery_score} color={st.border} track="rgba(148,163,184,0.25)" delay={300} style={{ flex: 1 }} />
                          <Text style={styles.nodeMeta}>{Math.round(n.mastery_score * 100)}% mastery</Text>
                        </View>
                      )}
                      <Text style={styles.nodeLessons}>
                        {n.video_count} lessons
                        {n.equivalents.length ? ` · also in ${n.equivalents[0].label}` : ""}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
                  </PressableScale>
                </Animated.View>
              );
            })}
          </View>
        ))}

        {trail && (
          <View style={styles.sources}>
            <View style={styles.sourcesHead}>
              <Text style={styles.sectionTitle}>Sources</Text>
              {!adding && (
                <TouchableOpacity onPress={() => setAdding(true)} accessibilityLabel="Add source" hitSlop={8}>
                  <MaterialIcons name="add" size={26} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
            {trail.sources.map((s) => (
              <View key={s.id} style={styles.source}>
                <MaterialIcons name={s.kind === "playlist" ? "playlist-play" : "smart-display"} size={22} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sourceTitle} numberOfLines={2}>{s.title || s.url}</Text>
                  <Text style={[styles.nodeMeta, s.status === "failed" && { color: colors.error }]}>
                    {s.status === "importing" ? "Building topics…" : s.status === "failed" ? s.error || "Import failed" : `${s.topic_count} topics`}
                  </Text>
                </View>
                {s.status === "failed" && <TouchableOpacity onPress={() => sourceAction(s.id, "retry")}><Text style={styles.link}>Retry</Text></TouchableOpacity>}
                {s.status === "ready" && <TouchableOpacity onPress={() => sourceAction(s.id, "rebuild")} accessibilityLabel="Rebuild topics"><MaterialIcons name="refresh" size={22} color={colors.primary} /></TouchableOpacity>}
              </View>
            ))}
            {adding && (
              <View style={{ gap: spacing.sm }}>
                <TextInput style={styles.input} placeholder="YouTube playlist or video link" placeholderTextColor={colors.textMuted} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <PressableScale style={[styles.smallBtn, { backgroundColor: colors.locked }]} onPress={() => setAdding(false)}><Text style={[styles.smallBtnText, { color: colors.textSecondary }]}>Cancel</Text></PressableScale>
                  <PressableScale style={styles.smallBtn} onPress={addSource}><Text style={styles.smallBtnText}>Add</Text></PressableScale>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  topTitle: { ...typography.headlineMd, color: colors.text },
  topMeta: { ...typography.bodySm, color: colors.textSecondary },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  levelLabel: { ...typography.labelSm, color: colors.textSecondary, letterSpacing: 1.2, marginBottom: spacing.sm },
  connector: { alignItems: "center", marginVertical: spacing.xs },
  connectorLine: { width: 2, height: 16, backgroundColor: colors.borderMuted },
  node: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1.5, borderRadius: radii.xl, padding: spacing.md, marginBottom: spacing.sm },
  nodeTitle: { ...typography.titleMd, color: colors.text },
  nodeBarRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  nodeMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  nodeLessons: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  sources: { marginTop: spacing.lg, gap: spacing.sm },
  sourcesHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { ...typography.headlineSm, color: colors.text },
  source: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceWhite, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
  sourceTitle: { ...typography.bodyMd, color: colors.text },
  link: { ...typography.labelLg, color: colors.primary },
  input: { height: 44, borderWidth: 1.5, borderColor: colors.borderMuted, borderRadius: radii.lg, paddingHorizontal: spacing.md, ...typography.bodyMd, color: colors.text, backgroundColor: colors.surfaceWhite },
  smallBtn: { flex: 1, height: 44, borderRadius: radii.full, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  smallBtnText: { ...typography.labelLg, color: "#FFFFFF" },
});
```

Check `lib/api.ts` has `api.delete`; if not, add `delete: <T>(path: string) => request<T>(path, { method: "DELETE" })` next to `get`/`post`.

- [ ] **Step 5: Navigation**
  - `Sidebar.tsx` `ITEMS`: replace `{ href: "/learn", label: "My Path", icon: "account-tree" }` with `{ href: "/trails", label: "Trails", icon: "route" }`; delete the `/add-content` item.
  - `(tabs)/index.tsx`: `router.push("/add-content")` → `router.push("/trail/new")`; `router.push("/learn")` → `router.push("/trails")`; empty-hero copy "Add your first topic" → "Start your first trail", button "Add topic" → "New trail"; hero eyebrow `STUDY NEXT` → `` `${hero.trail_title.toUpperCase()} · STUDY NEXT` `` (add `trail_title: string` to the `Recommendation` type).
  - Delete `src/app/(tabs)/learn.tsx` and `src/app/add-content.tsx`.

- [ ] **Step 6: Typecheck and lint**

Run (from `frontend/`): `npx tsc --noEmit` and `npx expo lint`
Expected: no output from either.

- [ ] **Step 7: Browser check** (local backend + `CI=1 npx expo start --web -c`, Playwright as in the animation walkthrough)

Demo login → sidebar → Trails: "My first trail" card. Tap it → map + Sources. New trail → paste the CampusX link → trail screen shows "Building topics…" then topics appear without a manual refresh. Screenshot each state.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src
git commit -m "Add Trails list, new trail and trail map screens"
```

---

### Task 11: Grounded topic, lesson and practice screens

**Files:**
- Modify: `frontend/src/app/skill/[id].tsx`, `frontend/src/app/lecture/[id].tsx`, `frontend/src/app/practice/[skillId].tsx`, `frontend/src/app/(tabs)/chat.tsx`, `frontend/src/components/VideoPlayer.tsx`, `frontend/src/components/VideoPlayer.web.tsx`

**Interfaces:**
- Consumes: `GET /api/topics/{id}/notes`, `GET /api/game/practice/{id}` (202/200), `GET /api/topics/{id}/lessons/{lid}/check`, lesson detail fields, `/api/recommend/graph` node `equivalents`/`summary`.
- Produces: `VideoPlayer({ videoId, width, start?, end? })`; practice route param `mode=testout`; lecture route param `t` (seconds).

- [ ] **Step 1: VideoPlayer ranges**

`VideoPlayer.tsx`:

```tsx
export function VideoPlayer({ videoId, width, start, end }: { videoId: string; width: number; start?: number; end?: number }) {
  return (
    <YoutubePlayer
      videoId={videoId}
      width={width}
      height={Math.round((width * 9) / 16)}
      play
      initialPlayerParams={{ start, end }}
      webViewProps={{ allowsFullscreenVideo: true }}
    />
  );
}
```

`VideoPlayer.web.tsx`: same props; `src={`https://www.youtube.com/embed/${videoId}?autoplay=1${start ? `&start=${start}` : ""}${end ? `&end=${end}` : ""}`}`.

- [ ] **Step 2: Lesson page** — in `lecture/[id].tsx`:
  - Read `const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();`.
  - Extend `Detail` with `youtube_id: string | null; start_sec: number | null; end_sec: number | null; concepts: { concept: string; explanation: string; timestamp_sec: number | null }[]`.
  - Player: `<VideoPlayer key={`${ytId}-${t ?? ""}`} videoId={ytId} width={playerWidth} start={t ? Number(t) : detail?.start_sec ?? undefined} end={detail?.end_sec ?? undefined} />`.
  - Meta line: append `rangeLabel(detail.start_sec, detail.end_sec)` when present.
  - After the description box, render key concepts when `detail.concepts.length`:

```tsx
<View style={styles.descBox}>
  <Text style={styles.descHeading}>Key concepts</Text>
  {detail.concepts.map((c, i) => (
    <TouchableOpacity key={i} disabled={c.timestamp_sec == null} onPress={() => router.replace(`/lecture/${detail.id}?t=${c.timestamp_sec}`)} style={{ marginTop: spacing.sm }}>
      <Text style={styles.conceptTitle}>{c.concept}{c.timestamp_sec != null ? `  · ${fmtTs(c.timestamp_sec)}` : ""}</Text>
      <Text style={styles.desc}>{c.explanation}</Text>
    </TouchableOpacity>
  ))}
</View>
```

  - Add a "Check your understanding" card above Up next: a button that navigates to `/practice/${detail.skill_id}?lesson=${detail.id}`. Add `conceptTitle: { ...typography.titleMd, color: colors.text }` to styles.

- [ ] **Step 3: Practice** — in `practice/[skillId].tsx`:
  - Params: `const { skillId, lesson, mode } = useLocalSearchParams<{ skillId: string; lesson?: string; mode?: string }>();`
  - Extend `Question` with `lesson_id: string | null; lesson_title: string | null; lesson_index: number | null; timestamp_sec: number | null`, and `Practice` with `method: "captions" | "gemini" | "titles"`.
  - Loading: replace the `api.get` of practice with a polling fetch:

```tsx
const path = lesson ? `/api/topics/${skillId}/lessons/${lesson}/check` : `/api/game/practice/${skillId}`;
const fetchReady = async (): Promise<Practice> => {
  for (;;) {
    const res = await api.get<Practice & { status?: string; progress?: string }>(path);
    if (!res.status) return res;
    if (res.status === "failed") throw new Error(JSON.stringify({ detail: "Could not read the lectures right now. Try again shortly." }));
    setPreparing(res.progress || "");
    await new Promise((r) => setTimeout(r, 3000));
  }
};
```

  Add `const [preparing, setPreparing] = useState<string | null>(null);`, reset it in `load`, and in the loading view show `"Reading the lectures…"` plus `preparing` (e.g. "3 of 7 lessons") under the sparkle line. `api.get` must return the JSON body for a 202; check `request()` in `lib/api.ts` treats any 2xx as success (it uses `res.ok`, which is true for 202).
  - For a lesson check, the topic label comes from the graph: keep `data.skill` when present, else title the header "Quick check".
  - Header title: `mode === "testout" ? "Test out" : data?.skill.label`.
  - In the feedback box after a wrong answer, when `q.lesson_id`:

```tsx
{picked !== q?.answer && q?.lesson_id && (
  <PressableScale style={styles.watchBtn} onPress={() => router.push(`/lecture/${q.lesson_id}${q.timestamp_sec != null ? `?t=${q.timestamp_sec}` : ""}`)}>
    <MaterialIcons name="replay" size={18} color={colors.primary} />
    <Text style={styles.watchText}>
      Watch again · Lesson {q.lesson_index}{q.timestamp_sec != null ? ` at ${fmtTs(q.timestamp_sec)}` : ""}
    </Text>
  </PressableScale>
)}
```

  Styles: `watchBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm, alignSelf: "flex-start", backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.full }`, `watchText: { ...typography.labelMd, color: colors.primary }`.
  - When `data.method === "titles"`, show a one-line note above question 1: "These questions come from lesson titles; the lectures couldn't be read yet."

- [ ] **Step 4: Topic screen** — in `skill/[id].tsx`:
  - Extend `GraphNode` with `summary: string | null; equivalents: { id: string; label: string; trail_title: string }[]; trail_title: string; status: "mastered" | "covered" | "available" | "locked"`.
  - Extend `Video` with `start_sec: number | null; end_sec: number | null`.
  - Load notes without preparing: add `api.get<Notes>(`/api/topics/${id}/notes`).catch(() => null)` to the `Promise.all`, with `type Notes = { status: string; summary: string | null; method: string | null; concepts: { concept: string; explanation: string; lesson_id: string | null; timestamp_sec: number | null }[] }`.
  - Under the mastery card, when `notes?.status === "ready"`: a card with a badge (`notes.method === "titles" ? "From lesson titles" : "From the lectures"`), `notes.summary`, and up to 6 concepts (tap → `/lecture/${c.lesson_id}?t=${c.timestamp_sec}`), "Show all" toggling the rest. When no notes: one muted line, "Key concepts appear after your first practice."
  - When `node.equivalents.length && node.status !== "mastered"`: a banner "Also in {equivalents[0].label}" with a "Test out · 5 questions" button → `/practice/${id}?mode=testout`. When `node.status === "covered"`, the mastery label reads "Covered by {equivalents[0].label}".
  - Lesson rows: under "Lesson n", show `rangeLabel(v.start_sec, v.end_sec)` when present.
  - Tutor button: `router.push({ pathname: "/chat", params: { label, topic: id } })`.

- [ ] **Step 5: Chat** — in `(tabs)/chat.tsx`: read `topic` from `useLocalSearchParams<{ label?: string; topic?: string }>()` and send `topic_id: topic || undefined` alongside `skill_context`.

- [ ] **Step 6: Typecheck and lint**

Run (from `frontend/`): `npx tsc --noEmit` and `npx expo lint`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src
git commit -m "Show grounded concepts, lesson ranges, test-out and watch-again in the app"
```

---

### Task 12: End-to-end scenario, deploy and Render check

**Files:** none new (scratchpad scripts only).

- [ ] **Step 1: Reset the demo account to the scenario**

In the app (local): open "My first trail" → delete it. Create **DSA Trail** from Striver's A2Z playlist, add Luv's CP playlist to it, create **ML Trail** from CampusX. Wait for all three sources to show topic counts.

- [ ] **Step 2: Browser walkthrough** (Playwright, headless, screenshots to the scratchpad)

Check, with screenshots:
1. Trails list shows both trails with topic counts.
2. DSA Trail map: Striver topics, then Luv topics; at least one Luv topic shows "also in …".
3. Open a CampusX topic built from a long video: lessons show time ranges.
4. Practice on that topic: "Reading the lectures… n of m" then questions; answer one wrong → "Watch again · Lesson n at m:ss" → lecture opens at that time.
5. Test out on a Luv topic with an equivalent, answer all correctly until mastered → back on the map the Striver equivalent shows "Covered".
6. Today: the hero names its trail; recommendations never include both members of an overlap group.
7. Tutor from a grounded topic: reply references its lecture.
Collect console errors: expected 0.

- [ ] **Step 3: Deploy**

```bash
git push
```
Wait for Render to deploy (health check `GET https://anvesh-api.onrender.com/api/health`). The migration already ran in Task 1 against the same Supabase database.

- [ ] **Step 4: Render check — the largest unknown**

With the demo token against `https://anvesh-api.onrender.com`: create a throwaway trail from a single short public video; wait for `ready`; call `GET /api/topics/{topic}/notes?prepare=true` and poll.
Expected: `status: "ready"`. Record `method`: `captions` means YouTube serves subtitles to Render; `gemini` means it blocks them and the fallback works; `titles` means both failed — report that to the user before the demo. Delete the throwaway trail.

- [ ] **Step 5: Rebuild the APK**

GitHub → Actions → Android APK → Run workflow (manual). Tell the user to uninstall the old app first.
