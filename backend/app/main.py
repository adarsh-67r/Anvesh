from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="Anvesh", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.attachments import router as attachments_router
from app.auth import router as auth_router
from app.chatbot import router as chat_router
from app.flashcards import router as flashcards_router
from app.game import router as game_router
from app.recommendation.router import router as recommend_router
from app.study_groups import router as groups_router
from app.todos import router as todos_router
from app.videos import router as videos_router

app.include_router(auth_router)
app.include_router(recommend_router)
app.include_router(chat_router)
app.include_router(videos_router)
app.include_router(flashcards_router)
app.include_router(todos_router)
app.include_router(groups_router)
app.include_router(game_router)
app.include_router(attachments_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
