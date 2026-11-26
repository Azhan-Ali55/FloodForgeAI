"""Screening-level R = P * C runoff and D8 flow routing simulator."""
from __future__ import annotations

import numpy as np
from .config import Config, load_config
from .metrics import compute_exposure_metrics
from .schemas import InterventionType, Portfolio, Scenario, SimResult, TwinGrid

D8_NEIGHBORS: tuple[tuple[int, int, float], ...] = (
    (-1, 0, 1.0),
    (1, 0, 1.0),
    (0, -1, 1.0),
    (0, 1, 1.0),
    (-1, -1, float(np.sqrt(2.0))),
    (-1, 1, float(np.sqrt(2.0))),
    (1, -1, float(np.sqrt(2.0))),
    (1, 1, float(np.sqrt(2.0))),
)


def d8_flow_accumulation(
    runoff_mm: np.ndarray,
    dem: np.ndarray,
    cell_size_m: float = 30.0,
    passes: int = 8,
) -> np.ndarray:
    rows, cols = dem.shape
    accum = runoff_mm.astype(float).copy()
    transfer_frac = 0.25

    for _ in range(passes):
        best_slope = np.zeros((rows, cols), dtype=float)
        best_dir = np.full((rows, cols), -1, dtype=int)

        for idx, (dr, dc, dist) in enumerate(D8_NEIGHBORS):
            r_src = slice(max(0, -dr), rows - max(0, dr))
            c_src = slice(max(0, -dc), cols - max(0, dc))
            r_dst = slice(max(0, dr), rows - max(0, -dr))
            c_dst = slice(max(0, dc), cols - max(0, -dc))

            drop = dem[r_src, c_src] - dem[r_dst, c_dst]
            slope = np.where(drop > 0.0, drop / (dist * cell_size_m), 0.0)
            better = slope > best_slope[r_src, c_src]
            best_slope[r_src, c_src] = np.where(better, slope, best_slope[r_src, c_src])
            best_dir[r_src, c_src] = np.where(better, idx, best_dir[r_src, c_src])

        next_accum = accum.copy()
        for idx, (dr, dc, _) in enumerate(D8_NEIGHBORS):
            r_src = slice(max(0, -dr), rows - max(0, dr))
            c_src = slice(max(0, -dc), cols - max(0, dc))
            r_dst = slice(max(0, dr), rows - max(0, -dr))
            c_dst = slice(max(0, dc), cols - max(0, -dc))

            mask = best_dir[r_src, c_src] == idx
            outflow = np.where(mask, transfer_frac * accum[r_src, c_src], 0.0)
            next_accum[r_src, c_src] -= outflow
            next_accum[r_dst, c_dst] += outflow

        accum = np.maximum(0.0, next_accum)

    return accum


class ScreeningSimulator:
    def __init__(self, cfg: Config | None = None, d8_passes: int = 8):
        self.cfg = cfg or load_config()
        self.d8_passes = d8_passes

    def _default_runoff_grid(self, land_cover: np.ndarray) -> np.ndarray:
        c_grid = np.full(land_cover.shape, 0.5, dtype=float)
        for code, val in self.cfg.runoff_coefficients.items():
            c_grid[land_cover == int(code)] = float(val)
        return c_grid

    def run_scenario(
        self,
        twin: TwinGrid,
        scenario: Scenario,
        portfolio: Portfolio,
        runoff_coeff_override: np.ndarray | None = None,
    ) -> SimResult:
        rows, cols = twin.shape
        c_grid = (
            runoff_coeff_override.astype(float).copy()
            if runoff_coeff_override is not None
            else self._default_runoff_grid(twin.land_cover)
        )

        storage_mm = np.zeros((rows, cols), dtype=float)
        drainage_mm = np.zeros((rows, cols), dtype=float)
        perm_red = float(self.cfg.raw["interventions"]["permeable_surface"]["runoff_reduction"])

        for item in portfolio.interventions:
            r, c = item.row, item.col
            if not (0 <= r < rows and 0 <= c < cols):
                continue
            if item.type == InterventionType.PERMEABLE_SURFACE:
                frac = min(1.0, item.size / twin.cell_area_m2)
                c_grid[r, c] = max(0.05, c_grid[r, c] * (1.0 - perm_red * frac))
            elif item.type == InterventionType.STORAGE:
                storage_mm[r, c] += (item.size / twin.cell_area_m2) * 1000.0
            elif item.type == InterventionType.DRAINAGE:
                vol_m3 = item.size * scenario.duration_hr
                drainage_mm[r, c] += (vol_m3 / twin.cell_area_m2) * 1000.0

        local_runoff_mm = scenario.total_rainfall_mm * c_grid
        routed_mm = d8_flow_accumulation(
            local_runoff_mm, twin.dem, cell_size_m=twin.cell_size_m, passes=self.d8_passes
        )
        accumulation_mm = np.maximum(0.0, routed_mm - storage_mm - drainage_mm)
        exposed_mask = accumulation_mm > self.cfg.exposure_threshold_mm
        metrics = compute_exposure_metrics(twin, exposed_mask)

        return SimResult(
            accumulation_mm=accumulation_mm,
            exposed_mask=exposed_mask,
            metrics=metrics,
            assumptions=[
                f"Tier 1 screening-level R=P*C and D8 routing on {twin.cell_size_m} m grid; not 1D/2D hydrodynamic depth.",
                f"Exposure threshold set to {self.cfg.exposure_threshold_mm} mm screening accumulation.",
            ],
            screening_level=True,
        )
