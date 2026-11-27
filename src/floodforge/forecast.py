"""Mode A antecedent wetness & forecast scenario helpers."""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np
from .config import Config, load_config
from .schemas import Scenario, TwinGrid
from .weather import WeatherPayload


@dataclass
class WetnessState:
    api_mm: float
    mean_soil_moisture: float
    wetness_factor: float


@dataclass
class ForecastScenarios:
    wetness: WetnessState
    baseline: Scenario
    high_rain: Scenario
    cloudburst_demo: Scenario


def compute_wetness_state(weather: WeatherPayload, decay: float = 0.90) -> WetnessState:
    precip = np.asarray(weather.precip_mm, dtype=float)
    past_len = min(len(precip), 120)
    api = 0.0
    for p in precip[:past_len]:
        api = decay * api + max(0.0, float(p))
    mean_sm = float(np.mean(weather.soil_moisture_0_9cm)) if len(weather.soil_moisture_0_9cm) else 0.22
    factor = float(np.clip(1.0 + 0.003 * api + 0.35 * (mean_sm - 0.20), 0.90, 1.45))
    return WetnessState(api_mm=float(api), mean_soil_moisture=mean_sm, wetness_factor=factor)


def build_mode_a_scenarios(
    weather: WeatherPayload,
    cfg: Config | None = None,
    budget_pkr: float = 50_000_000.0,
    cloudburst_rate_mm_hr: float = 85.0,
    cloudburst_duration_hr: float = 2.0,
) -> ForecastScenarios:
    cfg = cfg or load_config()
    wetness = compute_wetness_state(weather)
    precip = np.asarray(weather.precip_mm, dtype=float)
    tail = precip[-72:] if len(precip) >= 72 else precip
    base_rate = float(np.clip(np.mean(tail) if len(tail) else 5.0, 2.0, 40.0))
    peak_rate = float(np.clip(np.max(tail) if len(tail) else 25.0, max(base_rate + 5.0, 15.0), 140.0))

    return ForecastScenarios(
        wetness=wetness,
        baseline=Scenario(rainfall_mm_per_hr=base_rate, duration_hr=2.0, budget_pkr=budget_pkr),
        high_rain=Scenario(rainfall_mm_per_hr=peak_rate, duration_hr=2.0, budget_pkr=budget_pkr),
        cloudburst_demo=Scenario(
            rainfall_mm_per_hr=float(cloudburst_rate_mm_hr),
            duration_hr=float(cloudburst_duration_hr),
            budget_pkr=budget_pkr,
        ),
    )


def effective_runoff_grid(twin: TwinGrid, wetness: WetnessState, cfg: Config | None = None) -> np.ndarray:
    cfg = cfg or load_config()
    c_grid = np.full(twin.shape, 0.5, dtype=float)
    for code, val in cfg.runoff_coefficients.items():
        c_grid[twin.land_cover == int(code)] = float(val)
    return np.clip(c_grid * wetness.wetness_factor, 0.05, 1.0)
