"""Demo data for the PS 26101 edition: three demo accounts plus a synthetic organisation of officials.

Run from backend/:  python -m scripts.seed_ps26101
Idempotent: re-running refreshes the synthetic officials. Everything created here is demo data
(emails end in @demo.anvesh.in, except the three login accounts).
"""

import asyncio
import random
from datetime import datetime, timedelta

from sqlalchemy import delete, select

from app.auth import hash_password
from app.catalog.router import sync_catalogue
from app.competency.framework import ROLE_BY_ID
from app.competency.levels import comp_skill_id
from app.database import async_session
from app.models import Course, Enrolment, OfficialProfile, SkillMastery, User

PASSWORD = "demo1234"
ACCOUNTS = [
    ("officer@anvesh.in", "Priya Sharma", "learner", dict(
        designation="Assistant Director", role_id="iss_jts", department="National Statistics Office (FOD)",
        division="Survey Design & Research", current_assignment="Sampling design for PLFS",
        qualifications=["M.Sc. Statistics"], experience_years=4,
        past_trainings=["ISS Probationary Training - Sample surveys", "Python basics workshop"])),
    ("trainer@anvesh.in", "Rakesh Verma", "trainer", dict(
        designation="Deputy Director (Training)", role_id="iss_sts", department="NSSTA",
        division="Training Programmes", current_assignment="Course director, SSS induction",
        qualifications=["M.Stat., ISI"], experience_years=14,
        past_trainings=["Training of Trainers", "Advanced sampling theory", "National accounts compilation"])),
    ("admin@anvesh.in", "Anita Rao", "admin", dict(
        designation="Director", role_id="iss_senior", department="DIID, MoSPI",
        division="Data Informatics & Innovation", current_assignment="Capacity building and training analytics",
        qualifications=["M.Sc. Economics"], experience_years=20,
        past_trainings=["Leadership programme", "Data governance", "Change management"])),
]

DEPARTMENTS = ["National Statistics Office (FOD)", "National Accounts Division", "Price Statistics Division",
               "Social Statistics Division", "Economic Statistics Division", "Data Informatics & Innovation Division",
               "DES Uttar Pradesh", "DES Maharashtra", "DES Odisha"]
FIRST = ["Amit", "Neha", "Sanjay", "Kavita", "Rohit", "Meera", "Arjun", "Pooja", "Vikram", "Sunita", "Deepak", "Anjali",
         "Rahul", "Swati", "Manoj", "Ritu", "Suresh", "Nisha", "Ajay", "Preeti", "Gaurav", "Shalini", "Harish", "Divya"]
LAST = ["Kumar", "Singh", "Patel", "Iyer", "Das", "Nair", "Gupta", "Reddy", "Mishra", "Joshi", "Mehta", "Bose"]


async def upsert_user(db, email, name, role):
    u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not u:
        u = User(email=email, name=name, password_hash=hash_password(PASSWORD))
        db.add(u)
        await db.flush()
    u.name, u.role = name, role
    return u


async def main():
    rng = random.Random(26101)
    async with async_session() as db:
        await sync_catalogue(db)
        courses = (await db.execute(select(Course))).scalars().all()

        for email, name, role, prof in ACCOUNTS:
            u = await upsert_user(db, email, name, role)
            p = await db.get(OfficialProfile, u.id) or OfficialProfile(user_id=u.id)
            for k, v in prof.items():
                setattr(p, k, v)
            p.cadre = ROLE_BY_ID[p.role_id].cadre
            db.add(p)
            if email == "officer@anvesh.in":  # a lived-in learner account for the demo
                await db.execute(delete(SkillMastery).where(SkillMastery.user_id == u.id, SkillMastery.skill_id.like("comp:%")))
                await db.execute(delete(Enrolment).where(Enrolment.user_id == u.id))
                for cid, m in {"survey_design": 0.62, "sampling": 0.55, "python": 0.48, "ethics": 0.7, "communication": 0.58}.items():
                    db.add(SkillMastery(user_id=u.id, skill_id=comp_skill_id(cid), mastery_score=m))
                now = datetime.utcnow()
                for cid, status, prog, score in [("nssta:jts-ind-ethics", "completed", 100, 88), ("igot:python-intro", "enrolled", 60, None),
                                                 ("nssta:iss-ref-sdg", "enrolled", 20, None)]:
                    db.add(Enrolment(user_id=u.id, course_id=cid, status=status, progress=prog, score=score,
                                     enrolled_at=now - timedelta(days=20), completed_at=now - timedelta(days=3) if score else None))
        await db.commit()

        # synthetic organisation
        old = (await db.execute(select(User.id).where(User.email.like("%@demo.anvesh.in")))).scalars().all()
        if old:
            await db.execute(delete(User).where(User.id.in_(old)))
            await db.commit()
        roles = ["jso", "jso", "jso", "sso", "sso", "iss_jts", "iss_jts", "iss_sts", "state_officer", "state_officer", "dpa", "iss_senior"]
        now = datetime.utcnow()
        for i in range(24):
            first, last = FIRST[i], rng.choice(LAST)
            u = await upsert_user(db, f"{first.lower()}.{last.lower()}{i}@demo.anvesh.in", f"{first} {last}", "learner")
            role = ROLE_BY_ID[rng.choice(roles)]
            dept = rng.choice(DEPARTMENTS[6:] if role.id == "state_officer" else DEPARTMENTS[:6])
            db.add(OfficialProfile(user_id=u.id, designation=role.name, role_id=role.id, cadre=role.cadre, department=dept,
                                   current_assignment="", qualifications=["M.Sc. Statistics"] if rng.random() < 0.6 else ["B.Tech"],
                                   experience_years=rng.randint(1, 22), past_trainings=[]))
            # assessed levels: statistical skills stronger than emerging tech, with noise
            for cid, req in role.requirements.items():
                if rng.random() < 0.8:
                    skew = -0.08 if cid in ("ai_ml", "cloud_computing", "apis", "gis", "government_cloud", "dpi") else 0.0
                    m = max(0.05, min(0.98, rng.gauss(req / 5 - 0.12 + skew, 0.16)))
                    db.add(SkillMastery(user_id=u.id, skill_id=comp_skill_id(cid), mastery_score=round(m, 3)))
            # enrolments: courses relevant to the role; some completed
            relevant = [c for c in courses if set(c.competencies or []) & set(role.requirements)]
            for c in rng.sample(relevant, k=min(len(relevant), rng.randint(1, 5))):
                done = rng.random() < 0.55
                db.add(Enrolment(user_id=u.id, course_id=c.id, status="completed" if done else "enrolled",
                                 progress=100 if done else rng.choice([10, 30, 50, 70]),
                                 score=rng.randint(62, 98) if done else None,
                                 enrolled_at=now - timedelta(days=rng.randint(10, 120)),
                                 completed_at=now - timedelta(days=rng.randint(1, 9)) if done else None))
        await db.commit()
    print("seeded: 3 demo accounts (password demo1234) + 24 synthetic officials")


if __name__ == "__main__":
    asyncio.run(main())
