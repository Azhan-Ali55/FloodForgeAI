"""Weather payload schema and forecast/antecedent series loader for Mode A."""
from __future__ import annotations

from dataclasses import dataclass
import json
from urllib.error import URLError
from urllib.request import urlopen
import numpy as np


@dataclass
class WeatherPayload:
    precip_mm: np.ndarray
    soil_moisture_0_9cm: np.ndarray
    precip_prob_pct: np.ndarray
    source: str = "mock_monsoon"


def make_mock_weather(
    hours: int = 168,
    seed: int = 42,
    monsoon_spike_mm: float = 28.0,
) -> WeatherPayload:
    """Deterministic hourly precipitation, soil moisture, and rain-probability series."""
    rng = np.random.default_rng(seed)
    t = np.arange(hours, dtype=float)

    base_rain = np.maximum(0.0, 2.2 * np.sin(2.0 * np.pi * t / 24.0 - 0.8) + rng.normal(0.5, 1.1, hours))
    rain_events = rng.random(hours) < 0.14
    precip = np.where(rain_events, base_rain + rng.uniform(4.0, monsoon_spike_mm, hours), base_rain * 0.25)
    precip = np.round(np.maximum(0.0, precip), 2)

    sm = np.full(hours, 0.22, dtype=float)
    for i in range(1, hours):
        sm[i] = np.clip(0.96 * sm[i - 1] + 0.004 * precip[i - 1] + rng.normal(0.0, 0.003), 0.12, 0.48)

    prob = np.clip(15.0 + 3.2 * precip + rng.normal(0.0, 6.0, hours), 0.0, 100.0)

    return WeatherPayload(
        precip_mm=precip,
        soil_moisture_0_9cm=np.round(sm, 4),
        precip_prob_pct=np.round(prob, 1),
        source="mock_monsoon",
    )


def fetch_weather(
    lat: float = 33.6007,
    lon: float = 73.0679,
    timeout_sec: float = 4.0,
    seed: int = 42,
) -> WeatherPayload:
    """Fetch hourly weather from Open-Meteo for Nullah Lai (Rawalpindi/Islamabad), with mock fallback."""
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&hourly=precipitation,precipitation_probability,soil_moisture_0_to_9cm"
        f"&past_days=5&forecast_days=2&timezone=Asia%2FKarachi"
    )
    try:
        with urlopen(url, timeout=timeout_sec) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        hourly = data.get("hourly", {})
        precip = np.asarray(hourly.get("precipitation", []), dtype=float)
        sm = np.asarray(hourly.get("soil_moisture_0_to_9cm", []), dtype=float)
        prob = np.asarray(hourly.get("precipitation_probability", []), dtype=float)

        if precip.size == 0:
            return make_mock_weather(seed=seed)

        precip = np.nan_to_num(precip, nan=0.0)
        if sm.size == 0:
            sm = np.full_like(precip, 0.24)
        else:
            sm = np.nan_to_num(sm, nan=float(np.nanmean(sm)) if np.any(np.isfinite(sm)) else 0.24)
        if prob.size == 0:
            prob = np.clip(20.0 + 3.0 * precip, 0.0, 100.0)
        else:
            prob = np.nan_to_num(prob, nan=20.0)

        return WeatherPayload(
            precip_mm=precip,
            soil_moisture_0_9cm=sm,
            precip_prob_pct=prob,
            source="open-meteo",
        )
    except (URLError, TimeoutError, OSError, ValueError, KeyError, json.JSONDecodeError):
        return make_mock_weather(seed=seed)
