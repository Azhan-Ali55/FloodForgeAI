"""Loads configs/pilot.yaml (or FLOODFORGE_CONFIG_PATH) so no module hard-codes pilot settings."""
from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PATH = REPO_ROOT / "configs" / "pilot.yaml"


@dataclass(frozen=True)
class Config:
    raw: dict

    @property
    def bbox_wgs84(self) -> dict:
        return self.raw["pilot"]["bbox_wgs84"]

    @property
    def crs(self) -> str:
        return self.raw["grid"]["crs"]

    @property
    def cell_size_m(self) -> float:
        return float(self.raw["grid"]["cell_size_m"])

    @property
    def runoff_coefficients(self) -> dict[int, float]:
        return {int(k): float(v) for k, v in self.raw["runoff_coefficients"].items()}

    @property
    def exposure_threshold_mm(self) -> float:
        return float(self.raw["exposure"]["threshold_mm"])

    @property
    def clipped_data_dir(self) -> Path:
        env_dir = os.getenv("FLOODFORGE_DATA_DIR")
        if env_dir:
            return Path(env_dir).expanduser().resolve()
        rel = self.raw.get("paths", {}).get("clipped", "data/processed/clipped")
        p = Path(rel)
        return p if p.is_absolute() else (REPO_ROOT / p).resolve()


def load_config(path: str | Path | None = None) -> Config:
    resolved = Path(
        path if path is not None else os.getenv("FLOODFORGE_CONFIG_PATH", DEFAULT_PATH)
    ).expanduser()
    if not resolved.exists():
        raise FileNotFoundError(f"Pilot configuration file not found: {resolved}")
    with open(resolved, "r", encoding="utf-8") as f:
        parsed = yaml.safe_load(f)
    if not isinstance(parsed, dict) or "pilot" not in parsed or "grid" not in parsed:
        raise ValueError(f"Malformed pilot configuration YAML in {resolved}")
    return Config(raw=parsed)
