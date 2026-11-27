"""Loads the real 200x200 Nullah Lai clipped dataset into TwinGrid."""
from __future__ import annotations

import json
from pathlib import Path
import numpy as np

from .config import Config, load_config
from .schemas import TwinGrid

DEFAULT_CLIPPED_DIR = Path(__file__).resolve().parents[2] / "data" / "processed" / "clipped"


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


def load_clipped_twin(
    clipped_dir: str | Path = DEFAULT_CLIPPED_DIR,
    cfg: Config | None = None,
) -> tuple[TwinGrid, dict]:
    """Load the 200x200 Nullah Lai clipped .npy arrays and metadata.json."""
    cdir = Path(clipped_dir)
    if cfg is None:
        cfg = load_config()

    meta_path = cdir / "metadata.json"
    metadata = json.loads(meta_path.read_text(encoding="utf-8-sig")) if meta_path.exists() else {}

    dem = np.load(cdir / "dem_filled.npy").astype(np.float64)
    f_imp = np.clip(np.load(cdir / "f_imp.npy").astype(np.float64), 0.0, 1.0)
    buildings = np.load(cdir / "buildings.npy").astype(np.int32)
    population = np.load(cdir / "population.npy").astype(np.float64)
    roads = np.load(cdir / "roads.npy").astype(bool)
    zones = np.load(cdir / "zones_adm3.npy").astype(np.uint8)

    facilities: dict[str, np.ndarray] = {}
    hosp_path = cdir / "facilities_hospital.npy"
    school_path = cdir / "facilities_school.npy"
    if hosp_path.exists():
        facilities["hospital"] = np.load(hosp_path).astype(bool)
    if school_path.exists():
        facilities["school"] = np.load(school_path).astype(bool)
    if not facilities and (cdir / "facilities.npy").exists():
        facilities["facility"] = np.load(cdir / "facilities.npy").astype(bool)

    land_cover = _derive_land_cover_from_f_imp(f_imp, buildings, roads)

    pilot_meta = metadata.get("pilot_metadata", {})
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


load_floodforge_final_data = load_clipped_twin
