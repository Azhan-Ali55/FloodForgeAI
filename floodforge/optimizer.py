"""Budget-constrained flood mitigation portfolio optimizer for FloodForge AI.

Uses random search over candidate interventions (with optional greedy local
refinement) to maximize weighted exposure reduction while penalizing any
downstream/inter-zone risk transfer.
"""

from dataclasses import dataclass
import numpy as np

from floodforge.interventions import Intervention, generate_candidates
from floodforge.metrics import risk_transfer_check
from floodforge.simulation import simulate


DEFAULT_WEIGHTS = {
    "buildings_exposed": 0.30,
    "population_exposed": 0.30,
    "road_segments_exposed": 0.15,
    "facilities_exposed": 0.15,
    "exposed_area_km2": 0.10,
}

DEFAULT_RISK_TRANSFER_PENALTY = 0.25


@dataclass
class OptimizationResult:
    """Container for optimization outputs and comparison statistics."""

    best_portfolio: list[Intervention]
    best_score: float
    baseline_metrics: dict
    optimized_metrics: dict
    risk_transfer_table: list[dict]
    history: list[float]
    avg_random_score: float
    worst_random_score: float
    total_cost_pkr: float


def score_portfolio(
    baseline_metrics: dict,
    candidate_metrics: dict,
    risk_transfer_table: list[dict],
    weights: dict | None = None,
    risk_transfer_penalty: float = DEFAULT_RISK_TRANSFER_PENALTY,
) -> float:
    """Compute weighted fractional exposure reduction minus risk-transfer penalty."""
    w = weights or DEFAULT_WEIGHTS
    active_weight_sum = 0.0
    weighted_reduction = 0.0

    for metric_key, weight in w.items():
        base_val = float(baseline_metrics.get(metric_key, 0.0))
        cand_val = float(candidate_metrics.get(metric_key, 0.0))
        if base_val > 0.0:
            reduction = (base_val - cand_val) / base_val
            weighted_reduction += weight * reduction
            active_weight_sum += weight

    score = weighted_reduction / active_weight_sum if active_weight_sum > 0.0 else 0.0

    n_flagged = sum(1 for row in risk_transfer_table if row.get("risk_transfer_flag"))
    score -= risk_transfer_penalty * n_flagged
    return float(score)


def _sample_random_portfolio(
    candidates: list[Intervention],
    budget_pkr: float,
    rng: np.random.Generator,
) -> list[Intervention]:
    """Sample a random subset of candidates whose total cost <= budget_pkr."""
    if not candidates or budget_pkr <= 0.0:
        return []

    indices = rng.permutation(len(candidates))
    target_spend = rng.uniform(0.5, 1.0) * budget_pkr
    chosen = []
    spent = 0.0

    for idx in indices:
        iv = candidates[int(idx)]
        if spent + iv.cost_pkr <= budget_pkr:
            chosen.append(iv)
            spent += iv.cost_pkr
            if spent >= target_spend:
                break

    return chosen


