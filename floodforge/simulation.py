"""Screening-level 2D D8 runoff and ponding flood simulator for FloodForge AI.

This is a simplified, fast, transparent hydrological screening model intended
for comparing relative mitigation portfolios within a 36-hour prototype.
It is NOT a full hydrodynamic model (e.g., 2D shallow-water / EPA SWMM).
"""

from dataclasses import dataclass
import hashlib
import numpy as np

from floodforge.metrics import compute_metrics


SIM_CONFIG = {
    "runoff_base": 0.20,          # Runoff coefficient for 0% impervious (soil/grass)
    "runoff_max": 0.95,           # Runoff coefficient for 100% impervious (pavement)
    "flood_depth_threshold_m": 0.15,  # Depth above which a cell is marked flooded
    "cell_size_m": 30.0,          # Grid cell width/height in meters
    "depth_scale": 0.075,         # Empirical scaling from accumulated runoff to depth (m)
    "depth_exponent": 0.50,       # Sub-linear accumulation-to-depth exponent
    "lowness_window": 21,         # Neighborhood window (cells) for local relative elevation
    "lowness_scale": 3.0,         # Elevation drop (m) that doubles local ponding factor
    "ref_duration_hr": 3.0,       # Reference storm duration for intensity adjustment
    "duration_exponent": 0.15,    # Intensity sensitivity to storm duration
}


@dataclass
class SimResult:
    """Container for flood simulation outputs."""

    depth: np.ndarray
    flooded_mask: np.ndarray
    flow_accum: np.ndarray
    metrics: dict


# Module-level cache keyed by DEM hash so flow routing is computed once per DEM.
_DEM_CACHE: dict[tuple, dict] = {}

# 8-neighbor D8 offsets (dr, dc) and step distances
_D8_OFFSETS = [
    (-1, 0, 1.0),
    (-1, 1, np.sqrt(2.0)),
    (0, 1, 1.0),
    (1, 1, np.sqrt(2.0)),
    (1, 0, 1.0),
    (1, -1, np.sqrt(2.0)),
    (0, -1, 1.0),
    (-1, -1, np.sqrt(2.0)),
]


def _box_mean(arr: np.ndarray, window: int) -> np.ndarray:
    """Compute local neighborhood mean using a 2D integral image (pure NumPy)."""
    r = window // 2
    padded = np.pad(arr, ((r, r), (r, r)), mode="edge")
    cs = np.pad(padded, ((1, 0), (1, 0)), mode="constant", constant_values=0.0)
    cs = np.cumsum(np.cumsum(cs, axis=0), axis=1)
    h, w = arr.shape
    total = (
        cs[window : window + h, window : window + w]
        - cs[:h, window : window + w]
        - cs[window : window + h, :w]
        + cs[:h, :w]
    )
    return total / float(window * window)


def _precompute_terrain(dem: np.ndarray, lowness_window: int, lowness_scale: float) -> dict:
    """Compute D8 downstream pointers, topological wavefronts, and local lowness."""
    rows, cols = dem.shape
    n_cells = rows * cols

    # Pad DEM with +inf so boundary cells never flow outside the grid
    padded = np.pad(dem, 1, mode="constant", constant_values=np.inf)

    best_slope = np.zeros((rows, cols), dtype=np.float64)
    downstream_idx = np.full(n_cells, -1, dtype=np.int32)

    rr = np.arange(rows, dtype=np.int32)[:, None]
    cc = np.arange(cols, dtype=np.int32)[None, :]

    for dr, dc, dist in _D8_OFFSETS:
        nbr = padded[1 + dr : 1 + dr + rows, 1 + dc : 1 + dc + cols]
        slope = (dem - nbr) / dist
        better = slope > best_slope
        if np.any(better):
            best_slope[better] = slope[better]
            target_flat = (rr + dr) * cols + (cc + dc)
            downstream_idx[better.ravel()] = target_flat.ravel()[better.ravel()]

    # Build topological wavefronts (Kahn's algorithm) for strictly downhill DAG
    valid = downstream_idx >= 0
    in_degree = np.bincount(downstream_idx[valid], minlength=n_cells).astype(np.int32)

    topo_levels = []
    frontier = np.flatnonzero(in_degree == 0).astype(np.int32)
    while frontier.size > 0:
        topo_levels.append(frontier)
        targets = downstream_idx[frontier]
        targets = targets[targets >= 0]
        if targets.size == 0:
            break
        dec = np.bincount(targets, minlength=n_cells)
        changed = np.flatnonzero(dec > 0)
        in_degree[changed] -= dec[changed]
        frontier = changed[in_degree[changed] == 0].astype(np.int32)

    # Local lowness factor: cells lower than their neighborhood pond deeper
    local_mean = _box_mean(dem, lowness_window)
    rel_drop = np.maximum(0.0, local_mean - dem)
    lowness_factor = 1.0 + rel_drop / lowness_scale

    return {
        "downstream_idx": downstream_idx,
        "topo_levels": topo_levels,
        "lowness_factor": lowness_factor,
    }


