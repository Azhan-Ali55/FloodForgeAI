"""Antecedent wetness adjustment and 3-scenario forecast runner for Mode A.

Computes the 5-7 day decaying Antecedent Precipitation Index (API_t) and
combines it with 0-9 cm soil moisture to adjust effective runoff coefficients
ONLY on pervious fractions (leaving impervious runoff invariant).
"""

from dataclasses import dataclass
import numpy as np

from floodforge.simulation import SIM_CONFIG, SimResult, simulate
from floodforge.weather import WeatherPayload


@dataclass
class RainfallScenario:
    """A single rainfall scenario input for simulation.py."""

    name: str
    label: str
    rainfall_mm: float
    duration_hr: float
    is_hypothetical: bool
    c_perv_effective: float


@dataclass
class ForecastRunResult:
    """Outputs of Mode A forecast-to-simulation pipeline."""

    api_mm: float
    mean_soil_moisture_0_9cm: float
    c_perv_base: float
    c_perv_effective: float
    issued_at_utc: str
    is_stale: bool
    staleness_reason: str | None
    scenarios: dict[str, RainfallScenario]
    simulations: dict[str, SimResult]


def compute_api(past_hourly_precip_mm: np.ndarray, decay_k: float = 0.85) -> float:
    """Compute decaying Antecedent Precipitation Index from past hourly rain.

    Groups past hours into daily totals (oldest -> most recent) and applies:
        API_t = sum_{i=1..N} (k^i * P_{t-i})
    """
    k = float(np.clip(decay_k, 0.80, 0.90))
    n_hours = len(past_hourly_precip_mm)
    if n_hours == 0:
        return 0.0

    n_days = max(1, n_hours // 24)
    trimmed = past_hourly_precip_mm[-(n_days * 24) :] if n_hours >= 24 else past_hourly_precip_mm
    if len(trimmed) >= 24:
        daily = trimmed.reshape(n_days, 24).sum(axis=1)
    else:
        daily = np.array([float(np.sum(trimmed))])

    # daily[-1] is most recent past day (i = 1)
    api = 0.0
    for idx, p_day in enumerate(reversed(daily), start=1):
        api += (k ** idx) * float(p_day)
    return float(api)


def compute_effective_pervious_coeff(
    c_perv_base: float,
    theta_0_9cm: float,
    api_mm: float,
    c_perv_max: float = 0.70,
) -> float:
    """Physically bounded saturation adjustment for pervious cell fractions only.

    Impervious runoff coefficient stays invariant; pervious runoff rises
    smoothly with antecedent precipitation and near-surface soil moisture,
    capped at `c_perv_max`.
    """
    sm_norm = float(np.clip(theta_0_9cm / 0.45, 0.0, 1.0))
    api_norm = float(1.0 - np.exp(-max(0.0, api_mm) / 45.0))
    wetness_index = 0.45 * sm_norm + 0.55 * api_norm
    c_eff = c_perv_base + (c_perv_max - c_perv_base) * wetness_index
    return float(np.clip(c_eff, c_perv_base, c_perv_max))


def _peak_storm_window(hourly_rain: np.ndarray, window_hr: int = 6) -> tuple[float, float]:
    """Find the maximum rolling `window_hr` rainfall total in the forecast."""
    if len(hourly_rain) == 0:
        return 0.0, float(window_hr)
    w = min(window_hr, len(hourly_rain))
    cs = np.cumsum(np.insert(hourly_rain, 0, 0.0))
    rolling = cs[w:] - cs[:-w]
    return float(np.max(rolling)), float(w)


def build_scenarios(
    weather: WeatherPayload,
    c_perv_base: float = SIM_CONFIG["runoff_base"],
    decay_k: float = 0.85,
    storm_window_hr: int = 6,
    cloudburst_mm: float = 150.0,
    cloudburst_hr: float = 3.0,
) -> tuple[float, float, float, dict[str, RainfallScenario]]:
    """Construct Baseline, High-Rainfall, and Hypothetical Cloudburst scenarios."""
    past_rain = weather.precipitation_mm[: weather.past_hours_count]
    fcst_rain = weather.precipitation_mm[weather.past_hours_count :]
    fcst_prob = weather.precipitation_prob_pct[weather.past_hours_count :]
    fcst_sm = weather.soil_moisture_0_9cm[weather.past_hours_count :]

    api_mm = compute_api(past_rain, decay_k=decay_k)
    mean_sm = float(np.mean(fcst_sm)) if len(fcst_sm) > 0 else float(np.mean(weather.soil_moisture_0_9cm))
    c_perv_eff = compute_effective_pervious_coeff(c_perv_base, mean_sm, api_mm)

    peak_rain, dur_hr = _peak_storm_window(fcst_rain, window_hr=storm_window_hr)
    mean_prob = float(np.mean(fcst_prob)) if len(fcst_prob) > 0 else 50.0

    # High-rainfall uncertainty envelope: +35% to +65% depending on forecast uncertainty
    uplift = 1.35 + 0.30 * (1.0 - np.clip(mean_prob / 100.0, 0.0, 1.0))
    high_rain = max(peak_rain * uplift, peak_rain + 15.0) if peak_rain > 0 else 25.0

    scenarios = {
        "baseline_forecast": RainfallScenario(
            name="baseline_forecast",
            label="Baseline NWP Forecast (Peak 6h Window)",
            rainfall_mm=round(peak_rain, 2),
            duration_hr=dur_hr,
            is_hypothetical=False,
            c_perv_effective=c_perv_eff,
        ),
        "high_rainfall": RainfallScenario(
            name="high_rainfall",
            label="High-Rainfall Uncertainty Envelope",
            rainfall_mm=round(high_rain, 2),
            duration_hr=dur_hr,
            is_hypothetical=False,
            c_perv_effective=c_perv_eff,
        ),
        "hypothetical_cloudburst": RainfallScenario(
            name="hypothetical_cloudburst",
            label="HYPOTHETICAL_STRESS_TEST (Preparedness Drill Only)",
            rainfall_mm=float(cloudburst_mm),
            duration_hr=float(cloudburst_hr),
            is_hypothetical=True,
            c_perv_effective=c_perv_eff,
        ),
    }
    return api_mm, mean_sm, c_perv_eff, scenarios


def run_forecast_pipeline(
    inputs: dict,
    weather: WeatherPayload,
    decay_k: float = 0.85,
    storm_window_hr: int = 6,
    cloudburst_mm: float = 150.0,
    cloudburst_hr: float = 3.0,
) -> ForecastRunResult:
    """Run all 3 rainfall scenarios through `simulation.simulate()`."""
    c_perv_base = float(SIM_CONFIG["runoff_base"])
    api_mm, mean_sm, c_perv_eff, scenarios = build_scenarios(
        weather=weather,
        c_perv_base=c_perv_base,
        decay_k=decay_k,
        storm_window_hr=storm_window_hr,
        cloudburst_mm=cloudburst_mm,
        cloudburst_hr=cloudburst_hr,
    )

    simulations = {}
    for key, sc in scenarios.items():
        simulations[key] = simulate(
            inputs=inputs,
            rainfall_mm=sc.rainfall_mm,
            duration_hr=sc.duration_hr,
            interventions=None,
            config={"runoff_base": sc.c_perv_effective},
        )

    return ForecastRunResult(
        api_mm=round(api_mm, 2),
        mean_soil_moisture_0_9cm=round(mean_sm, 4),
        c_perv_base=c_perv_base,
        c_perv_effective=round(c_perv_eff, 4),
        issued_at_utc=weather.issued_at_utc,
        is_stale=weather.is_stale,
        staleness_reason=weather.staleness_reason,
        scenarios=scenarios,
        simulations=simulations,
    )
