"""Candidate intervention generation and cost helpers for Mode B."""
from __future__ import annotations

import numpy as np
from .config import Config, load_config
from .schemas import Intervention, InterventionType, Portfolio, TwinGrid


def intervention_cost(cfg: Config, itype: InterventionType, size: float) -> float:
    inv_cfg = cfg.raw["interventions"]
    if itype == InterventionType.STORAGE:
        return float(size * float(inv_cfg["storage"]["cost_per_m3_pkr"]))
    if itype == InterventionType.PERMEABLE_SURFACE:
        return float(size * float(inv_cfg["permeable_surface"]["cost_per_m2_pkr"]))
    if itype == InterventionType.DRAINAGE:
        return float(size * float(inv_cfg["drainage"]["cost_per_m3hr_pkr"]))
    raise ValueError(f"Unsupported intervention type: {itype}")


def generate_candidate_interventions(
    twin: TwinGrid,
    cfg: Config | None = None,
    n_candidates: int = 120,
    hotspot_mask: np.ndarray | None = None,
    seed: int = 42,
) -> list[Intervention]:
    cfg = cfg or load_config()
    rng = np.random.default_rng(seed)
    rows, cols = twin.shape

    weights = (twin.population + 1.0) * (1.0 + twin.buildings) * (twin.land_cover == 50).astype(float) + 0.25
    if hotspot_mask is not None and hotspot_mask.shape == (rows, cols):
        weights = np.where(hotspot_mask, weights * 4.0, weights)

    probs = weights.ravel()
    probs = probs / probs.sum()
    flat_indices = rng.choice(rows * cols, size=n_candidates, replace=True, p=probs)

    types = [InterventionType.STORAGE, InterventionType.PERMEABLE_SURFACE, InterventionType.DRAINAGE]
    candidates: list[Intervention] = []
    for idx, flat_i in enumerate(flat_indices):
        r, c = divmod(int(flat_i), cols)
        itype = types[int(rng.integers(0, len(types)))]
        size = float(rng.uniform(250.0, 2200.0))
        cost = intervention_cost(cfg, itype, size)
        candidates.append(
            Intervention(
                id=f"cand_{idx}",
                type=itype,
                row=r,
                col=c,
                size=size,
                cost_pkr=cost,
            )
        )
    return candidates


def build_budget_portfolio(
    candidates: list[Intervention],
    budget_pkr: float,
    rng: np.random.Generator,
    max_items: int = 10,
) -> Portfolio:
    if not candidates:
        return Portfolio(interventions=[])
    order = rng.permutation(len(candidates))
    chosen: list[Intervention] = []
    spent = 0.0
    target_k = int(rng.integers(1, max(2, max_items + 1)))

    for i in order:
        if len(chosen) >= target_k:
            break
        item = candidates[int(i)]
        if spent + item.cost_pkr <= budget_pkr:
            spent += item.cost_pkr
            chosen.append(item)
    return Portfolio(interventions=chosen)
