"""Mitigation intervention definitions and candidate generator for FloodForge AI.

All unit costs (PKR) and hydraulic effect parameters are PLACEHOLDERS for
screening-level prototyping and live in `INTERVENTION_CONFIG` at the top of
this file so teammates can easily adjust them.
"""

from dataclasses import dataclass
import numpy as np


# PLACEHOLDER costs (PKR) and screening-level effect parameters.
# Do NOT use these for engineering design or real-world budgeting.
INTERVENTION_CONFIG = {
    "retention_pond": {
        "unit_cost_pkr": 1_500_000.0,  # PLACEHOLDER: 1.5M PKR per detention/retention basin
        "capacity_m3": 45_000.0,       # Storage volume absorbed from passing flow (~2m x 2.25 ha)
        "patch_radius": 2,             # 5x5 cells (~2.25 ha)
        "min_spacing_cells": 10,
        "max_count": 20,
    },
    "permeable_surface": {
        "unit_cost_pkr": 600_000.0,    # PLACEHOLDER: 0.6M PKR per permeable pavement block
        "imperv_reduction": 0.50,      # Fractional reduction in imperviousness (-50%)
        "patch_radius": 4,             # 9x9 cells (~7.29 ha urban block)
        "min_spacing_cells": 12,
        "max_count": 20,
    },
    "drainage_upgrade": {
        "unit_cost_pkr": 1_000_000.0,  # PLACEHOLDER: 1.0M PKR per storm-drain segment upgrade
        "drainage_reduction": 0.40,    # Fractional reduction in local accumulated flow (-40%)
        "patch_radius": 2,             # 5x5 high-flow corridor cells
        "min_spacing_cells": 10,
        "max_count": 20,
    },
}


@dataclass
class Intervention:
    """A single candidate flood mitigation intervention."""

    id: str
    type: str
    cost_pkr: float
    cells: list[tuple[int, int]]
    center: tuple[int, int]
    zone: int
    params: dict


def _patch_cells(r: int, c: int, radius: int, shape: tuple[int, int]) -> list[tuple[int, int]]:
    """Return valid (row, col) cells in a square patch around (r, c)."""
    rows, cols = shape
    r0, r1 = max(0, r - radius), min(rows, r + radius + 1)
    c0, c1 = max(0, c - radius), min(cols, c + radius + 1)
    return [(int(rr), int(cc)) for rr in range(r0, r1) for cc in range(c0, c1)]


def _select_spaced_peaks(
    score_grid: np.ndarray,
    eligible_mask: np.ndarray,
    max_count: int,
    min_spacing: int,
) -> list[tuple[int, int]]:
    """Greedily pick top-scoring cells separated by at least `min_spacing`."""
    candidates = np.argwhere(eligible_mask)
    if len(candidates) == 0:
        return []

    scores = score_grid[candidates[:, 0], candidates[:, 1]]
    order = np.argsort(-scores)
    selected: list[tuple[int, int]] = []
    min_sq = min_spacing * min_spacing

    for idx in order:
        r, c = int(candidates[idx, 0]), int(candidates[idx, 1])
        if all((r - sr) ** 2 + (c - sc) ** 2 >= min_sq for sr, sc in selected):
            selected.append((r, c))
            if len(selected) >= max_count:
                break

    return selected


def generate_candidates(
    inputs: dict,
    baseline_result=None,
    config: dict | None = None,
) -> list[Intervention]:
    """Automatically generate 30-60 candidate interventions from baseline hydrology.

    Parameters
    ----------
    inputs : dict
        Catchment input dictionary.
    baseline_result : SimResult | None
        Optional precomputed baseline SimResult (computed if omitted).
    config : dict | None
        Optional override for `INTERVENTION_CONFIG`.

    Returns
    -------
    list[Intervention]
        Candidate interventions across retention ponds, permeable surfaces,
        and drainage upgrades.
    """
    if baseline_result is None:
        from floodforge.simulation import simulate

        baseline_result = simulate(inputs, rainfall_mm=100.0, duration_hr=3.0)

    cfg = config or INTERVENTION_CONFIG
    dem = inputs["dem"]
    imperv = inputs["landcover_imperviousness"]
    zones = inputs["zones"]
    flow_accum = baseline_result.flow_accum
    shape = dem.shape

    candidates: list[Intervention] = []

    # 1. Retention ponds: low-lying, high-accumulation cells
    pond_cfg = cfg["retention_pond"]
    low_elev_mask = dem <= np.percentile(dem, 45)
    pond_centers = _select_spaced_peaks(
        score_grid=flow_accum,
        eligible_mask=low_elev_mask & (flow_accum > np.percentile(flow_accum, 70)),
        max_count=int(pond_cfg["max_count"]),
        min_spacing=int(pond_cfg["min_spacing_cells"]),
    )
    for idx, (r, c) in enumerate(pond_centers, start=1):
        candidates.append(
            Intervention(
                id=f"pond_{idx:02d}",
                type="retention_pond",
                cost_pkr=float(pond_cfg["unit_cost_pkr"]),
                cells=_patch_cells(r, c, int(pond_cfg["patch_radius"]), shape),
                center=(r, c),
                zone=int(zones[r, c]),
                params={"capacity_m3": float(pond_cfg["capacity_m3"])},
            )
        )

    # 2. Permeable surfaces: high-imperviousness urban blocks
    perm_cfg = cfg["permeable_surface"]
    perm_mask = imperv >= 0.65
    # Prefer impervious cells that also contribute to downstream accumulation
    perm_score = imperv * np.log1p(flow_accum)
    perm_centers = _select_spaced_peaks(
        score_grid=perm_score,
        eligible_mask=perm_mask,
        max_count=int(perm_cfg["max_count"]),
        min_spacing=int(perm_cfg["min_spacing_cells"]),
    )
    for idx, (r, c) in enumerate(perm_centers, start=1):
        candidates.append(
            Intervention(
                id=f"perm_{idx:02d}",
                type="permeable_surface",
                cost_pkr=float(perm_cfg["unit_cost_pkr"]),
                cells=_patch_cells(r, c, int(perm_cfg["patch_radius"]), shape),
                center=(r, c),
                zone=int(zones[r, c]),
                params={"imperv_reduction": float(perm_cfg["imperv_reduction"])},
            )
        )

    # 3. Drainage upgrades: high-accumulation / flooded cells
    drain_cfg = cfg["drainage_upgrade"]
    drain_mask = flow_accum > np.percentile(flow_accum, 80)
    drain_centers = _select_spaced_peaks(
        score_grid=flow_accum,
        eligible_mask=drain_mask,
        max_count=int(drain_cfg["max_count"]),
        min_spacing=int(drain_cfg["min_spacing_cells"]),
    )
    for idx, (r, c) in enumerate(drain_centers, start=1):
        candidates.append(
            Intervention(
                id=f"drain_{idx:02d}",
                type="drainage_upgrade",
                cost_pkr=float(drain_cfg["unit_cost_pkr"]),
                cells=_patch_cells(r, c, int(drain_cfg["patch_radius"]), shape),
                center=(r, c),
                zone=int(zones[r, c]),
                params={"drainage_reduction": float(drain_cfg["drainage_reduction"])},
            )
        )

    return candidates
