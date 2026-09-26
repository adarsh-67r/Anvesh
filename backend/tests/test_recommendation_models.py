"""Parameter-recovery checks: simulate students from known parameters, fit, compare.

Run: python -m tests.test_recommendation_models   (from backend/)
"""

import numpy as np

from app.recommendation.bkt import BKTParams, bkt_forward, fit_bkt_params
from app.recommendation.irt import estimate_ability, fit_2pl


def simulate_bkt(params: BKTParams, n_students: int, n_attempts: int, rng) -> list[list[bool]]:
    seqs = []
    for _ in range(n_students):
        known = rng.random() < params.p_l0
        seq = []
        for _ in range(n_attempts):
            p = 1 - params.p_slip if known else params.p_guess
            seq.append(bool(rng.random() < p))
            if not known and rng.random() < params.p_transit:
                known = True
        seqs.append(seq)
    return seqs


def test_bkt_recovers_parameters():
    rng = np.random.default_rng(0)
    true = BKTParams(p_l0=0.25, p_transit=0.15, p_guess=0.2, p_slip=0.08)
    fit = fit_bkt_params(simulate_bkt(true, 500, 15, rng))
    assert abs(fit.p_l0 - true.p_l0) < 0.06, fit
    assert abs(fit.p_transit - true.p_transit) < 0.04, fit
    assert abs(fit.p_guess - true.p_guess) < 0.04, fit
    assert abs(fit.p_slip - true.p_slip) < 0.03, fit


def test_bkt_forward_direction():
    p = BKTParams()
    assert bkt_forward([True] * 5, p) > 0.9
    assert bkt_forward([False] * 5, p) < bkt_forward([], p) + 0.1


def test_irt_recovers_parameters():
    rng = np.random.default_rng(1)
    n_users, n_items = 400, 20
    theta = rng.normal(0, 1, n_users)
    a = np.exp(rng.normal(0, 0.3, n_items))
    b = rng.normal(0, 1, n_items)
    u, i = np.meshgrid(np.arange(n_users), np.arange(n_items), indexing="ij")
    u, i = u.ravel(), i.ravel()
    y = rng.random(u.size) < 1 / (1 + np.exp(-a[i] * (theta[u] - b[i])))

    theta_hat, a_hat, b_hat = fit_2pl(u, i, y, n_users, n_items)
    assert np.corrcoef(b, b_hat)[0, 1] > 0.95
    assert np.corrcoef(a, a_hat)[0, 1] > 0.6
    assert np.corrcoef(theta, theta_hat)[0, 1] > 0.85

    strong = estimate_ability([(a_hat[k], b_hat[k], True) for k in range(n_items)])
    weak = estimate_ability([(a_hat[k], b_hat[k], False) for k in range(n_items)])
    assert strong > 1.0 > -1.0 > weak


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
