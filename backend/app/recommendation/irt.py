"""Phase 2 — Item Response Theory (2-Parameter Logistic model).

P(correct) = 1 / (1 + exp(-a * (theta - b)))
  theta = student ability
  a     = item discrimination (how well the item separates high/low ability)
  b     = item difficulty (ability level for 50% correct)

Item parameters are fitted jointly with student abilities by penalised maximum
likelihood (MAP with weak normal priors, L-BFGS with analytic gradients).
A student's ability for scoring is then the EAP estimate given those items.
Activates when a skill has >= MIN_RESPONSES responses across >= MIN_USERS users.
"""

import time
from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningEvent

MIN_RESPONSES = 200
MIN_USERS = 10
MASTERY_THRESHOLD = 0.8
CACHE_TTL_SECONDS = 3600

THETA_PRIOR_SD = 1.0
LOG_A_PRIOR_SD = 0.5
B_PRIOR_SD = 2.0


@dataclass
class ItemParams:
    question_id: str
    discrimination: float  # a
    difficulty: float  # b


# ponytail: in-process cache refreshed hourly; move fitting to a scheduled job when running multiple workers
_item_cache: dict[str, tuple[float, dict[str, ItemParams]]] = {}


def p_correct(theta, a, b):
    return 1.0 / (1.0 + np.exp(-np.clip(a * (theta - b), -30, 30)))


def fit_2pl(user_idx: np.ndarray, item_idx: np.ndarray, correct: np.ndarray, n_users: int, n_items: int):
    """Joint MAP fit. Returns (theta[n_users], a[n_items], b[n_items])."""
    y = correct.astype(float)

    def objective(x):
        theta = x[:n_users]
        log_a = x[n_users:n_users + n_items]
        b = x[n_users + n_items:]
        a = np.exp(log_a)

        a_r, b_r, t_r = a[item_idx], b[item_idx], theta[user_idx]
        p = np.clip(p_correct(t_r, a_r, b_r), 1e-9, 1 - 1e-9)
        resid = y - p

        nll = -np.sum(y * np.log(p) + (1 - y) * np.log(1 - p))
        nll += 0.5 * np.sum(theta ** 2) / THETA_PRIOR_SD ** 2
        nll += 0.5 * np.sum(log_a ** 2) / LOG_A_PRIOR_SD ** 2
        nll += 0.5 * np.sum(b ** 2) / B_PRIOR_SD ** 2

        g_theta = -np.bincount(user_idx, a_r * resid, n_users) + theta / THETA_PRIOR_SD ** 2
        g_log_a = -np.bincount(item_idx, a_r * (t_r - b_r) * resid, n_items) + log_a / LOG_A_PRIOR_SD ** 2
        g_b = np.bincount(item_idx, a_r * resid, n_items) + b / B_PRIOR_SD ** 2
        return nll, np.concatenate([g_theta, g_log_a, g_b])

    rate = np.bincount(item_idx, y, n_items) / np.maximum(np.bincount(item_idx, minlength=n_items), 1)
    b0 = -np.log(np.clip(rate, 0.05, 0.95) / (1 - np.clip(rate, 0.05, 0.95)))
    x0 = np.concatenate([np.zeros(n_users), np.zeros(n_items), b0])

    res = minimize(objective, x0, jac=True, method="L-BFGS-B", options={"maxiter": 500})
    x = res.x
    return x[:n_users], np.exp(x[n_users:n_users + n_items]), x[n_users + n_items:]


def estimate_ability(responses: list[tuple[float, float, bool]], prior_mean: float = 0.0, prior_sd: float = THETA_PRIOR_SD) -> float:
    """EAP ability given (a, b, correct) responses."""
    if not responses:
        return prior_mean
    grid = np.linspace(-4, 4, 81)
    a = np.array([r[0] for r in responses])[:, None]
    b = np.array([r[1] for r in responses])[:, None]
    y = np.array([r[2] for r in responses], dtype=float)[:, None]
    p = np.clip(p_correct(grid[None, :], a, b), 1e-9, 1 - 1e-9)
    log_post = (y * np.log(p) + (1 - y) * np.log(1 - p)).sum(axis=0) - 0.5 * ((grid - prior_mean) / prior_sd) ** 2
    post = np.exp(log_post - log_post.max())
    post /= post.sum()
    return float((grid * post).sum())


def expected_score(theta: float, items: list[ItemParams]) -> float:
    """Mastery = expected probability of answering this skill's items correctly."""
    if not items:
        return float(p_correct(theta, 1.0, 0.0))
    a = np.array([i.discrimination for i in items])
    b = np.array([i.difficulty for i in items])
    return float(p_correct(theta, a, b).mean())


def _question_id(context: dict | None, skill_id: str) -> str:
    return (context or {}).get("question_id") or f"q_{skill_id}"


async def get_response_data(db: AsyncSession, skill_id: str) -> tuple[int, int]:
    """Return (total_responses, unique_users) for a skill."""
    row = (
        await db.execute(
            select(func.count(), func.count(func.distinct(LearningEvent.user_id))).where(
                LearningEvent.skill_id == skill_id,
                LearningEvent.event_type == "answer",
                LearningEvent.correct.isnot(None),
            )
        )
    ).one()
    return row[0], row[1]


async def get_item_params(db: AsyncSession, skill_id: str) -> dict[str, ItemParams]:
    cached = _item_cache.get(skill_id)
    if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    rows = (
        await db.execute(
            select(LearningEvent.user_id, LearningEvent.correct, LearningEvent.context).where(
                LearningEvent.skill_id == skill_id,
                LearningEvent.event_type == "answer",
                LearningEvent.correct.isnot(None),
            )
        )
    ).all()

    users: dict[str, int] = {}
    items: dict[str, int] = {}
    u_idx, i_idx, y = [], [], []
    for user_id, correct, context in rows:
        u_idx.append(users.setdefault(str(user_id), len(users)))
        i_idx.append(items.setdefault(_question_id(context, skill_id), len(items)))
        y.append(bool(correct))

    _, a, b = fit_2pl(np.array(u_idx), np.array(i_idx), np.array(y), len(users), len(items))
    params = {qid: ItemParams(qid, float(a[k]), float(b[k])) for qid, k in items.items()}
    _item_cache[skill_id] = (time.monotonic(), params)
    return params


async def irt_mastery(db: AsyncSession, user_id: str, skill_id: str) -> float:
    items = await get_item_params(db, skill_id)
    user_rows = (
        await db.execute(
            select(LearningEvent.correct, LearningEvent.context).where(
                LearningEvent.user_id == user_id,
                LearningEvent.skill_id == skill_id,
                LearningEvent.event_type == "answer",
                LearningEvent.correct.isnot(None),
            )
        )
    ).all()

    responses = []
    for correct, context in user_rows:
        ip = items.get(_question_id(context, skill_id))
        if ip:
            responses.append((ip.discrimination, ip.difficulty, bool(correct)))

    return expected_score(estimate_ability(responses), list(items.values()))


def can_activate(total_responses: int, unique_users: int) -> bool:
    return total_responses >= MIN_RESPONSES and unique_users >= MIN_USERS
