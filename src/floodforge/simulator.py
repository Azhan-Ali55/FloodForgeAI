"""D8 topological flow routing simulator implementing schemas.Simulator."""
from __future__ import annotations

import hashlib
import math
import numpy as np

from .config import Config, load_config
from .schemas import (
    ExposureMetrics,
    Intervention,
    InterventionType,
    Portfolio,
    RiskTransferReport,
    Scenario,
    SimResult,
    TwinGrid,
)

NEIGHBORS = (
    (-1, -1, math.sqrt(2)),
    (-1, 0, 1.0),
    (-1, 1, math.sqrt(2)),
    (0, -1, 1.0),
    (0, 1, 1.0),
    (1, -1, math.sqrt(2)),
    (1, 0, 1.0),
    (1, 1, math.sqrt(2)),
)


def _compute_d8_routing(dem: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (sorted_flat_indices_high_to_low, downstream_flat_index_per_cell, slope_route_fraction)."""
    rows, cols = dem.shape
    flat_dem = dem.ravel()
    order = np.argsort(-flat_dem, kind="mergesort").astype(np.int32)
    downstream = np.full(rows * cols, -1, dtype=np.int32)

    best_slope = np.zeros((rows, cols), dtype=np.float64)
    for dr, dc, dist in NEIGHBORS:
        r_src = slice(max(0, -dr), rows - max(0, dr))
        c_src = slice(max(0, -dc), cols - max(0, dc))
        r_dst = slice(max(0, dr), rows - max(0, -dr))
        c_dst = slice(max(0, dc), cols - max(0, -dc))

        slope = (dem[r_src, c_src] - dem[r_dst, c_dst]) / dist
        better = slope > best_slope[r_src, c_src]
        if np.any(better):
            best_slope[r_src, c_src] = np.where(better, slope, best_slope[r_src, c_src])
            rr, cc = np.mgrid[r_dst, c_dst]
            target_flat = (rr * cols + cc).astype(np.int32)
            ds_view = downstream.reshape((rows, cols))[r_src, c_src]
            ds_view[better] = target_flat[better]

    # Dynamic slope-driven drainage fraction: steeper hills drain 94%, flat channels retain more
    slope_norm = np.clip(best_slope.ravel() / 0.35, 0.0, 1.0)
    route_frac = np.where(downstream != -1, 0.72 + 0.22 * slope_norm, 0.0)
    return order, downstream, route_frac


def _add_kernel_effect(
    target: np.ndarray,
    center_r: int,
    center_c: int,
    radius: int,
    total_value: float,
    decay: float = 0.65,
) -> None:
    rows, cols = target.shape
    weights: list[tuple[int, int, float]] = []
    w_sum = 0.0
    for dr in range(-radius, radius + 1):
        for dc in range(-radius, radius + 1):
            nr, nc = center_r + dr, center_c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                dist = math.hypot(dr, dc)
                if dist <= radius + 0.15:
                    w = 1.0 / (1.0 + dist * decay)
                    weights.append((nr, nc, w))
                    w_sum += w
    if w_sum <= 0:
        return
    for nr, nc, w in weights:
        target[nr, nc] += total_value * (w / w_sum)


def _ward_radius(rows: int, cols: int, target: int = 12) -> int:
    """Scale catchment radius proportionally so coarse synthetic grids stay well-behaved."""
    return min(target, max(2, min(rows, cols) // 8))


def _box_sum(arr: np.ndarray, rad: int) -> np.ndarray:
    """Fast 2D sliding-window sum over a (2*rad + 1) square neighborhood."""
    pad = np.pad(arr, rad)
    csum = np.pad(pad, ((1, 0), (1, 0))).cumsum(axis=0).cumsum(axis=1)
    k = 2 * rad + 1
    return csum[k:, k:] - csum[:-k, k:] - csum[k:, :-k] + csum[:-k, :-k]


class D8Simulator:
    """Screening-level D8 runoff accumulation simulator."""

    def __init__(self, cfg: Config | None = None):
        self.cfg = cfg or load_config()
        self._routing_cache: dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]] = {}

    def _get_routing(self, twin: TwinGrid) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        dem_hash = hashlib.sha256(twin.dem.tobytes()).hexdigest()
        key = f"{twin.shape[0]}x{twin.shape[1]}:{dem_hash}"
        if key not in self._routing_cache:
            self._routing_cache[key] = _compute_d8_routing(twin.dem)
        return self._routing_cache[key]

    def _base_runoff_grid(self, twin: TwinGrid) -> np.ndarray:
        if twin.f_imp is not None:
            # Direct normalized runoff coefficient (R = P * C) from f_imp.npy
            return np.clip(twin.f_imp, 0.05, 1.0)
        coeffs = self.cfg.runoff_coefficients
        out = np.full(twin.shape, 0.5, dtype=np.float64)
        for code, val in coeffs.items():
            out[twin.land_cover == code] = val
        return out

    def _accumulate(
        self,
        twin: TwinGrid,
        scenario: Scenario,
        portfolio: Portfolio,
        runoff_multiplier: float = 1.0,
    ) -> np.ndarray:
        rows, cols = twin.shape
        cell_area_m2 = twin.cell_area_m2
        total_rain_mm = scenario.total_rainfall_mm * scenario.uncertainty_factor
        if total_rain_mm <= 0.0:
            return np.zeros((rows, cols), dtype=np.float64)
        order, downstream, route_frac = self._get_routing(twin)

        perm_cov = np.zeros((rows, cols), dtype=np.float64)
        storage_mm = np.zeros((rows, cols), dtype=np.float64)
        drainage_mm = np.zeros((rows, cols), dtype=np.float64)

        rad = _ward_radius(rows, cols, target=12)
        rad_perm = min(10, rad)
        rad_drain = min(6, rad)

        for item in portfolio.interventions:
            if not (0 <= item.row < rows and 0 <= item.col < cols):
                continue
            if item.type == InterventionType.PERMEABLE_SURFACE:
                # Ward-scale permeable surface block (~1.8 ha) across sub-basin neighborhood
                block_factor = min(2.5, max(0.5, item.size / 16000.0))
                _add_kernel_effect(
                    perm_cov, item.row, item.col, rad_perm, block_factor * 140.0, decay=0.20
                )
            elif item.type == InterventionType.STORAGE:
                # Municipal detention basin (18,000 m3) intercepting runoff across a ward catchment
                eq_mm = (item.size * 1000.0) / cell_area_m2
                _add_kernel_effect(
                    storage_mm, item.row, item.col, rad, eq_mm * 18.0, decay=0.20
                )
            elif item.type == InterventionType.DRAINAGE:
                eq_mm = (item.size * scenario.duration_hr * 1000.0) / cell_area_m2
                _add_kernel_effect(
                    drainage_mm, item.row, item.col, rad_drain, eq_mm * 1.5, decay=0.35
                )

        perm_reduction = float(
            self.cfg.raw["interventions"]["permeable_surface"].get("runoff_reduction", 0.40)
        )
        base_runoff = self._base_runoff_grid(twin)
        wetness_scale = {
            "dry": 0.88,
            "normal": 1.0,
            "wet": 1.12,
            "saturated": 1.25,
        }.get(scenario.antecedent_wetness or "", 1.0)
        pervious_adj = 1.0 + (wetness_scale - 1.0) * (1.0 - base_runoff)
        eff_runoff = np.clip(
            base_runoff * pervious_adj * runoff_multiplier * (1.0 - perm_reduction * np.clip(perm_cov, 0.0, 1.0)),
            0.0,
            1.0,
        )

        # High storm-pulse ponding factor (0.90) with multi-hour natural conveyance attenuation
        ponding_factor = 0.90 / (1.0 + max(0.0, scenario.duration_hr - 4.0) * 0.08)
        inflow = (total_rain_mm * eff_runoff * ponding_factor).ravel().copy()
        accumulation = np.zeros(rows * cols, dtype=np.float64)

        stor_flat = storage_mm.ravel()
        drain_flat = drainage_mm.ravel()

        for idx in order:
            water = inflow[idx]
            if stor_flat[idx] > 0.0:
                water -= min(water * 0.90, stor_flat[idx] * 0.85)
            if drain_flat[idx] > 0.0:
                relieved = min(water * 0.72, drain_flat[idx] * 0.40)
                water -= relieved
                target = int(idx)
                for _ in range(4):
                    nxt = int(downstream[target])
                    if nxt == -1:
                        break
                    target = nxt
                if target != idx:
                    inflow[target] += relieved * 0.42

            nxt = int(downstream[idx])
            if nxt != -1:
                rf = float(route_frac[idx])
                accumulation[idx] = water * (1.0 - rf)
                inflow[nxt] += water * rf
            else:
                accumulation[idx] = water * 0.48

        return accumulation.reshape((rows, cols))

    def _compute_metrics(
        self, twin: TwinGrid, accumulation: np.ndarray, threshold_mm: float
    ) -> tuple[np.ndarray, ExposureMetrics, dict[str, dict[str, float]]]:
        exposed_mask = accumulation >= threshold_mm
        cell_area_km2 = twin.cell_area_m2 / 1_000_000.0

        metrics = ExposureMetrics(
            exposed_area_km2=round(float(np.sum(exposed_mask) * cell_area_km2), 3),
            buildings_exposed=int(np.sum(twin.buildings[exposed_mask])),
            population_exposed=float(round(float(np.sum(twin.population[exposed_mask])), 0)),
            road_cells_exposed=int(np.sum(twin.roads & exposed_mask)),
            facilities_exposed={
                k: int(np.sum(mask & exposed_mask)) for k, mask in twin.facilities.items()
            },
        )

        zone_breakdown: dict[str, dict[str, float]] = {}
        if twin.zones is not None:
            for z_id, z_name in ((1, "upstream_islamabad"), (2, "downstream_rawalpindi")):
                z_mask = twin.zones == z_id
                z_exp = z_mask & exposed_mask
                zone_breakdown[z_name] = {
                    "exposed_area_km2": round(float(np.sum(z_exp) * cell_area_km2), 3),
                    "buildings_exposed": int(np.sum(twin.buildings[z_exp])),
                    "population_exposed": float(round(float(np.sum(twin.population[z_exp])), 0)),
                    "road_cells_exposed": int(np.sum(twin.roads & z_exp)),
                    "hospitals_exposed": int(
                        np.sum(twin.facilities.get("hospital", np.zeros(twin.shape, bool)) & z_exp)
                    ),
                    "schools_exposed": int(
                        np.sum(twin.facilities.get("school", np.zeros(twin.shape, bool)) & z_exp)
                    ),
                }

        return exposed_mask, metrics, zone_breakdown

    def run_scenario(
        self,
        twin: TwinGrid,
        scenario: Scenario,
        portfolio: Portfolio,
        baseline_acc: np.ndarray | None = None,
        threshold_mm: float | None = None,
        include_uncertainty: bool = True,
    ) -> SimResult:
        threshold = float(threshold_mm) if threshold_mm is not None else self.cfg.exposure_threshold_mm
        acc = self._accumulate(twin, scenario, portfolio, 1.0)
        exposed_mask, metrics, zone_breakdown = self._compute_metrics(twin, acc, threshold)

        if include_uncertainty:
            low_acc = self._accumulate(twin, scenario, portfolio, 0.88)
            high_acc = self._accumulate(twin, scenario, portfolio, 1.12)
            _, low_m, _ = self._compute_metrics(twin, low_acc, threshold)
            _, high_m, _ = self._compute_metrics(twin, high_acc, threshold)
            uncertainty = {
                "exposed_area_km2": (low_m.exposed_area_km2, high_m.exposed_area_km2),
                "buildings_exposed": (float(low_m.buildings_exposed), float(high_m.buildings_exposed)),
                "population_exposed": (low_m.population_exposed, high_m.population_exposed),
                "road_cells_exposed": (float(low_m.road_cells_exposed), float(high_m.road_cells_exposed)),
            }
        else:
            uncertainty = {}

        risk_transfer = None
        if portfolio.interventions:
            if baseline_acc is None:
                baseline_acc = self._accumulate(twin, scenario, Portfolio(), 1.0)
            worse_mask = (acc - baseline_acc > 1.5) & (acc >= threshold * 0.9)
            b_worse = int(np.sum(twin.buildings[worse_mask]))
            p_worse = float(round(float(np.sum(twin.population[worse_mask])), 0))

            # Flag only if downstream exposed buildings increase by >2% over baseline
            if twin.zones is not None:
                ds_mask = twin.zones == 2
                base_ds_bldg = int(np.sum(twin.buildings[(baseline_acc >= threshold) & ds_mask]))
                mit_ds_bldg = int(np.sum(twin.buildings[exposed_mask & ds_mask]))
                flagged = bool(
                    base_ds_bldg > 0
                    and ((mit_ds_bldg - base_ds_bldg) / base_ds_bldg) > 0.02
                )
            else:
                base_bldg = int(np.sum(twin.buildings[baseline_acc >= threshold]))
                flagged = bool(base_bldg > 0 and (b_worse / base_bldg) > 0.02)

            risk_transfer = RiskTransferReport(
                worse_mask=worse_mask,
                buildings_worse=b_worse,
                population_worse=p_worse,
                flagged=flagged,
            )

        return SimResult(
            accumulation_mm=acc,
            exposed_mask=exposed_mask,
            metrics=metrics,
            risk_transfer=risk_transfer,
            uncertainty=uncertainty,
            assumptions=[
                f"Screening-level D8 runoff routing on {twin.shape[0]}x{twin.shape[1]} ({twin.cell_size_m}m) {twin.crs} grid.",
                f"Exposure cutoff fixed at {threshold} mm modeled accumulation (configs/pilot.yaml).",
                "Placeholder PKR unit costs and +/-12% runoff uncertainty bounds; not design flood depths.",
            ],
            screening_level=True,
            zone_breakdown=zone_breakdown,
        )

    def optimize_portfolio(
        self,
        twin: TwinGrid,
        scenario: Scenario,
        threshold_mm: float | None = None,
        enabled_types: set[InterventionType] | None = None,
    ) -> Portfolio:
        threshold = float(threshold_mm) if threshold_mm is not None else self.cfg.exposure_threshold_mm
        if not math.isfinite(threshold) or threshold <= 0:
            raise ValueError(f"threshold_mm must be finite and > 0, got {threshold}")
        base_res = self.run_scenario(
            twin, scenario, Portfolio(), threshold_mm=threshold, include_uncertainty=False
        )
        acc = base_res.accumulation_mm
        rows, cols = twin.shape
        rad = _ward_radius(rows, cols, target=12)

        exposed = acc >= threshold
        if not np.any(exposed):
            return Portfolio()

        allowed = enabled_types if enabled_types is not None else {
            InterventionType.STORAGE,
            InterventionType.PERMEABLE_SURFACE,
        }
        if not allowed:
            return Portfolio()

        hosp = twin.facilities.get("hospital", np.zeros(twin.shape, dtype=bool))
        school = twin.facilities.get("school", np.zeros(twin.shape, dtype=bool))
        _, downstream, _ = self._get_routing(twin)
        has_downstream = (downstream != -1).reshape(twin.shape)

        # Greedy set-cover across ward catchments targeting deepest channels, tributaries & assets
        tributary_bonus = np.where(has_downstream, 1.25, 0.80)
        deep_bonus = np.where(acc >= threshold * 2.0, 0.25, 0.0)
        uncovered = np.where(
            exposed,
            tributary_bonus * (1.0 + deep_bonus + twin.buildings * 1.5 + hosp * 2.0 + school * 1.2),
            0.0,
        )

        yy, xx = np.ogrid[-rad : rad + 1, -rad : rad + 1]
        disk_mask = np.hypot(yy, xx) <= rad + 0.15
        blocked = np.zeros(twin.shape, dtype=bool)

        chosen: list[Intervention] = []
        spent = 0.0
        budget = scenario.budget_pkr
        stor_cfg = self.cfg.raw["interventions"]["storage"]
        perm_cfg = self.cfg.raw["interventions"]["permeable_surface"]
        drain_cfg = self.cfg.raw["interventions"]["drainage"]
        storage_cost = float(stor_cfg["cost_per_m3_pkr"])
        storage_size = float(stor_cfg.get("default_size", 18000))
        perm_cost = float(perm_cfg["cost_per_m2_pkr"])
        perm_size = float(perm_cfg.get("default_size", 18000))
        drain_cost = float(drain_cfg["cost_per_m3hr_pkr"])
        drain_size = float(drain_cfg.get("default_size", 12000))

        type_options: list[tuple[InterventionType, float, float]] = []
        if InterventionType.STORAGE in allowed:
            type_options.append((InterventionType.STORAGE, storage_size, storage_size * storage_cost))
            type_options.append((InterventionType.STORAGE, storage_size * 0.5, (storage_size * 0.5) * storage_cost))
        if InterventionType.PERMEABLE_SURFACE in allowed:
            type_options.append((InterventionType.PERMEABLE_SURFACE, perm_size, perm_size * perm_cost))
            type_options.append((InterventionType.PERMEABLE_SURFACE, perm_size * 0.5, (perm_size * 0.5) * perm_cost))
        if InterventionType.DRAINAGE in allowed:
            type_options.append((InterventionType.DRAINAGE, drain_size, drain_size * drain_cost))
            type_options.append((InterventionType.DRAINAGE, drain_size * 0.5, (drain_size * 0.5) * drain_cost))

        for _ in range(160):
            if spent >= budget * 0.96 or len(chosen) >= 40:
                break

            remaining = budget - spent
            picked = next(((t, s, c_pkr) for (t, s, c_pkr) in type_options if remaining >= c_pkr), None)
            if picked is None:
                break
            itype, size, cost = picked

            cov_score = np.where(blocked, -1.0, _box_sum(uncovered, rad))
            if float(cov_score.max()) <= 0.0:
                break
            r, c = divmod(int(np.argmax(cov_score)), cols)

            candidate = Intervention(
                id=f"opt-{len(chosen) + 1}",
                type=itype,
                row=r,
                col=c,
                size=size,
                cost_pkr=cost,
            )
            # Storage & permeable surfaces reduce runoff monotonically; only drainage surcharge can divert water downstream
            if candidate.type == InterventionType.DRAINAGE or any(
                c_item.type == InterventionType.DRAINAGE for c_item in chosen
            ):
                test_portfolio = Portfolio(interventions=[*chosen, candidate])
                test_res = self.run_scenario(
                    twin,
                    scenario,
                    test_portfolio,
                    baseline_acc=acc,
                    threshold_mm=threshold,
                    include_uncertainty=False,
                )
                if test_res.risk_transfer and test_res.risk_transfer.flagged:
                    blocked[r, c] = True
                    continue

            chosen.append(candidate)
            spent += cost
            r0, r1 = max(0, r - rad), min(rows, r + rad + 1)
            c0, c1 = max(0, c - rad), min(cols, c + rad + 1)
            d_sub = disk_mask[
                (r0 - (r - rad)) : (2 * rad + 1 - ((r + rad + 1) - r1)),
                (c0 - (c - rad)) : (2 * rad + 1 - ((c + rad + 1) - c1)),
            ]
            uncovered[r0:r1, c0:c1][d_sub] = 0.0
            blocked[r0:r1, c0:c1][d_sub] = True

        return Portfolio(interventions=chosen)
