"""Input/output helpers for FloodForge AI.

Loads real catchment inputs when available, otherwise falls back to
synthetic mock data so the model and optimizer always work out of the box.
"""

from pathlib import Path
import json
import numpy as np

from floodforge.mock_data import generate_mock_inputs


def _fill_dem_nans(dem: np.ndarray) -> np.ndarray:
    """Replace any remaining NaN/Inf DEM cells with nearest valid or median value."""
    arr = np.asarray(dem, dtype=np.float64).copy()
    invalid = ~np.isfinite(arr)
    if not np.any(invalid):
        return arr
    valid = ~invalid
    if not np.any(valid):
        return np.zeros_like(arr, dtype=np.float64)
    try:
        from scipy.ndimage import distance_transform_edt

        _, indices = distance_transform_edt(invalid, return_distances=True, return_indices=True)
        arr[invalid] = arr[tuple(indices[:, invalid])]
    except ImportError:
        arr[invalid] = float(np.median(arr[valid]))
    return arr


def _raster_to_facilities(fac_arr: np.ndarray) -> list[tuple[int, int, str]]:
    """Convert a 2D rasterized critical-facilities mask/count to (row, col, type) tuples."""
    arr = np.nan_to_num(np.asarray(fac_arr, dtype=np.float64), nan=0.0)
    coords = np.argwhere(arr > 0)
    return [(int(r), int(c), "critical_facility") for r, c in coords]


def sanitize_inputs(raw: dict) -> dict:
    """Sanitize real GIS rasters (NaN, -99999 NoData, dtypes) to match FloodForge contract."""
    data = dict(raw)

    if "f_imp" in data and "landcover_imperviousness" not in data:
        data["landcover_imperviousness"] = data.pop("f_imp")

    data["dem"] = _fill_dem_nans(data["dem"])

    imperv = np.asarray(data["landcover_imperviousness"], dtype=np.float64).copy()
    imperv = np.where(np.isfinite(imperv) & (imperv >= 0.0), imperv, 0.20)
    data["landcover_imperviousness"] = np.clip(imperv, 0.0, 1.0)

    pop = np.asarray(data["population"], dtype=np.float64).copy()
    pop = np.where(np.isfinite(pop) & (pop >= 0.0), pop, 0.0)
    data["population"] = pop

    bld = np.asarray(data["buildings"], dtype=np.float64)
    bld = np.where(np.isfinite(bld) & (bld >= 0.0), bld, 0.0)
    data["buildings"] = np.rint(bld).astype(int)

    roads = np.asarray(data["roads"], dtype=np.float64)
    roads = np.where(np.isfinite(roads) & (roads > 0.0), 1, 0)
    data["roads"] = roads.astype(int)

    zones = np.asarray(data["zones"], dtype=np.float64)
    zones = np.where(np.isfinite(zones) & (zones > 0.0), zones, 0.0)
    data["zones"] = np.rint(zones).astype(int)

    if "road_segments" in data and data["road_segments"] is not None:
        rs = np.asarray(data["road_segments"], dtype=np.float64)
        rs = np.where(np.isfinite(rs) & (rs > 0.0), rs, 0.0)
        data["road_segments"] = np.rint(rs).astype(int)

    fac = data.get("facilities", [])
    if isinstance(fac, np.ndarray):
        if fac.ndim == 2:
            data["facilities"] = _raster_to_facilities(fac)
        else:
            data["facilities"] = [tuple(x) for x in fac.tolist()]
    elif fac is None:
        data["facilities"] = []

    if "cell_size_m" in data and isinstance(data["cell_size_m"], np.ndarray):
        data["cell_size_m"] = float(data["cell_size_m"].item())
    else:
        data["cell_size_m"] = float(data.get("cell_size_m", 30.0))

    return data


def summarize_inputs(inputs: dict) -> dict:
    """Return a concise diagnostic summary of loaded catchment rasters."""
    zones = inputs["zones"]
    zone_ids = sorted(int(z) for z in np.unique(zones) if z > 0)
    return {
        "shape": tuple(inputs["dem"].shape),
        "cell_size_m": float(inputs.get("cell_size_m", 30.0)),
        "dem_min_m": round(float(np.min(inputs["dem"])), 2),
        "dem_max_m": round(float(np.max(inputs["dem"])), 2),
        "mean_impervious_pct": round(float(np.mean(inputs["landcover_imperviousness"]) * 100.0), 1),
        "total_population": round(float(np.sum(inputs["population"])), 1),
        "total_buildings": int(np.sum(inputs["buildings"])),
        "road_cells": int(np.sum(inputs["roads"] > 0)),
        "facility_count": len(inputs.get("facilities", [])),
        "equity_zones": zone_ids,
    }


def load_inputs(path: str | Path | None = None, seed: int = 42) -> dict:
    """Load catchment inputs from disk or fall back to mock data.

    Parameters
    ----------
    path : str | Path | None
        Optional path to a `.npz` bundle or a directory containing `.npy`
        arrays (`dem.npy`, `landcover_imperviousness.npy` or `f_imp.npy`,
        `population.npy`, `buildings.npy`, `roads.npy`, `zones.npy`, and
        optional `road_segments.npy`, `facilities.npy`/`critical_facilities.npy`,
        or `facilities.json`).
    seed : int
        Random seed used when falling back to mock data.

    Returns
    -------
    dict
        Catchment input dictionary matching the FloodForge input contract.
    """
    if path is None:
        return generate_mock_inputs(seed=seed)

    p = Path(path)
    if not p.exists():
        return generate_mock_inputs(seed=seed)

    if p.is_file() and p.suffix == ".npz":
        with np.load(p, allow_pickle=True) as npz:
            data = {k: npz[k] for k in npz.files}
        if "critical_facilities" in data and "facilities" not in data:
            data["facilities"] = data.pop("critical_facilities")
        return sanitize_inputs(data)

    if p.is_dir():
        imperv_file = p / "landcover_imperviousness.npy"
        if not imperv_file.exists() and (p / "f_imp.npy").exists():
            imperv_file = p / "f_imp.npy"

        required_arrays = ["dem", "population", "buildings", "roads", "zones"]
        if imperv_file.exists() and all((p / f"{name}.npy").exists() for name in required_arrays):
            data = {name: np.load(p / f"{name}.npy") for name in required_arrays}
            data["landcover_imperviousness"] = np.load(imperv_file)
            if (p / "road_segments.npy").exists():
                data["road_segments"] = np.load(p / "road_segments.npy")
            if (p / "facilities.npy").exists():
                data["facilities"] = np.load(p / "facilities.npy")
            elif (p / "critical_facilities.npy").exists():
                data["facilities"] = np.load(p / "critical_facilities.npy")
            elif (p / "facilities.json").exists():
                with open(p / "facilities.json", "r", encoding="utf-8") as f:
                    data["facilities"] = [tuple(item) for item in json.load(f)]
            else:
                data["facilities"] = []
            data["cell_size_m"] = 30.0
            return sanitize_inputs(data)

    return generate_mock_inputs(seed=seed)
