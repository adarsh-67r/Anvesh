"""Phase 2 — Item Response Theory (2-Parameter Logistic model).

P(correct) = 1 / (1 + exp(-a * (theta - b)))
  theta = student ability (estimated per user)
  a     = item discrimination (how well the item separates high/low ability)
  b     = item difficulty (ability level for 50% correct)

Uses Joint MLE for item parameters and EAP (Expected A Posteriori) for student ability.
Activates when a skill has >= MIN_RESPONSES responses across >= MIN_USERS users.
"""

from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningEvent

MIN_RESPONSES = 200
MIN_USERS = 10


@dataclass
class ItemParams:
    question_id: str
    discrimination: float  # a
    difficulty: float  # b


def p_correct(theta: float, a: float, b: float) -> float:
    z = a * (theta - b)
    z = np.clip(z, -30, 30)
    return 1.0 / (1.0 + np.exp(-z))


def estimate_ability(responses: list[tuple[float, float, bool]], prior_mean: float = 0.0, prior_sd: float = 1.0) -> float:
    """EAP estimation of student ability given item params and responses.

    responses: list of (a, b, correct) tuples
    """
    if not responses:
        return prior_mean

    quadrature_points = np.linspace(-4, 4, 41)

    log_likelihood = np.zeros(len(quadrature_points))
    for a, b, correct in responses:
        for i, theta in enumerate(quadrature_points):
            p = p_correct(theta, a, b)
            p = np.clip(p, 1e-10, 1 - 1e-10)
            log_likelihood[i] += np.log(p) if correct else np.log(1 - p)

    log_prior = -0.5 * ((quadrature_points - prior_mean) / prior_sd) ** 2
    log_posterior = log_likelihood + log_prior
    log_posterior -= np.max(log_posterior)
    posterior = np.exp(log_posterior)
    posterior /= np.sum(posterior)

    return float(np.sum(quadrature_points * posterior))


def fit_item_params(
    response_matrix: list[dict],
    max_iter: int = 30,
) -> list[ItemParams]:
    """Joint MLE for 2PL item parameters.

    response_matrix: list of {question_id, responses: [(user_idx, correct)]}
    Returns fitted ItemParams per question.
    """
    items = []
    for item_data in response_matrix:
        qid = item_data["question_id"]
        user_responses = item_data["responses"]

        if len(user_responses) < 5:
            items.append(ItemParams(question_id=qid, discrimination=1.0, difficulty=0.0))
            continue

        correct_rate = sum(1 for _, c in user_responses if c) / len(user_responses)
        init_b = -np.log(correct_rate / max(1 - correct_rate, 0.01))
        init_b = np.clip(init_b, -4, 4)

        def neg_log_lik(params, resps=user_responses):
            a, b = params
            a = max(a, 0.1)
            ll = 0.0
            for _, correct in resps:
                p = p_correct(0.0, a, b)
                p = np.clip(p, 1e-10, 1 - 1e-10)
                ll += np.log(p) if correct else np.log(1 - p)
            return -ll

        result = minimize(neg_log_lik, [1.0, init_b], method="Nelder-Mead",
                          options={"maxiter": max_iter, "xatol": 0.01})
        a_fit, b_fit = result.x
        a_fit = float(np.clip(a_fit, 0.1, 5.0))
        b_fit = float(np.clip(b_fit, -4.0, 4.0))
        items.append(ItemParams(question_id=qid, discrimination=a_fit, difficulty=b_fit))

    return items


async def get_response_data(db: AsyncSession, skill_id: str) -> tuple[int, int]:
    """Return (total_responses, unique_users) for a skill."""
    result = await db.execute(
        select(func.count(), func.count(func.distinct(LearningEvent.user_id))).where(
            LearningEvent.skill_id == skill_id,
            LearningEvent.event_type == "answer",
            LearningEvent.correct.isnot(None),
        )
    )
    row = result.one()
    return row[0], row[1]


async def get_skill_response_matrix(db: AsyncSession, skill_id: str) -> list[dict]:
    """Build response matrix for IRT parameter estimation."""
    rows = (
        await db.execute(
            select(LearningEvent.user_id, LearningEvent.correct, LearningEvent.context)
            .where(
                LearningEvent.skill_id == skill_id,
                LearningEvent.event_type == "answer",
                LearningEvent.correct.isnot(None),
            )
            .order_by(LearningEvent.created_at)
        )
    ).all()

    question_responses: dict[str, list[tuple[str, bool]]] = {}
    user_idx_map: dict[str, int] = {}
    idx = 0
    for user_id, correct, context in rows:
        qid = (context or {}).get("question_id", f"q_{skill_id}")
        uid = str(user_id)
        if uid not in user_idx_map:
            user_idx_map[uid] = idx
            idx += 1
        question_responses.setdefault(qid, []).append((user_idx_map[uid], bool(correct)))

    return [{"question_id": qid, "responses": resps} for qid, resps in question_responses.items()]


async def irt_ability(db: AsyncSession, user_id: str, skill_id: str) -> float:
    """Compute IRT-based student ability estimate for a skill."""
    total, users = await get_response_data(db, skill_id)
    if total < MIN_RESPONSES or users < MIN_USERS:
        return -999.0  # signal: not enough data for IRT

    matrix = await get_skill_response_matrix(db, skill_id)
    item_params = fit_item_params(matrix)

    user_rows = (
        await db.execute(
            select(LearningEvent.correct, LearningEvent.context)
            .where(
                LearningEvent.user_id == user_id,
                LearningEvent.skill_id == skill_id,
                LearningEvent.event_type == "answer",
                LearningEvent.correct.isnot(None),
            )
            .order_by(LearningEvent.created_at)
        )
    ).all()

    if not user_rows:
        return 0.0

    param_map = {ip.question_id: ip for ip in item_params}
    responses = []
    for correct, context in user_rows:
        qid = (context or {}).get("question_id", f"q_{skill_id}")
        if qid in param_map:
            ip = param_map[qid]
            responses.append((ip.discrimination, ip.difficulty, bool(correct)))

    if not responses:
        return 0.0

    return estimate_ability(responses)


def can_activate(total_responses: int, unique_users: int) -> bool:
    return total_responses >= MIN_RESPONSES and unique_users >= MIN_USERS
