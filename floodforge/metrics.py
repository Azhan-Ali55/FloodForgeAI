"""Impact metrics and equity / risk-transfer checks for FloodForge AI."""

import numpy as np


DEFAULT_CELL_SIZE_M = 30.0


def compute_metrics(inputs: dict, flooded_mask: np.ndarray) -> dict:
    """Compute the 5 screening-level flood exposure metrics.

    Parameters
    ----------
    inputs : dict
        Catchment input dictionary.
    flooded_mask : np.ndarray
        2D boolean array where True indicates a flooded cell.

    Returns
    -------
    dict
        Dictionary with exact keys:
        - exposed_area_km2 (float)
        - buildings_exposed (int)
        - population_exposed (float)
        - road_segments_exposed (int)
        - facilities_exposed (int)
    """
    mask = np.asarray(flooded_mask, dtype=bool)
    cell_size_m = float(inputs.get("cell_size_m", DEFAULT_CELL_SIZE_M))
    cell_area_km2 = (cell_size_m * cell_size_m) / 1_000_000.0

    exposed_area_km2 = float(np.sum(mask) * cell_area_km2)
    buildings_exposed = int(np.sum(inputs["buildings"][mask]))
    population_exposed = float(np.sum(inputs["population"][mask]))

    if "road_segments" in inputs and inputs["road_segments"] is not None:
        seg_ids = inputs["road_segments"][mask]
        unique_segs = np.unique(seg_ids)
        road_segments_exposed = int(np.sum(unique_segs > 0))
    else:
        road_segments_exposed = int(np.sum(inputs["roads"][mask] > 0))

    facilities_exposed = 0
    rows, cols = mask.shape
    for fac in inputs.get("facilities", []):
        r, c = int(fac[0]), int(fac[1])
        if 0 <= r < rows and 0 <= c < cols and mask[r, c]:
            facilities_exposed += 1

    return {
        "exposed_area_km2": exposed_area_km2,
        "buildings_exposed": buildings_exposed,
        "population_exposed": population_exposed,
        "road_segments_exposed": road_segments_exposed,
        "facilities_exposed": facilities_exposed,
    }


def _extract_mask(result) -> np.ndarray:
    """Extract boolean flooded_mask from SimResult or raw ndarray."""
    if hasattr(result, "flooded_mask"):
        return np.asarray(result.flooded_mask, dtype=bool)
    return np.asarray(result, dtype=bool)


def risk_transfer_check(
    baseline_result,
    optimized_result,
    zones: np.ndarray,
    tolerance: float = 0.05,
    cell_size_m: float = DEFAULT_CELL_SIZE_M,
) -> list[dict]:
    """Check whether any zone experiences an increase in flooded area beyond tolerance.

    Parameters
    ----------
    baseline_result : SimResult or np.ndarray
        Baseline simulation result (or flooded_mask).
    optimized_result : SimResult or np.ndarray
        Mitigated simulation result (or flooded_mask).
    zones : np.ndarray
        2D integer array of neighborhood/zone labels (zone > 0).
    tolerance : float
        Fractional increase allowed before flagging risk transfer (default 0.05 = 5%).
    cell_size_m : float
        Cell resolution in meters (default 30.0).

    Returns
    -------
    list[dict]
        Per-zone summary rows with baseline/optimized flooded area, percent
        change, and `risk_transfer_flag` (True if increase > tolerance).
    """
    base_mask = _extract_mask(baseline_result)
    opt_mask = _extract_mask(optimized_result)
    cell_area_km2 = (cell_size_m * cell_size_m) / 1_000_000.0

    zone_ids = sorted(int(z) for z in np.unique(zones) if z > 0)
    rows = []

    for z in zone_ids:
        z_mask = zones == z
        base_cells = int(np.sum(base_mask & z_mask))
        opt_cells = int(np.sum(opt_mask & z_mask))
        base_area = base_cells * cell_area_km2
        opt_area = opt_cells * cell_area_km2
        delta_area = opt_area - base_area

        if base_cells == 0:
            pct_change = 1.0 if opt_cells > 0 else 0.0
        else:
            pct_change = (opt_cells - base_cells) / base_cells

        flagged = bool(pct_change > tolerance and opt_cells > base_cells)

        rows.append(
            {
                "zone": z,
                "baseline_flooded_cells": base_cells,
                "optimized_flooded_cells": opt_cells,
                "baseline_area_km2": round(base_area, 4),
                "optimized_area_km2": round(opt_area, 4),
                "delta_area_km2": round(delta_area, 4),
                "pct_change": round(pct_change, 4),
                "risk_transfer_flag": flagged,
            }
        )

    return rows
