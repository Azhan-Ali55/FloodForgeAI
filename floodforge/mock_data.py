"""Synthetic input generator for FloodForge AI.

Generates a 200x200 grid (~30 m resolution, 6 km x 6 km) representing an
urban subcatchment in the Nullah Lai basin (Islamabad-Rawalpindi).
"""

import numpy as np


def generate_mock_inputs(seed: int = 42) -> dict:
    """Generate synthetic flood model inputs matching the FloodForge contract.

    Parameters
    ----------
    seed : int
        Random seed for reproducibility.

    Returns
    -------
    dict
        Dictionary containing:
        - dem: 2D float array (elevation in m)
        - landcover_imperviousness: 2D float array in [0, 1]
        - population: 2D float array (people per cell)
        - buildings: 2D int array (building count per cell)
        - roads: 2D int array (1 = road in cell, 0 = no road)
        - road_segments: 2D int array (0 = no road, 1..K = road segment ID)
        - facilities: list of (row, col, type) tuples
        - zones: 2D int array (neighborhood/community IDs 1..N)
        - cell_size_m: float (grid resolution in meters, 30.0)
    """
    rng = np.random.default_rng(seed)
    shape = (200, 200)
    rows, cols = shape

    # Normalized coordinates [0, 1]
    x = np.linspace(0.0, 1.0, cols)
    y = np.linspace(0.0, 1.0, rows)
    xv, yv = np.meshgrid(x, y)

    # 1. DEM: gentle slope from NW (high) to SE (low) + diagonal Nullah Lai channel + depression
    dem = 30.0 * (1.0 - 0.6 * xv - 0.4 * yv)

    # Diagonal main channel running from NW-ish (0.2, 0.1) toward SE (0.85, 0.9)
    # Distance to line segment
    line_dist = np.abs(0.8 * xv - 0.65 * yv - 0.05) / np.hypot(0.8, 0.65)
    channel = 4.5 * np.exp(-(line_dist ** 2) / 0.004)
    dem -= channel

    # Low-lying urban depression near downstream mid-section
    cx, cy = 0.65, 0.72
    depression = 3.5 * np.exp(-(((xv - cx) ** 2 + (yv - cy) ** 2) / 0.008))
    dem -= depression

    # Subtle micro-topography noise
    dem += rng.normal(0.0, 0.08, size=shape)

    # 2. Landcover imperviousness [0, 1]
    # Base green/peri-urban background
    imperv = np.clip(rng.normal(loc=0.25, scale=0.10, size=shape), 0.0, 1.0)
    # Add dense paved urban blocks
    for _ in range(8):
        bh = int(rng.integers(18, 35))
        bw = int(rng.integers(18, 35))
        r0 = int(rng.integers(10, rows - bh - 10))
        c0 = int(rng.integers(10, cols - bw - 10))
        imperv[r0 : r0 + bh, c0 : c0 + bw] = np.clip(
            rng.uniform(0.72, 0.96, size=(bh, bw)), 0.0, 1.0
        )
    # Keep a couple of green park/buffer patches
    for _ in range(3):
        ph = int(rng.integers(15, 25))
        pw = int(rng.integers(15, 25))
        r0 = int(rng.integers(10, rows - ph - 10))
        c0 = int(rng.integers(10, cols - pw - 10))
        imperv[r0 : r0 + ph, c0 : c0 + pw] = np.clip(
            rng.uniform(0.05, 0.18, size=(ph, pw)), 0.0, 1.0
        )

    # 3. Population density (people per 30m x 30m cell)
    pop = np.zeros(shape, dtype=float)
    pop += 25.0 * np.exp(-(((xv - cx) ** 2 + (yv - cy) ** 2) / 0.02))
    pop += 40.0 * np.clip((imperv - 0.5) * 2.0, 0.0, 1.0)
    pop += rng.poisson(2, size=shape)

    # 4. Buildings count per cell (integer)
    buildings = np.where(
        imperv > 0.55,
        rng.integers(1, 6, size=shape),
        (rng.random(shape) < 0.08).astype(int),
    ).astype(int)

    # 5. Roads and road segment IDs
    roads = np.zeros(shape, dtype=int)
    road_segments = np.zeros(shape, dtype=int)
    seg_id = 1
    # Horizontal arterials every 35 cells, split into 40-cell segments
    for r in range(20, rows, 35):
        for c0 in range(0, cols, 40):
            c1 = min(c0 + 40, cols)
            roads[r, c0:c1] = 1
            road_segments[r, c0:c1] = seg_id
            seg_id += 1
    # Vertical arterials every 35 cells, split into 40-cell segments
    for c in range(20, cols, 35):
        for r0 in range(0, rows, 40):
            r1 = min(r0 + 40, rows)
            roads[r0:r1, c] = 1
            road_segments[r0:r1, c] = seg_id
            seg_id += 1

    # 6. Public facilities: (row, col, type)
    facility_types = ["school", "hospital", "clinic", "fire_station", "community_center"]
    facilities = []
    for _ in range(12):
        r = int(rng.integers(15, rows - 15))
        c = int(rng.integers(15, cols - 15))
        t = str(rng.choice(facility_types))
        facilities.append((r, c, t))

    # 7. Zones: 4 contiguous neighborhood zones (1..4) covering the grid
    # (Upper-West, Upper-East, Mid-Catchment, Lower-Valley)
    zones = np.ones(shape, dtype=int)
    zones[(yv < 0.5) & (xv >= 0.5)] = 2
    zones[(yv >= 0.5) & (xv < 0.5)] = 3
    zones[(yv >= 0.5) & (xv >= 0.5)] = 4

    return {
        "dem": dem.astype(np.float64),
        "landcover_imperviousness": imperv.astype(np.float64),
        "population": pop.astype(np.float64),
        "buildings": buildings,
        "roads": roads,
        "road_segments": road_segments,
        "facilities": facilities,
        "zones": zones,
        "cell_size_m": 30.0,
    }


if __name__ == "__main__":
    data = generate_mock_inputs()
    for k, v in data.items():
        if hasattr(v, "shape"):
            print(f"{k}: shape={v.shape}, dtype={v.dtype}, min={v.min():.2f}, max={v.max():.2f}")
        else:
            print(f"{k}: {type(v).__name__} ({len(v) if hasattr(v, '__len__') else v})")
