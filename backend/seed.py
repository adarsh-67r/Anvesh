"""Seed demo accounts into the database."""
import asyncio

from sqlalchemy import select

from app.database import async_session
from app.models import User
from passlib.context import CryptContext

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEMO_USERS = [
    {"name": "Demo Student", "email": "demo@anvesh.in", "password": "demo1234"},
    {"name": "Adarsh", "email": "adarsh@anvesh.in", "password": "adarsh1234"},
    {"name": "Test Student", "email": "test@anvesh.in", "password": "test1234"},
]


async def seed():
    async with async_session() as db:
        for u in DEMO_USERS:
            exists = (await db.execute(select(User).where(User.email == u["email"]))).scalar_one_or_none()
            if not exists:
                db.add(User(name=u["name"], email=u["email"], password_hash=pwd.hash(u["password"])))
                print(f"Created: {u['email']}")
            else:
                print(f"Exists: {u['email']}")
        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed())
