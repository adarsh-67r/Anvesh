from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Skill, Todo, User
from app.recommendation.ema import get_all_mastered_ids

router = APIRouter(prefix="/api/todos", tags=["todos"])


class TodoCreate(BaseModel):
    title: str
    due_date: date | None = None


class TodoUpdate(BaseModel):
    title: str | None = None
    is_done: bool | None = None
    due_date: date | None = None


@router.get("")
async def list_todos(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    todos = (
        await db.execute(select(Todo).where(Todo.user_id == user.id).order_by(Todo.created_at.desc()))
    ).scalars().all()
    return [_todo_dict(t) for t in todos]


@router.post("")
async def create_todo(body: TodoCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    todo = Todo(user_id=user.id, title=body.title, due_date=body.due_date)
    db.add(todo)
    await db.commit()
    await db.refresh(todo)
    return _todo_dict(todo)


@router.put("/{todo_id}")
async def update_todo(todo_id: UUID, body: TodoUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    todo = await _get_todo(db, todo_id, user.id)
    if body.title is not None:
        todo.title = body.title
    if body.is_done is not None:
        todo.is_done = body.is_done
    if body.due_date is not None:
        todo.due_date = body.due_date
    await db.commit()
    return _todo_dict(todo)


@router.delete("/{todo_id}")
async def delete_todo(todo_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    todo = await _get_todo(db, todo_id, user.id)
    await db.delete(todo)
    await db.commit()
    return {"deleted": True}


@router.post("/carry-forward")
async def carry_forward(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    yesterday = date.today()
    incomplete = (
        await db.execute(
            select(Todo).where(
                Todo.user_id == user.id,
                Todo.is_done == False,
                Todo.due_date < yesterday,
            )
        )
    ).scalars().all()

    carried = []
    for old in incomplete:
        new_todo = Todo(user_id=user.id, title=old.title, due_date=date.today(), carried_from=old.id)
        old.is_done = True
        db.add(new_todo)
        carried.append(old.title)

    await db.commit()
    return {"carried": len(carried), "titles": carried}


@router.get("/suggested")
async def suggested_todos(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Suggest todos based on knowledge graph gaps."""
    mastered = await get_all_mastered_ids(db, str(user.id))
    all_skills = (await db.execute(select(Skill))).scalars().all()
    unmastered = [s for s in all_skills if s.id not in mastered]
    return [
        {"title": f"Study: {s.label}", "skill_id": s.id, "depth": s.depth}
        for s in unmastered[:5]
    ]


async def _get_todo(db: AsyncSession, todo_id: UUID, user_id: UUID) -> Todo:
    todo = (await db.execute(select(Todo).where(Todo.id == todo_id))).scalar_one_or_none()
    if not todo or todo.user_id != user_id:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo


def _todo_dict(t: Todo) -> dict:
    return {
        "id": str(t.id),
        "title": t.title,
        "is_done": t.is_done,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "carried_from": str(t.carried_from) if t.carried_from else None,
    }
