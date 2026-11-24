"""Input/output helpers for FloodForge AI.

Loads real catchment inputs when available, otherwise falls back to
synthetic mock data so the model and optimizer always work out of the box.
"""

from pathlib import Path
import json
import numpy as np

from floodforge.mock_data import generate_mock_inputs


def load_inputs(path: str | Path | None = None, seed: int = 42) -> dict:
    """Load catchment inputs from disk or fall back to mock data.

    Parameters
    ----------
    path : str | Path | None
        Optional path to a `.npz` bundle or a directory containing `.npy`
        arrays (`dem.npy`, `landcover_imperviousness.npy`, `population.npy`,
        `buildings.npy`, `roads.npy`, `zones.npy`, and optional
        `road_segments.npy` and `facilities.json`).
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
        if "facilities" in data and isinstance(data["facilities"], np.ndarray):
            data["facilities"] = [tuple(x) for x in data["facilities"].tolist()]
        if "cell_size_m" in data and isinstance(data["cell_size_m"], np.ndarray):
            data["cell_size_m"] = float(data["cell_size_m"].item())
        return data

    if p.is_dir():
        required_arrays = [
            "dem",
            "landcover_imperviousness",
            "population",
            "buildings",
            "roads",
            "zones",
        ]
        if all((p / f"{name}.npy").exists() for name in required_arrays):
            data = {name: np.load(p / f"{name}.npy") for name in required_arrays}
            if (p / "road_segments.npy").exists():
                data["road_segments"] = np.load(p / "road_segments.npy")
            if (p / "facilities.json").exists():
                with open(p / "facilities.json", "r", encoding="utf-8") as f:
                    data["facilities"] = [tuple(item) for item in json.load(f)]
            else:
                data["facilities"] = []
            data["cell_size_m"] = 30.0
            return data

    return generate_mock_inputs(seed=seed)
