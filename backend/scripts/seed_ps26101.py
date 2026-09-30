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
from app.models import Assessment, AssessmentQuestion, Attempt, Course, Enrolment, Material, OfficialProfile, SkillMastery, User

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

# Trainer's published quizzes: (title, kind, competency, [(question, options, answer, explanation, source_ref, difficulty)])
QUIZZES = [
    ("PLFS concepts and definitions", "pdf", "labour_statistics", [
        ("How is the Labour Force Participation Rate (LFPR) defined in PLFS?",
         ["Percentage of persons in the labour force in the population", "Percentage of employed persons in the population",
          "Percentage of unemployed persons in the population", "Percentage of workers among persons of working age"],
         "Percentage of persons in the labour force in the population",
         "LFPR counts everyone working or seeking/available for work, as a share of the whole population.", "Page 2", 1),
        ("Which ratio can never exceed the LFPR for the same population and status?",
         ["Worker Population Ratio (WPR)", "Unemployment Rate (UR)", "Dependency ratio", "Sex ratio"],
         "Worker Population Ratio (WPR)", "Workers are a subset of the labour force, so WPR <= LFPR.", "Page 3", 2),
        ("The Unemployment Rate in PLFS is computed as unemployed persons as a percentage of...",
         ["persons in the labour force", "the total population", "persons of working age", "employed persons"],
         "persons in the labour force", "UR = unemployed / labour force x 100, not the whole population.", "Page 3", 2),
        ("What reference period does the Current Weekly Status (CWS) use?",
         ["The last 7 days", "The last 30 days", "The last 365 days", "The previous calendar month"],
         "The last 7 days", "CWS classifies activity over the 7 days preceding the survey date.", "Page 4", 1),
        ("In usual status (ps+ss), a person outside the labour force by principal status who worked 30 days or more in a subsidiary role is counted as...",
         ["a worker", "unemployed", "outside the labour force", "underemployed only"],
         "a worker", "ps+ss adds subsidiary-status workers (30+ days in the reference year) to principal-status workers.", "Page 5", 3),
    ]),
    ("Sampling design essentials", "pptx", "sampling", [
        ("In stratified random sampling, strata should be...",
         ["internally homogeneous and different from each other", "internally heterogeneous", "of equal size", "chosen after data collection"],
         "internally homogeneous and different from each other", "Homogeneous strata reduce within-stratum variance and so the overall variance.", "Slide 3", 1),
        ("Design effect (deff) compares the variance of a complex design with that of...",
         ["simple random sampling of the same size", "a census", "systematic sampling", "stratified sampling with Neyman allocation"],
         "simple random sampling of the same size", "deff = Var(complex design) / Var(SRS) at the same sample size.", "Slide 6", 2),
        ("Cluster sampling typically increases variance because...",
         ["units within a cluster tend to be similar", "clusters are always small", "it needs a sampling frame of units", "weights are not used"],
         "units within a cluster tend to be similar", "Positive intra-cluster correlation means each extra unit in a cluster adds less new information.", "Slide 7", 2),
        ("Neyman allocation assigns a larger sample to strata with...",
         ["larger size and larger standard deviation", "the smallest cost per unit only", "equal size", "the lowest variability"],
         "larger size and larger standard deviation", "n_h is proportional to N_h x S_h: big and variable strata get more sample.", "Slide 9", 3),
        ("Which is a probability sampling method?",
         ["Systematic sampling with a random start", "Quota sampling", "Snowball sampling", "Convenience sampling"],
         "Systematic sampling with a random start", "A random start gives every unit a known, non-zero selection chance.", "Slide 2", 1),
    ]),
    ("Handling personal data in surveys", "docx", "data_privacy", [
        ("Under the Digital Personal Data Protection Act, 2023, the entity that decides the purpose and means of processing is the...",
         ["Data Fiduciary", "Data Principal", "Data Processor", "Consent Manager"],
         "Data Fiduciary", "The Data Fiduciary determines why and how personal data is processed.", "Section: Key terms", 1),
        ("Before releasing unit-level survey data, the main step to protect respondents is...",
         ["anonymisation / statistical disclosure control", "compressing the files", "releasing only to government IPs", "removing the survey weights"],
         "anonymisation / statistical disclosure control", "Remove direct identifiers and limit re-identification risk before release.", "Section: Data release", 2),
        ("The purpose limitation principle means personal data should be...",
         ["used only for the purpose it was collected for", "kept forever for future use", "shared freely across departments", "collected in as much detail as possible"],
         "used only for the purpose it was collected for", "Re-use for unrelated purposes needs a fresh lawful basis.", "Section: Principles", 2),
        ("A small-area table cell showing 2 respondents with a rare attribute is a risk mainly because of...",
         ["re-identification", "sampling error", "non-response bias", "rounding"],
         "re-identification", "Tiny cells can single people out, so suppress or aggregate them.", "Section: Disclosure risk", 3),
        ("Who is the Data Principal in a household survey?",
         ["The person the data is about", "The survey agency", "The field investigator", "The IT vendor"],
         "The person the data is about", "The Data Principal is the individual to whom the personal data relates.", "Section: Key terms", 1),
    ]),
]


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

        # the trainer's quizzes, taken by the synthetic officials
        trainer = (await db.execute(select(User).where(User.email == "trainer@anvesh.in"))).scalar_one()
        await db.execute(delete(Material).where(Material.owner_id == trainer.id))
        await db.execute(delete(Assessment).where(Assessment.created_by == trainer.id, Assessment.kind == "material"))
        officials = (await db.execute(select(User).where(User.email.like("%@demo.anvesh.in")))).scalars().all()
        for qi, (title, kind, cid, items) in enumerate(QUIZZES):
            m = Material(owner_id=trainer.id, title=title, kind=kind, filename=f"{title.lower().replace(' ', '_')}.{kind}",
                         sections=[], competency_ids=[cid], status="ready")
            db.add(m)
            await db.flush()
            a = Assessment(kind="material", title=title, material_id=m.id, competency_ids=[cid], created_by=trainer.id,
                           published=True, status="ready")
            db.add(a)
            await db.flush()
            qs = []
            for pos, (text, options, answer, why, ref, diff) in enumerate(items):
                q = AssessmentQuestion(assessment_id=a.id, position=pos, text=text, options=options, answer=answer,
                                       explanation=why, source_ref=ref, competency_id=cid, difficulty=diff)
                db.add(q)
                qs.append(q)
            await db.flush()
            for u in rng.sample(officials, k=[18, 14, 11][qi]):
                skill = rng.uniform(0.45, 0.95)
                answers = []
                for q in qs:
                    ok = rng.random() < skill - 0.18 * (q.difficulty - 1)
                    wrong = rng.choice([o for o in q.options if o != q.answer])
                    answers.append({"question_id": str(q.id), "selected": q.answer if ok else wrong, "correct": ok})
                db.add(Attempt(assessment_id=a.id, user_id=u.id, score=sum(x["correct"] for x in answers), total=len(qs),
                               answers=answers, created_at=now - timedelta(days=rng.randint(0, 20), hours=rng.randint(0, 23))))
        await db.commit()
    print("seeded: 3 demo accounts (password demo1234) + 24 synthetic officials + 3 trainer quizzes with attempts")


if __name__ == "__main__":
    asyncio.run(main())
