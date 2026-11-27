"""Spatial GIS & raster ingestion utilities for FloodForge AI."""
from __future__ import annotations

from pathlib import Path
import numpy as np
from .schemas import TwinGrid


def load_twin_from_arrays(
    arrays_dir: str | Path,
    cell_size_m: float = 30.0,
    crs: str = "EPSG:32643",
) -> TwinGrid:
    """Load aligned .npy rasters from a directory into a TwinGrid."""
    p = Path(arrays_dir)
    dem = np.load(p / "dem.npy").astype(float)
    land_cover = np.load(p / "land_cover.npy").astype(int)
    population = np.load(p / "population.npy").astype(float)
    buildings = np.load(p / "buildings.npy").astype(int)
    roads = np.load(p / "roads.npy").astype(bool)

    facilities: dict[str, np.ndarray] = {}
    for fac_path in sorted(p.glob("facility_*.npy")):
        name = fac_path.stem.replace("facility_", "", 1)
        facilities[name] = np.load(fac_path).astype(bool)

    return TwinGrid(
        dem=dem,
        land_cover=land_cover,
        population=population,
        buildings=buildings,
        roads=roads,
        facilities=facilities,
        cell_size_m=cell_size_m,
        crs=crs,
    )


def load_floodforge_final_data(
    data_dir: str | Path = "/content/FloodForgeAI/data/FloodForge_Final_Data",
    cell_size_m: float = 30.0,
    crs: str = "EPSG:32643",
    use_filled_dem: bool = True,
) -> TwinGrid:
    """Load the 200x200 FloodForge_Final_Data bundle into a TwinGrid."""
    p = Path(data_dir)
    dem_file = p / ("dem_filled.npy" if (use_filled_dem and (p / "dem_filled.npy").exists()) else "dem.npy")
    dem = np.nan_to_num(np.load(dem_file).astype(float), nan=0.0)

    lc_raw = np.load(p / "landcover.npy").astype(float)
    lc_clean = np.where(np.isnan(lc_raw), 50.0, lc_raw).astype(int)

    population = np.nan_to_num(np.load(p / "population.npy").astype(float), nan=0.0)
    buildings = np.nan_to_num(np.load(p / "buildings.npy").astype(float), nan=0.0).astype(int)
    roads = np.nan_to_num(np.load(p / "roads.npy").astype(float), nan=0.0).astype(bool)

    facilities: dict[str, np.ndarray] = {}
    fac_file = p / "facilities.npy"
    if fac_file.exists():
        fac_arr = np.load(fac_file, allow_pickle=True)
        if fac_arr.dtype == object and fac_arr.ndim == 0 and isinstance(fac_arr.item(), dict):
            for k, v in fac_arr.item().items():
                facilities[str(k)] = np.asarray(v, dtype=bool)
        else:
            facilities["facility"] = np.nan_to_num(fac_arr.astype(float), nan=0.0).astype(bool)

    return TwinGrid(
        dem=dem,
        land_cover=lc_clean,
        population=population,
        buildings=buildings,
        roads=roads,
        facilities=facilities,
        cell_size_m=cell_size_m,
        crs=crs,
    )