def get_terrain_cache(dem: np.ndarray, config: dict | None = None) -> dict:
    """Return cached terrain routing data for a DEM array."""
    cfg = config or SIM_CONFIG
    dem_hash = hashlib.blake2b(dem.tobytes(), digest_size=16).hexdigest()
    key = (dem.shape, dem_hash, cfg["lowness_window"], cfg["lowness_scale"])
    if key not in _DEM_CACHE:
        _DEM_CACHE[key] = _precompute_terrain(
            dem,
            lowness_window=int(cfg["lowness_window"]),
            lowness_scale=float(cfg["lowness_scale"]),
        )
    return _DEM_CACHE[key]


def _parse_intervention(iv) -> tuple[str, list[tuple[int, int]], dict]:
    """Extract (type, cells, params) from an intervention dict or object."""
    if isinstance(iv, dict):
        iv_type = iv["type"]
        cells = iv["cells"]
        params = iv.get("params", {})
    else:
        iv_type = iv.type
        cells = iv.cells
        params = iv.params
    return iv_type, cells, params


def simulate(
    inputs: dict,
    rainfall_mm: float,
    duration_hr: float,
    interventions: list | None = None,
    config: dict | None = None,
) -> SimResult:
    """Run the screening-level flood simulation.

    Parameters
    ----------
    inputs : dict
        Catchment input dictionary (see `mock_data.py`).
    rainfall_mm : float
        Total storm rainfall depth in millimeters.
    duration_hr : float
        Storm duration in hours.
    interventions : list | None
        Optional list of intervention dicts or Intervention objects.
    config : dict | None
        Optional override for `SIM_CONFIG`.

    Returns
    -------
    SimResult
        Contains `depth`, `flooded_mask`, `flow_accum`, and `metrics`.
    """
    cfg = {**SIM_CONFIG, **(config or {})}
    dem = inputs["dem"]
    rows, cols = dem.shape
    n_cells = rows * cols

    cell_size_m = float(inputs.get("cell_size_m", cfg["cell_size_m"]))
    cell_area_m2 = cell_size_m * cell_size_m

    terrain = get_terrain_cache(dem, cfg)
    downstream_idx = terrain["downstream_idx"]
    topo_levels = terrain["topo_levels"]
    lowness_factor = terrain["lowness_factor"]

    # 1. Effective imperviousness (modified by permeable_surface interventions)
    imperv = inputs["landcover_imperviousness"].copy()
    pond_cap_mm = np.zeros(n_cells, dtype=np.float64)
    drain_mult = np.ones(n_cells, dtype=np.float64)
    has_ponds = False
    has_drains = False

    if interventions:
        for iv in interventions:
            iv_type, cells, params = _parse_intervention(iv)
            if not cells:
                continue
            rc = np.asarray(cells, dtype=np.int32)
            r_idx, c_idx = rc[:, 0], rc[:, 1]
            flat_idx = r_idx * cols + c_idx

            if iv_type == "permeable_surface":
                factor = float(params.get("imperv_reduction", 0.50))
                imperv[r_idx, c_idx] = np.clip(
                    imperv[r_idx, c_idx] * (1.0 - factor), 0.0, 1.0
                )
            elif iv_type == "retention_pond":
                has_ponds = True
                cap_m3 = float(params.get("capacity_m3", 2500.0))
                # Convert m3 storage to mm-equivalent distributed over pond cells
                cap_mm_total = (cap_m3 / cell_area_m2) * 1000.0
                cap_per_cell = cap_mm_total / float(len(flat_idx))
                np.add.at(pond_cap_mm, flat_idx, cap_per_cell)
            elif iv_type == "drainage_upgrade":
                has_drains = True
                factor = float(params.get("drainage_reduction", 0.30))
                drain_mult[flat_idx] = np.minimum(drain_mult[flat_idx], 1.0 - factor)

    # 2. Local runoff generation (mm)
    base = float(cfg["runoff_base"])
    max_c = float(cfg["runoff_max"])
    runoff_coeff = base + (max_c - base) * imperv
    runoff_mm = max(0.0, float(rainfall_mm)) * runoff_coeff

    # 3. Route runoff downhill along topological wavefronts
    accum = runoff_mm.ravel().copy()
    for lvl in topo_levels:
        if has_ponds:
            accum[lvl] = np.maximum(0.0, accum[lvl] - pond_cap_mm[lvl])
        if has_drains:
            accum[lvl] *= drain_mult[lvl]

        targets = downstream_idx[lvl]
        valid = targets >= 0
        if np.any(valid):
            np.add.at(accum, targets[valid], accum[lvl[valid]])

    flow_accum = accum.reshape(rows, cols)

    # 4. Estimate ponding flood depth (m) from flow accumulation & local lowness
    intensity_factor = (
        float(cfg["ref_duration_hr"]) / max(float(duration_hr), 0.5)
    ) ** float(cfg["duration_exponent"])

    depth = (
        float(cfg["depth_scale"])
        * ((flow_accum / 1000.0) ** float(cfg["depth_exponent"]))
        * lowness_factor
        * intensity_factor
    )
    flooded_mask = depth > float(cfg["flood_depth_threshold_m"])

    # 5. Compute the 5 impact metrics
    metrics = compute_metrics(inputs, flooded_mask)

    return SimResult(
        depth=depth,
        flooded_mask=flooded_mask,
        flow_accum=flow_accum,
        metrics=metrics,
    )
