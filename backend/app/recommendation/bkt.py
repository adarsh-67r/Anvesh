"""Phase 1 — Bayesian Knowledge Tracing (BKT).

Hidden Markov Model with 4 parameters per skill:
  P(L0)    — prior probability of knowing the skill
  P(T)     — probability of learning on each attempt (transition)
  P(G)     — probability of guessing correctly without knowing
  P(S)     — probability of slipping (incorrect despite knowing)

Uses forward algorithm to update P(mastered) after each response.
Default priors from literature; fitted per-skill via EM when data sufficient.
Activates when a skill has >= MIN_ATTEMPTS responses.
"""

from dataclasses import dataclass

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningEvent, SkillMastery

MIN_ATTEMPTS = 200


@dataclass
class BKTParams:
    p_l0: float = 0.1
    p_transit: float = 0.1
    p_guess: float = 0.2
    p_slip: float = 0.1


DEFAULT_PARAMS = BKTParams()


def bkt_forward(responses: list[bool], params: BKTParams) -> float:
    """Run BKT forward algorithm, return final P(learned)."""
    p_l = params.p_l0

    for correct in responses:
        if correct:
            p_correct_given_l = 1.0 - params.p_slip
            p_correct_given_not_l = params.p_guess
        else:
            p_correct_given_l = params.p_slip
            p_correct_given_not_l = 1.0 - params.p_guess

        p_obs = p_l * p_correct_given_l + (1 - p_l) * p_correct_given_not_l
        if p_obs < 1e-10:
            p_obs = 1e-10

        p_l_given_obs = (p_l * p_correct_given_l) / p_obs
        p_l = p_l_given_obs + (1 - p_l_given_obs) * params.p_transit

    return float(p_l)


def fit_bkt_params(sequences: list[list[bool]], max_iter: int = 50) -> BKTParams:
    """Fit BKT parameters via EM algorithm on multiple student response sequences."""
    p_l0 = 0.1
    p_t = 0.1
    p_g = 0.2
    p_s = 0.1

    for _ in range(max_iter):
        sum_l0, sum_t, sum_g, sum_s = 0.0, 0.0, 0.0, 0.0
        count_l0, count_t, count_g, count_s = 0, 0, 0, 0

        for seq in sequences:
            if not seq:
                continue

            p_l = p_l0
            for correct in seq:
                if correct:
                    p_correct = p_l * (1 - p_s) + (1 - p_l) * p_g
                    if p_correct < 1e-10:
                        p_correct = 1e-10
                    p_l_post = (p_l * (1 - p_s)) / p_correct
                else:
                    p_incorrect = p_l * p_s + (1 - p_l) * (1 - p_g)
                    if p_incorrect < 1e-10:
                        p_incorrect = 1e-10
                    p_l_post = (p_l * p_s) / p_incorrect

                sum_g += (1 - p_l_post) * float(correct)
                sum_s += p_l_post * float(not correct)
                count_g += (1 - p_l_post)
                count_s += p_l_post

                p_l_pre_transit = p_l_post
                p_l = p_l_post + (1 - p_l_post) * p_t

                sum_t += (1 - p_l_pre_transit) * p_t
                count_t += (1 - p_l_pre_transit)

            sum_l0 += p_l0
            count_l0 += 1

        if count_g > 0:
            p_g = np.clip(sum_g / count_g, 0.01, 0.49)
        if count_s > 0:
            p_s = np.clip(sum_s / count_s, 0.01, 0.49)
        if count_t > 0:
            p_t = np.clip(sum_t / count_t, 0.01, 0.99)

    return BKTParams(p_l0=float(p_l0), p_transit=float(p_t), p_guess=float(p_g), p_slip=float(p_s))


async def get_skill_attempt_count(db: AsyncSession, skill_id: str) -> int:
    result = await db.execute(
        select(func.count()).where(
            LearningEvent.skill_id == skill_id,
            LearningEvent.event_type == "answer",
        )
    )
    return result.scalar() or 0


async def get_user_responses(db: AsyncSession, user_id: str, skill_id: str) -> list[bool]:
    rows = (
        await db.execute(
            select(LearningEvent.correct)
            .where(
                LearningEvent.user_id == user_id,
                LearningEvent.skill_id == skill_id,
                LearningEvent.event_type == "answer",
                LearningEvent.correct.isnot(None),
            )
            .order_by(LearningEvent.created_at)
        )
    ).scalars().all()
    return [bool(r) for r in rows]


async def get_all_responses_for_skill(db: AsyncSession, skill_id: str) -> list[list[bool]]:
    """Get response sequences grouped by user for parameter fitting."""
    rows = (
        await db.execute(
            select(LearningEvent.user_id, LearningEvent.correct)
            .where(
                LearningEvent.skill_id == skill_id,
                LearningEvent.event_type == "answer",
                LearningEvent.correct.isnot(None),
            )
            .order_by(LearningEvent.user_id, LearningEvent.created_at)
        )
    ).all()

    sequences: dict[str, list[bool]] = {}
    for user_id, correct in rows:
        sequences.setdefault(str(user_id), []).append(bool(correct))
    return list(sequences.values())


async def bkt_mastery(db: AsyncSession, user_id: str, skill_id: str) -> float:
    """Compute BKT mastery for a user-skill pair."""
    attempt_count = await get_skill_attempt_count(db, skill_id)
    if attempt_count < MIN_ATTEMPTS:
        return -1.0  # signal: not enough data for BKT

    all_seqs = await get_all_responses_for_skill(db, skill_id)
    params = fit_bkt_params(all_seqs)

    user_responses = await get_user_responses(db, user_id, skill_id)
    if not user_responses:
        return params.p_l0

    return bkt_forward(user_responses, params)


def can_activate(attempt_count: int) -> bool:
    return attempt_count >= MIN_ATTEMPTS
