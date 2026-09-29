"""Learning-event logging from the app (focus sessions and content views)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.recommendation.event_logger import log_event

router = APIRouter(prefix="/api/recommend", tags=["events"])

EVENT_TYPES = {"study_session", "content_view"}
MAX_SESSION_MINUTES = 180  # one focus session: pomodoro round, timer or stopwatch


class EventRequest(BaseModel):
    event_type: str
    skill_id: str = "general"
    response_time_ms: int | None = None
    context: dict | None = None


@router.post("/events")
async def log_learning_event(body: EventRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.event_type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"event_type must be one of {sorted(EVENT_TYPES)}")
    if body.context and len(str(body.context)) > 2000:
        raise HTTPException(status_code=413, detail="context too large")
    if body.event_type == "study_session":
        minutes = (body.context or {}).get("minutes")
        if not isinstance(minutes, int) or not 1 <= minutes <= MAX_SESSION_MINUTES:
            raise HTTPException(status_code=400, detail=f"study_session needs context.minutes between 1 and {MAX_SESSION_MINUTES}")
    await log_event(db, str(user.id), body.skill_id[:100], body.event_type,
                    response_time_ms=body.response_time_ms, context=body.context)
    await db.commit()
    return {"ok": True}
