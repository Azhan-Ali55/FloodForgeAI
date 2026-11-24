"""Loads configs/pilot.yaml so no module hard-codes pilot settings."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import yaml

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "configs" / "pilot.yaml"


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


def load_config(path: str | Path = DEFAULT_PATH) -> Config:
    with open(path, "r", encoding="utf-8") as f:
        return Config(raw=yaml.safe_load(f))