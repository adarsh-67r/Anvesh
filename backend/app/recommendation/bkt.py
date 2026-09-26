"""Phase 1 — Bayesian Knowledge Tracing (BKT).

Two-state hidden Markov model per skill (unknown -> known, no forgetting):
  P(L0) — prior probability of knowing the skill
  P(T)  — probability of learning on each attempt (transition)
  P(G)  — probability of answering correctly without knowing
  P(S)  — probability of answering wrong despite knowing

Parameters are fitted per skill with Baum-Welch (EM using forward-backward).
Per-student mastery is the forward-filtered P(known) after their responses.
Activates when a skill has >= MIN_ATTEMPTS responses.
"""

import time
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningEvent

MIN_ATTEMPTS = 200
MASTERY_THRESHOLD = 0.95
CACHE_TTL_SECONDS = 3600

_EPS = 1e-9


@dataclass
class BKTParams:
    p_l0: float = 0.1
    p_transit: float = 0.1
    p_guess: float = 0.2
    p_slip: float = 0.1


DEFAULT_PARAMS = BKTParams()

# ponytail: in-process cache refreshed hourly; move fitting to a scheduled job when running multiple workers
_param_cache: dict[str, tuple[float, BKTParams]] = {}


def bkt_forward(responses: list[bool], params: BKTParams) -> float:
    """Return P(known) after observing the responses, ready for the next attempt."""
    p_l = params.p_l0
    for correct in responses:
        if correct:
            num = p_l * (1 - params.p_slip)
            den = num + (1 - p_l) * params.p_guess
        else:
            num = p_l * params.p_slip
            den = num + (1 - p_l) * (1 - params.p_guess)
        posterior = num / max(den, _EPS)
        p_l = posterior + (1 - posterior) * params.p_transit
    return float(p_l)


def _emissions(obs: np.ndarray, g: float, s: float) -> np.ndarray:
    """Emission probabilities, shape (n, 2): column 0 = unknown, column 1 = known."""
    p_unknown = np.where(obs, g, 1 - g)
    p_known = np.where(obs, 1 - s, s)
    return np.stack([p_unknown, p_known], axis=1)


def fit_bkt_params(sequences: list[list[bool]], max_iter: int = 100, tol: float = 1e-5) -> BKTParams:
    """Fit BKT parameters with Baum-Welch over many student response sequences."""
    seqs = [np.asarray(s, dtype=bool) for s in sequences if s]
    if not seqs:
        return DEFAULT_PARAMS

    l0, t, g, s = DEFAULT_PARAMS.p_l0, DEFAULT_PARAMS.p_transit, DEFAULT_PARAMS.p_guess, DEFAULT_PARAMS.p_slip
    prev_ll = -np.inf

    for _ in range(max_iter):
        trans = np.array([[1 - t, t], [0.0, 1.0]])
        sum_gamma0_first = 0.0
        xi_learn = 0.0
        gamma_unknown_from = 0.0
        guess_num = guess_den = slip_num = slip_den = 0.0
        total_ll = 0.0

        for obs in seqs:
            n = len(obs)
            emit = _emissions(obs, g, s)

            alpha = np.zeros((n, 2))
            scale = np.zeros(n)
            alpha[0] = np.array([1 - l0, l0]) * emit[0]
            scale[0] = alpha[0].sum() + _EPS
            alpha[0] /= scale[0]
            for k in range(1, n):
                alpha[k] = (alpha[k - 1] @ trans) * emit[k]
                scale[k] = alpha[k].sum() + _EPS
                alpha[k] /= scale[k]

            beta = np.ones((n, 2))
            for k in range(n - 2, -1, -1):
                beta[k] = trans @ (emit[k + 1] * beta[k + 1]) / scale[k + 1]

            gamma = alpha * beta
            gamma /= gamma.sum(axis=1, keepdims=True) + _EPS
            total_ll += np.log(scale).sum()

            sum_gamma0_first += gamma[0, 1]
            for k in range(n - 1):
                xi = alpha[k][:, None] * trans * (emit[k + 1] * beta[k + 1])[None, :] / scale[k + 1]
                xi_learn += xi[0, 1]
                gamma_unknown_from += gamma[k, 0]

            guess_num += (gamma[:, 0] * obs).sum()
            guess_den += gamma[:, 0].sum()
            slip_num += (gamma[:, 1] * ~obs).sum()
            slip_den += gamma[:, 1].sum()

        l0 = float(np.clip(sum_gamma0_first / len(seqs), 0.001, 0.999))
        if gamma_unknown_from > _EPS:
            t = float(np.clip(xi_learn / gamma_unknown_from, 0.001, 0.999))
        # Guess and slip are capped below 0.5 so "known" always means more likely correct.
        if guess_den > _EPS:
            g = float(np.clip(guess_num / guess_den, 0.001, 0.499))
        if slip_den > _EPS:
            s = float(np.clip(slip_num / slip_den, 0.001, 0.499))

        if abs(total_ll - prev_ll) < tol:
            break
        prev_ll = total_ll

    return BKTParams(p_l0=l0, p_transit=t, p_guess=g, p_slip=s)


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
    """Response sequences grouped by user, in time order, for parameter fitting."""
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


async def get_params(db: AsyncSession, skill_id: str) -> BKTParams:
    cached = _param_cache.get(skill_id)
    if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]
    params = fit_bkt_params(await get_all_responses_for_skill(db, skill_id))
    _param_cache[skill_id] = (time.monotonic(), params)
    return params


async def bkt_mastery(db: AsyncSession, user_id: str, skill_id: str) -> float:
    params = await get_params(db, skill_id)
    return bkt_forward(await get_user_responses(db, user_id, skill_id), params)


def can_activate(attempt_count: int) -> bool:
    return attempt_count >= MIN_ATTEMPTS
