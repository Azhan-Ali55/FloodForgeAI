"""200x200 (30 m, EPSG:32643) Nullah Lai sub-catchment synthetic twin generator."""
from __future__ import annotations

import numpy as np
from .schemas import TwinGrid


def make_nullah_lai_twin(
    shape: tuple[int, int] = (200, 200),
    cell_size_m: float = 30.0,
    crs: str = "EPSG:32643",
    seed: int = 42,
) -> TwinGrid:
    """Generate a Nullah Lai corridor screening grid."""
    rng = np.random.default_rng(seed)
    rows, cols = shape
    r, c = np.mgrid[0:rows, 0:cols]

    channel_center = cols * 0.52 + 12.0 * np.sin(r / 24.0)
    dist_channel = np.abs(c - channel_center)
    slope_profile = np.where(r < rows * 0.35, 1150.0 - 1.4 * r, 650.0 - 0.35 * r)
    channel_incision = 6.0 * np.exp(-((dist_channel / 10.0) ** 2))
    dem = slope_profile + 0.08 * dist_channel - channel_incision + rng.normal(0.0, 0.25, shape)

    land_cover = rng.choice([10, 20, 30, 40, 50, 60], size=shape, p=[0.12, 0.08, 0.15, 0.10, 0.45, 0.10])
    urban_zone = (r > rows * 0.25) & (dist_channel < cols * 0.32)
    land_cover = np.where(urban_zone & (rng.random(shape) < 0.78), 50, land_cover)

    buildings = np.where(land_cover == 50, rng.poisson(5, shape), rng.poisson(0.2, shape)).astype(int)
    population = buildings * rng.uniform(4.2, 6.5, shape)
    roads = ((r % 16 == 0) | (c % 20 == 0)) & (rng.random(shape) < 0.85)

    facilities: dict[str, np.ndarray] = {}
    for name, count in (("school", 10), ("hospital", 4)):
        mask = np.zeros(shape, dtype=bool)
        rr = rng.integers(max(1, int(rows * 0.25)), rows, count)
        cc = rng.integers(max(1, int(cols * 0.15)), max(2, int(cols * 0.85)), count)
        mask[rr, cc] = True
        facilities[name] = mask

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
