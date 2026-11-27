"""Loads and validates the 200x200 Nullah Lai clipped dataset into TwinGrid."""
from __future__ import annotations

import json
from pathlib import Path
import numpy as np

from .config import Config, load_config
from .schemas import TwinGrid

DEFAULT_CLIPPED_DIR = Path(__file__).resolve().parents[2] / "data" / "processed" / "clipped"
REQUIRED_RASTERS = (
    "dem_filled.npy",
    "f_imp.npy",
    "buildings.npy",
    "population.npy",
    "roads.npy",
    "zones_adm3.npy",
)


def _derive_land_cover_from_f_imp(
    f_imp: np.ndarray, buildings: np.ndarray, roads: np.ndarray
) -> np.ndarray:
    """Maps normalized impervious fraction (0-1) to approximate ESA WorldCover classes."""
    lc = np.full(f_imp.shape, 30, dtype=np.int32)  # grassland default
    lc[f_imp < 0.20] = 10                           # tree cover
    lc[(f_imp >= 0.20) & (f_imp < 0.40)] = 30       # grassland
    lc[(f_imp >= 0.40) & (f_imp < 0.65)] = 60       # bare / sparse
    lc[(f_imp >= 0.65) | (buildings > 0) | roads] = 50  # built-up urban
    return lc


def _load_validated_array(path: Path, dtype: np.dtype | type, name: str) -> np.ndarray:
    if not path.exists():
        raise FileNotFoundError(f"Required geospatial raster missing: {path} ({name})")
    arr = np.load(path).astype(dtype)
    if arr.ndim != 2 or arr.size == 0:
        raise ValueError(f"Raster '{name}' must be a non-empty 2D array, got shape {arr.shape}")
    if np.issubdtype(arr.dtype, np.floating) and not np.all(np.isfinite(arr)):
        bad_count = int(np.sum(~np.isfinite(arr)))
        raise ValueError(f"Raster '{name}' contains {bad_count} non-finite (NaN/Inf) entries")
    return arr


def load_clipped_twin(
    clipped_dir: str | Path | None = None,
    cfg: Config | None = None,
) -> tuple[TwinGrid, dict]:
    """Load and validate the 200x200 Nullah Lai clipped .npy arrays and metadata.json."""
    if cfg is None:
        cfg = load_config()
    cdir = Path(clipped_dir) if clipped_dir is not None else cfg.clipped_data_dir

    if not cdir.exists():
        raise FileNotFoundError(
            f"Clipped digital-twin directory does not exist: {cdir}. "
            "Provision data/processed/clipped/*.npy or set FLOODFORGE_DATA_DIR."
        )

    meta_path = cdir / "metadata.json"
    metadata = json.loads(meta_path.read_text(encoding="utf-8-sig")) if meta_path.exists() else {}

    dem = _load_validated_array(cdir / "dem_filled.npy", np.float64, "dem_filled")
    f_imp_raw = _load_validated_array(cdir / "f_imp.npy", np.float64, "f_imp")
    if float(np.min(f_imp_raw)) < -0.01 or float(np.max(f_imp_raw)) > 1.01:
        raise ValueError(
            f"Raster 'f_imp' out of valid [0, 1] fraction range: "
            f"[{float(np.min(f_imp_raw))}, {float(np.max(f_imp_raw))}]"
        )
    f_imp = np.clip(f_imp_raw, 0.0, 1.0)

    buildings = _load_validated_array(cdir / "buildings.npy", np.int32, "buildings")
    if np.any(buildings < 0):
        raise ValueError("Raster 'buildings' contains negative counts")

    population = _load_validated_array(cdir / "population.npy", np.float64, "population")
    if np.any(population < 0):
        raise ValueError("Raster 'population' contains negative population values")

    roads = _load_validated_array(cdir / "roads.npy", np.int32, "roads") != 0
    zones = _load_validated_array(cdir / "zones_adm3.npy", np.uint8, "zones_adm3")

    facilities: dict[str, np.ndarray] = {}
    hosp_path = cdir / "facilities_hospital.npy"
    school_path = cdir / "facilities_school.npy"
    if hosp_path.exists():
        facilities["hospital"] = _load_validated_array(hosp_path, np.int32, "facilities_hospital") != 0
    if school_path.exists():
        facilities["school"] = _load_validated_array(school_path, np.int32, "facilities_school") != 0
    if not facilities and (cdir / "facilities.npy").exists():
        facilities["facility"] = _load_validated_array(cdir / "facilities.npy", np.int32, "facilities") != 0

    land_cover = _derive_land_cover_from_f_imp(f_imp, buildings, roads)

    pilot_meta = metadata.get("pilot_metadata", {})
    expected_shape = pilot_meta.get("grid_shape")
    if isinstance(expected_shape, list) and len(expected_shape) == 2:
        if tuple(expected_shape) != dem.shape:
            raise ValueError(
                f"Raster shape {dem.shape} does not match metadata grid_shape {tuple(expected_shape)}"
            )

    cell_size_m = float(pilot_meta.get("cell_size_m", cfg.cell_size_m))
    crs = str(pilot_meta.get("crs", cfg.crs))

    twin = TwinGrid(
        dem=dem,
        land_cover=land_cover,
        population=population,
        buildings=buildings,
        roads=roads,
        facilities=facilities,
        cell_size_m=cell_size_m,
        crs=crs,
        f_imp=f_imp,
        zones=zones,
    )
    return twin, metadata
