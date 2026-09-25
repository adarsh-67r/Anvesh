from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    token: str
    user: dict


def create_token(user_id: UUID) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_token(token: str) -> UUID:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return UUID(payload["sub"])
    except (JWTError, ValueError, KeyError) as e:
        raise HTTPException(status_code=401, detail="Invalid token") from e


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user or not pwd.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": create_token(user.id), "user": {"id": str(user.id), "name": user.name, "email": user.email}}


@router.post("/register", response_model=TokenResponse)
async def register(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    exists = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Email taken")
    user = User(name=body.email.split("@")[0], email=body.email, password_hash=pwd.hash(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"token": create_token(user.id), "user": {"id": str(user.id), "name": user.name, "email": user.email}}
