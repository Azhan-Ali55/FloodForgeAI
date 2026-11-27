"""Shared data contracts for FloodForge AI.

Every module (twin, simulation, surrogate, optimizer, risk, dashboard) imports
these types so backend modules code against the same shapes and units.
All rasters are 2D numpy arrays on ONE common grid (same shape, same cell size).
Outputs are SCREENING-LEVEL, not hydraulic flood depths or engineering design values.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import math
from typing import Protocol

import numpy as np


class InterventionType(str, Enum):
    STORAGE = "storage"                      # size = capacity in m3
    PERMEABLE_SURFACE = "permeable_surface"  # size = area in m2
    DRAINAGE = "drainage"                    # size = extra conveyance in m3/hr


VALID_WETNESS_LEVELS = ("dry", "normal", "wet", "saturated")


@dataclass(frozen=True)
class Scenario:
    rainfall_mm_per_hr: float
    duration_hr: float
    budget_pkr: float
    antecedent_wetness: str | None = None
    uncertainty_factor: float = 1.0

    def __post_init__(self):
        for name, val in (
            ("rainfall_mm_per_hr", self.rainfall_mm_per_hr),
            ("duration_hr", self.duration_hr),
            ("budget_pkr", self.budget_pkr),
            ("uncertainty_factor", self.uncertainty_factor),
        ):
            if not math.isfinite(val):
                raise ValueError(f"{name} must be finite, got {val}")
        if self.rainfall_mm_per_hr < 0 or self.duration_hr <= 0 or self.budget_pkr < 0:
            raise ValueError("rainfall must be >= 0, duration > 0, and budget >= 0")
        if self.uncertainty_factor <= 0:
            raise ValueError("uncertainty_factor must be > 0")
        if self.antecedent_wetness is not None and self.antecedent_wetness not in VALID_WETNESS_LEVELS:
            raise ValueError(f"antecedent_wetness must be one of {VALID_WETNESS_LEVELS}")

    @property
    def total_rainfall_mm(self) -> float:
        return self.rainfall_mm_per_hr * self.duration_hr


@dataclass(frozen=True)
class Intervention:
    id: str
    type: InterventionType
    row: int          # grid cell where it is placed
    col: int
    size: float       # units depend on type (see InterventionType)
    cost_pkr: float

    def __post_init__(self):
        if self.row < 0 or self.col < 0:
            raise ValueError("intervention row and col must be >= 0")
        if not math.isfinite(self.size) or self.size <= 0:
            raise ValueError("intervention size must be finite and > 0")
        if not math.isfinite(self.cost_pkr) or self.cost_pkr < 0:
            raise ValueError("intervention cost_pkr must be finite and >= 0")


@dataclass
class Portfolio:
    interventions: list[Intervention] = field(default_factory=list)

    @property
    def total_cost_pkr(self) -> float:
        return sum(i.cost_pkr for i in self.interventions)

    def within_budget(self, budget_pkr: float) -> bool:
        return self.total_cost_pkr <= budget_pkr


@dataclass
class TwinGrid:
    """The city digital twin: aligned rasters for the pilot area."""
    dem: np.ndarray                      # elevation, metres (float)
    land_cover: np.ndarray               # ESA WorldCover class codes (int)
    population: np.ndarray               # people per cell (float)
    buildings: np.ndarray                # building count or 0/1 mask per cell (int)
    roads: np.ndarray                    # bool, True where a road cell is
    facilities: dict[str, np.ndarray]    # e.g. {"school": bool, "hospital": bool}
    cell_size_m: float
    crs: str
    transform: tuple | None = None       # affine transform from rasterio, if known
    f_imp: np.ndarray | None = None      # optional normalized impervious fraction (0.0-1.0)
    zones: np.ndarray | None = None      # optional admin zone IDs (e.g. 1=Upstream, 2=Downstream)

    def __post_init__(self):
        if self.dem.ndim != 2 or self.dem.size == 0:
            raise ValueError(f"dem must be non-empty 2D array, got shape {self.dem.shape}")
        if not np.all(np.isfinite(self.dem)):
            raise ValueError("dem contains non-finite (NaN/Inf) elevations")
        if not math.isfinite(self.cell_size_m) or self.cell_size_m <= 0:
            raise ValueError(f"cell_size_m must be finite and > 0, got {self.cell_size_m}")

        shape = self.dem.shape
        rasters = {
            "land_cover": self.land_cover,
            "population": self.population,
            "buildings": self.buildings,
            "roads": self.roads,
            **{f"facilities[{k}]": v for k, v in self.facilities.items()},
        }
        if self.f_imp is not None:
            rasters["f_imp"] = self.f_imp
        if self.zones is not None:
            rasters["zones"] = self.zones

        for name, arr in rasters.items():
            if arr.shape != shape:
                raise ValueError(f"{name} shape {arr.shape} != dem shape {shape}")

    @property
    def shape(self) -> tuple[int, int]:
        return self.dem.shape

    @property
    def cell_area_m2(self) -> float:
        return self.cell_size_m ** 2


@dataclass
class ExposureMetrics:
    exposed_area_km2: float
    buildings_exposed: int
    population_exposed: float
    road_cells_exposed: int
    facilities_exposed: dict[str, int]


@dataclass
class RiskTransferReport:
    """Did a portfolio make things worse somewhere else?"""
    worse_mask: np.ndarray               # bool, cells with increased modeled exposure
    buildings_worse: int
    population_worse: float
    flagged: bool


@dataclass
class SimResult:
    accumulation_mm: np.ndarray          # screening proxy for water accumulation
    exposed_mask: np.ndarray             # bool
    metrics: ExposureMetrics
    risk_transfer: RiskTransferReport | None = None
    uncertainty: dict[str, tuple[float, float]] = field(default_factory=dict)  # metric -> (low, high)
    assumptions: list[str] = field(default_factory=list)
    screening_level: bool = True         # always True for this project
    zone_breakdown: dict[str, dict[str, float]] = field(default_factory=dict)


class Simulator(Protocol):
    """THE contract: simulation, surrogate and dashboard all hinge on this."""
    def run_scenario(self, twin: TwinGrid, scenario: Scenario,
                     portfolio: Portfolio) -> SimResult: ...
