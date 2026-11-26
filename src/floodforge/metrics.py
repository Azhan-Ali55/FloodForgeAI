"""Exposure metrics and risk-transfer / equity auditing."""
from __future__ import annotations

import numpy as np
from .schemas import ExposureMetrics, RiskTransferReport, TwinGrid


def compute_exposure_metrics(twin: TwinGrid, exposed_mask: np.ndarray) -> ExposureMetrics:
    exposed_area_km2 = float(exposed_mask.sum() * twin.cell_area_m2 / 1e6)
    buildings_exposed = int(twin.buildings[exposed_mask].sum())
    population_exposed = float(twin.population[exposed_mask].sum())
    road_cells_exposed = int((twin.roads & exposed_mask).sum())
    facilities_exposed = {
        name: int((mask & exposed_mask).sum())
        for name, mask in twin.facilities.items()
    }
    return ExposureMetrics(
        exposed_area_km2=exposed_area_km2,
        buildings_exposed=buildings_exposed,
        population_exposed=population_exposed,
        road_cells_exposed=road_cells_exposed,
        facilities_exposed=facilities_exposed,
    )


def audit_risk_transfer(
    twin: TwinGrid,
    baseline_accum_mm: np.ndarray,
    mitigated_accum_mm: np.ndarray,
    tolerance_mm: float = 1e-6,
) -> RiskTransferReport:
    worse_mask = mitigated_accum_mm > (baseline_accum_mm + tolerance_mm)
    buildings_worse = int(twin.buildings[worse_mask].sum())
    population_worse = float(twin.population[worse_mask].sum())
    flagged = bool((buildings_worse > 0) or (population_worse > 0.0))
    return RiskTransferReport(
        worse_mask=worse_mask,
        buildings_worse=buildings_worse,
        population_worse=population_worse,
        flagged=flagged,
    )
