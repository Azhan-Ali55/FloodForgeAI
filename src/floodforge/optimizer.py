"""Mode B budget-constrained portfolio optimizer, 1-swap refinement, benchmark & Pareto sweep."""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np

from .config import Config, load_config
from .interventions import build_budget_portfolio, generate_candidate_interventions
from .metrics import audit_risk_transfer
from .schemas import Intervention, Portfolio, RiskTransferReport, Scenario, SimResult, TwinGrid
from .simulation import ScreeningSimulator
from .surrogate import SurrogateBundle


@dataclass
class OptimizationOutcome:
    scenario: Scenario
    baseline_result: SimResult
    best_portfolio: Portfolio
    best_result: SimResult
    risk_transfer: RiskTransferReport
    random_baseline_mean_pop: float
    lift_over_random_pop: float


def objective_from_vector(pred_row: np.ndarray) -> float:
    area, bldgs, pop, roads = [float(x) for x in pred_row]
    return pop + 10.0 * bldgs + 50.0 * area + 2.0 * roads


def objective_from_sim(res: SimResult) -> float:
    m = res.metrics
    return (
        m.population_exposed
        + 10.0 * m.buildings_exposed
        + 50.0 * m.exposed_area_km2
        + 2.0 * m.road_cells_exposed
    )


def optimize_portfolio(
    twin: TwinGrid,
    scenario: Scenario,
    surrogate: SurrogateBundle,
    cfg: Config | None = None,
    simulator: ScreeningSimulator | None = None,
    n_candidates_pool: int = 400,
    shortlist_k: int = 8,
    swap_iters: int = 25,
    seed: int = 42,
) -> OptimizationOutcome:
    cfg = cfg or load_config()
    sim = simulator or ScreeningSimulator(cfg=cfg)
    rng = np.random.default_rng(seed)

    base_res = sim.run_scenario(twin, scenario, Portfolio([]))
    candidates = generate_candidate_interventions(
        twin, cfg=cfg, n_candidates=160, hotspot_mask=base_res.exposed_mask, seed=seed
    )

    pool: list[Portfolio] = [
        build_budget_portfolio(candidates, budget_pkr=scenario.budget_pkr, rng=rng, max_items=10)
        for _ in range(n_candidates_pool)
    ]
    pred_matrix = surrogate.predict_metrics(scenario, pool)
    scores = np.array([objective_from_vector(row) for row in pred_matrix])

    random_pops = pred_matrix[:, 2] if len(pred_matrix) else np.array([base_res.metrics.population_exposed])
    random_mean_pop = float(np.mean(random_pops))

    top_indices = np.argsort(scores)[: min(shortlist_k, len(pool))]
    best_port = pool[int(top_indices[0])]
    best_res = sim.run_scenario(twin, scenario, best_port)
    best_obj = objective_from_sim(best_res)

    for idx in top_indices[1:]:
        cand_port = pool[int(idx)]
        cand_res = sim.run_scenario(twin, scenario, cand_port)
        cand_obj = objective_from_sim(cand_res)
        if cand_obj < best_obj:
            best_obj = cand_obj
            best_port = cand_port
            best_res = cand_res

    current_items = list(best_port.interventions)
    for _ in range(swap_iters):
        if not current_items:
            break
        improved = False
        remove_idx = int(rng.integers(0, len(current_items)))
        without_item = [x for j, x in enumerate(current_items) if j != remove_idx]
        spent_without = sum(x.cost_pkr for x in without_item)

        for repl in candidates:
            if repl.id in {x.id for x in without_item}:
                continue
            if spent_without + repl.cost_pkr <= scenario.budget_pkr:
                trial_port = Portfolio(without_item + [repl])
                trial_res = sim.run_scenario(twin, scenario, trial_port)
                trial_obj = objective_from_sim(trial_res)
                if trial_obj < best_obj:
                    best_obj = trial_obj
                    current_items = trial_port.interventions
                    best_port = trial_port
                    best_res = trial_res
                    improved = True
                    break
        if not improved:
            break

    risk_report = audit_risk_transfer(twin, base_res.accumulation_mm, best_res.accumulation_mm)
    base_pop_red = max(0.0, base_res.metrics.population_exposed - best_res.metrics.population_exposed)
    rand_pop_red = max(0.0, base_res.metrics.population_exposed - random_mean_pop)
    lift = float(base_pop_red - rand_pop_red)

    return OptimizationOutcome(
        scenario=scenario,
        baseline_result=base_res,
        best_portfolio=best_port,
        best_result=best_res,
        risk_transfer=risk_report,
        random_baseline_mean_pop=random_mean_pop,
        lift_over_random_pop=lift,
    )


def pareto_budget_sweep(
    twin: TwinGrid,
    rainfall_mm_per_hr: float,
    duration_hr: float,
    budgets_pkr: list[float],
    surrogate: SurrogateBundle,
    cfg: Config | None = None,
    simulator: ScreeningSimulator | None = None,
    seed: int = 42,
) -> list[dict]:
    rows: list[dict] = []
    for idx, b in enumerate(budgets_pkr):
        sc = Scenario(rainfall_mm_per_hr=rainfall_mm_per_hr, duration_hr=duration_hr, budget_pkr=float(b))
        out = optimize_portfolio(
            twin=twin,
            scenario=sc,
            surrogate=surrogate,
            cfg=cfg,
            simulator=simulator,
            seed=seed + idx,
        )
        base_pop = out.baseline_result.metrics.population_exposed
        opt_pop = out.best_result.metrics.population_exposed
        red_pct = ((base_pop - opt_pop) / base_pop * 100.0) if base_pop > 0 else 0.0
        rows.append(
            {
                "budget_pkr": float(b),
                "spent_pkr": float(out.best_portfolio.total_cost_pkr),
                "pop_reduction_pct": float(red_pct),
                "buildings_exposed_delta": int(out.best_result.metrics.buildings_exposed - out.baseline_result.metrics.buildings_exposed),
                "risk_transfer_flagged": bool(out.risk_transfer.flagged),
            }
        )
    return rows