def optimize(
    inputs: dict,
    rainfall_mm: float,
    duration_hr: float,
    budget_pkr: float,
    n_iter: int = 2000,
    seed: int = 0,
    candidates: list[Intervention] | None = None,
    weights: dict | None = None,
    risk_transfer_penalty: float = DEFAULT_RISK_TRANSFER_PENALTY,
    risk_tolerance: float = 0.05,
    local_improve: bool = True,
    surrogate=None,
) -> OptimizationResult:
    """Find a budget-feasible portfolio that maximizes flood exposure reduction.

    Parameters
    ----------
    inputs : dict
        Catchment input dictionary.
    rainfall_mm : float
        Design storm rainfall depth (mm).
    duration_hr : float
        Design storm duration (hr).
    budget_pkr : float
        Maximum allowed total intervention cost in PKR.
    n_iter : int
        Number of random portfolios to evaluate (default 2000).
    seed : int
        Random seed for reproducibility.
    candidates : list[Intervention] | None
        Optional pre-generated candidate list.
    weights : dict | None
        Optional metric weights overriding `DEFAULT_WEIGHTS`.
    risk_transfer_penalty : float
        Score penalty per zone flagged for increased exposure.
    risk_tolerance : float
        Fractional exposure increase allowed per zone before flagging (default 0.05).
    local_improve : bool
        If True, run a quick greedy add/swap pass after random search.
    surrogate : optional
        Optional trained surrogate model (from `surrogate.py`) to pre-screen
        candidates and re-evaluate top 20 with the real simulator.

    Returns
    -------
    OptimizationResult
    """
    rng = np.random.default_rng(seed)
    zones = inputs["zones"]

    baseline_res = simulate(inputs, rainfall_mm, duration_hr, interventions=None)
    baseline_metrics = baseline_res.metrics

    if candidates is None:
        candidates = generate_candidates(inputs, baseline_result=baseline_res)

    history: list[float] = []
    best_portfolio: list[Intervention] = []
    best_res = baseline_res
    best_rt = risk_transfer_check(baseline_res, baseline_res, zones, tolerance=risk_tolerance)
    best_score = 0.0

    # Optional surrogate pre-screening mode (stretch goal)
    if surrogate is not None and n_iter > 20:
        portfolios = [
            _sample_random_portfolio(candidates, budget_pkr, rng)
            for _ in range(n_iter)
        ]
        pred_scores = surrogate.predict_scores(
            rainfall_mm=rainfall_mm,
            duration_hr=duration_hr,
            portfolios=portfolios,
            candidates=candidates,
            baseline_metrics=baseline_metrics,
            weights=weights or DEFAULT_WEIGHTS,
        )
        history = [float(s) for s in pred_scores]
        top_indices = np.argsort(-np.asarray(pred_scores))[:20]
        eval_portfolios = [portfolios[int(i)] for i in top_indices]
    else:
        eval_portfolios = [
            _sample_random_portfolio(candidates, budget_pkr, rng)
            for _ in range(n_iter)
        ]

    for portfolio in eval_portfolios:
        res = simulate(inputs, rainfall_mm, duration_hr, interventions=portfolio)
        rt = risk_transfer_check(baseline_res, res, zones, tolerance=risk_tolerance)
        sc = score_portfolio(
            baseline_metrics,
            res.metrics,
            rt,
            weights=weights,
            risk_transfer_penalty=risk_transfer_penalty,
        )
        if surrogate is None:
            history.append(sc)
        if sc > best_score:
            best_score = sc
            best_portfolio = portfolio
            best_res = res
            best_rt = rt

    avg_random_score = float(np.mean(history)) if history else 0.0
    worst_random_score = float(np.min(history)) if history else 0.0

    # Quick greedy local improvement: try adding any unused affordable candidate
    if local_improve and candidates:
        chosen_ids = {iv.id for iv in best_portfolio}
        spent = sum(iv.cost_pkr for iv in best_portfolio)
        improved = True
        while improved:
            improved = False
            for cand in candidates:
                if cand.id in chosen_ids or spent + cand.cost_pkr > budget_pkr:
                    continue
                trial = best_portfolio + [cand]
                res = simulate(inputs, rainfall_mm, duration_hr, interventions=trial)
                rt = risk_transfer_check(baseline_res, res, zones, tolerance=risk_tolerance)
                sc = score_portfolio(
                    baseline_metrics,
                    res.metrics,
                    rt,
                    weights=weights,
                    risk_transfer_penalty=risk_transfer_penalty,
                )
                if sc > best_score:
                    best_score = sc
                    best_portfolio = trial
                    best_res = res
                    best_rt = rt
                    chosen_ids.add(cand.id)
                    spent += cand.cost_pkr
                    improved = True
                    break

    total_cost = float(sum(iv.cost_pkr for iv in best_portfolio))

    return OptimizationResult(
        best_portfolio=best_portfolio,
        best_score=float(best_score),
        baseline_metrics=baseline_metrics,
        optimized_metrics=best_res.metrics,
        risk_transfer_table=best_rt,
        history=history,
        avg_random_score=avg_random_score,
        worst_random_score=worst_random_score,
        total_cost_pkr=total_cost,
    )
