# FloodForge AI

Screening-level urban flood mitigation planning prototype for a small subcatchment in the Nullah Lai basin (Islamabad–Rawalpindi).

> **Important Disclaimer:** This is a **screening-level prototype** using coarse (~30 m) elevation data and simplified runoff routing. It is **NOT** a real flood prediction tool or a construction-ready drainage design. All unit costs (PKR) and hydraulic parameters are illustrative placeholders until validated against local observations and full hydraulic modelling (e.g., EPA SWMM with surveyed cross-sections).

---

## Project Structure

```
floodforge/
  mock_data.py      # Synthetic 200x200 catchment generator
  io.py             # Loads real .npz / .npy inputs if present, else mock_data
  simulation.py     # Fast vectorized D8 runoff & ponding simulator (Part A)
  metrics.py        # 5 exposure metrics + per-zone risk-transfer check
  interventions.py  # 3 intervention types, placeholder PKR costs, candidate generator
  optimizer.py      # Budget-constrained random-search + greedy refinement (Part B)
  surrogate.py      # Stretch: pure-NumPy Random Forest surrogate for pre-screening
tests/
  test_floodforge.py
demo_cli.py         # End-to-end CLI demo: simulate -> optimize -> compare
demo_plot.py        # Saves baseline_flood_map.png
```

---

## Quick Start

Run the full CLI demo:
```bash
python demo_cli.py
```

Generate the baseline DEM & flood map PNG (`baseline_flood_map.png`):
```bash
python demo_plot.py
```

Run the test suite:
```bash
python -m pytest -v
```

---

## How to Import & Call Each Module

### 1. Load Inputs (`floodforge.io`)
```python
from floodforge.io import load_inputs

inputs = load_inputs(path=None, seed=42)  # Falls back to synthetic 200x200 mock data
```
Expected keys in `inputs`:
- `dem`: 2D float array (elevation, m)
- `landcover_imperviousness`: 2D float array in `[0, 1]`
- `population`: 2D float array (people per cell)
- `buildings`: 2D int array (building count per cell)
- `roads`: 2D int/bool array (`1` = road in cell)
- `road_segments` (optional): 2D int array (`0` = no road, `1..K` = segment ID)
- `facilities`: list of `(row, col, type)` tuples
- `zones`: 2D int array labeling neighborhoods/communities (`1..N`)

### 2. Run Flood Simulation (`floodforge.simulation`)
```python
from floodforge.simulation import simulate

res = simulate(inputs, rainfall_mm=100.0, duration_hr=3.0, interventions=None)
# res.depth        -> 2D float array (m)
# res.flooded_mask -> 2D bool array (depth > 0.15 m)
# res.flow_accum   -> 2D float array (accumulated runoff, mm-equivalent)
# res.metrics      -> dict of the 5 exposure metrics
```

### 3. Compute Metrics & Risk Transfer (`floodforge.metrics`)
```python
from floodforge.metrics import compute_metrics, risk_transfer_check

metrics = compute_metrics(inputs, res.flooded_mask)
rt_table = risk_transfer_check(baseline_res, optimized_res, inputs["zones"], tolerance=0.05)
```

### 4. Generate Interventions & Optimize (`floodforge.interventions`, `floodforge.optimizer`)
```python
from floodforge.optimizer import optimize

opt = optimize(
    inputs=inputs,
    rainfall_mm=100.0,
    duration_hr=3.0,
    budget_pkr=8_000_000.0,
    n_iter=2000,
    seed=0,
)
# opt.best_portfolio, opt.best_score, opt.baseline_metrics, opt.optimized_metrics
# opt.risk_transfer_table, opt.history, opt.avg_random_score, opt.worst_random_score
```

### 5. Stretch Surrogate (`floodforge.surrogate`)
```python
from floodforge.interventions import generate_candidates
from floodforge.surrogate import train_surrogate

candidates = generate_candidates(inputs)
surr = train_surrogate(inputs, candidates, budget_pkr=8_000_000.0, n_samples=1000)
print("Surrogate R^2 (fidelity to simulate(), NOT real world):", surr.r2_scores)
opt = optimize(inputs, 100.0, 3.0, budget_pkr=8_000_000.0, n_iter=2000, surrogate=surr)
```

---

## Key Assumptions & Constants

### Simulation (`floodforge/simulation.py` -> `SIM_CONFIG`)
- **Grid resolution (`cell_size_m`)**: `30.0` m (900 m² per cell).
- **Runoff coefficient**: `0.20` (soil/grass, imperviousness = 0) to `0.95` (fully paved, imperviousness = 1).
- **Flow routing**: Single-direction D8 steepest descent on the DEM, precomputed into topological wavefronts and cached per DEM (~6–7 ms per cached `simulate()` call on a 200×200 grid).
- **Flood depth estimation**: Empirical sub-linear scaling `depth_scale * (flow_accum / 1000)^0.50 * lowness_factor * intensity_factor`, where `depth_scale = 0.075`, `lowness_window = 21` cells, `lowness_scale = 3.0` m, `ref_duration_hr = 3.0` hr, `duration_exponent = 0.15`.
- **Flooded threshold (`flood_depth_threshold_m`)**: `0.15` m.

### Interventions (`floodforge/interventions.py` -> `INTERVENTION_CONFIG`, PLACEHOLDERS)
- `retention_pond`: `1,500,000` PKR, `45,000` m³ storage across a 5×5 cell patch, placed in low-elevation, high-accumulation cells.
- `permeable_surface`: `600,000` PKR, `-50%` imperviousness across a 9×9 cell patch, placed in high-imperviousness blocks.
- `drainage_upgrade`: `1,000,000` PKR, `-40%` local accumulated surface flow across a 5×5 corridor patch, placed in high-accumulation cells.

### Optimizer (`floodforge/optimizer.py`)
- **Objective weights (`DEFAULT_WEIGHTS`)**: `buildings_exposed: 0.30`, `population_exposed: 0.30`, `road_segments_exposed: 0.15`, `facilities_exposed: 0.15`, `exposed_area_km2: 0.10`.
- **Risk-transfer penalty**: `0.25` subtracted per zone flagged as having a `> 5%` (`tolerance=0.05`) increase in flooded area.
