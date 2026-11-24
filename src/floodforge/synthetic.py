"""Fake-but-valid TwinGrid so teammates are never blocked waiting for real data."""
from __future__ import annotations
import numpy as np
from .schemas import TwinGrid


def make_synthetic_twin(shape=(80, 80), cell_size_m=30.0, crs="EPSG:32643", seed=0) -> TwinGrid:
    rng = np.random.default_rng(seed)
    rows, cols = shape
    r, c = np.mgrid[0:rows, 0:cols]
    # tilted terrain draining toward the bottom, with a low channel down the middle
    dem = 520 - 0.15 * r + 2.0 * np.abs(c - cols / 2) / cols * 10 + rng.normal(0, 0.3, shape)
    land_cover = rng.choice([10, 30, 40, 60], size=shape, p=[0.1, 0.3, 0.3, 0.3])
    urban = ((r - rows / 2) ** 2 + (c - cols / 2) ** 2) < (min(shape) * 0.35) ** 2
    land_cover[urban] = 50
    buildings = np.where(urban, rng.poisson(6, shape), 0).astype(int)
    population = buildings * rng.uniform(4, 6, shape)
    roads = (r % 10 == 0) | (c % 12 == 0)
    facilities = {}
    for name, n in (("school", 6), ("hospital", 2)):
        mask = np.zeros(shape, dtype=bool)
        mask[rng.integers(0, rows, n), rng.integers(0, cols, n)] = True
        facilities[name] = mask
    return TwinGrid(dem=dem, land_cover=land_cover, population=population,
                    buildings=buildings, roads=roads, facilities=facilities,
                    cell_size_m=cell_size_m, crs=crs)