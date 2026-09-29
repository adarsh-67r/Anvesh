from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="Anvesh — Skill Intelligence for Official Statistics", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.assess.router import router as assess_router
from app.attachments import router as attachments_router
from app.auth import router as auth_router
from app.catalog.router import router as catalog_router
from app.chatbot import router as chat_router
from app.competency.router import router as competency_router
from app.dashboard.router import router as dashboard_router
from app.events import router as events_router

app.include_router(auth_router)
app.include_router(competency_router)
app.include_router(assess_router)
app.include_router(catalog_router)
app.include_router(dashboard_router)
app.include_router(chat_router)
app.include_router(attachments_router)
app.include_router(events_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
