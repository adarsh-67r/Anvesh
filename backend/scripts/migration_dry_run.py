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
