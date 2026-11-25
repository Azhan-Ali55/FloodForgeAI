"""Open-Meteo meteorological forecast ingestion and SQLite archival for Mode A.

Queries hourly precipitation, precipitation probability, and 0-9 cm soil
moisture at the Nullah Lai reference point (33.65 N, 73.06 E), validates
physical ranges, interpolates short gaps (<= 2 hours), and caches payloads
in SQLite for offline fallback.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import numpy as np


DEFAULT_LAT = 33.65
DEFAULT_LON = 73.06
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
KARACHI_TZ = timezone(timedelta(hours=5), name="Asia/Karachi")


@dataclass
class WeatherPayload:
    """Validated, normalized hourly weather & soil-moisture time series."""

    timestamps_utc: list[str]
    timestamps_pkt: list[str]
    precipitation_mm: np.ndarray
    precipitation_prob_pct: np.ndarray
    soil_moisture_0_9cm: np.ndarray
    past_hours_count: int
    issued_at_utc: str
    is_stale: bool
    staleness_reason: str | None
    interpolated_gaps: int


def _init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS weather_archive (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                issued_at_utc TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                raw_json TEXT NOT NULL
            )
            """
        )
        conn.commit()


def _save_to_cache(db_path: Path, issued_at_utc: str, lat: float, lon: float, raw_json: str) -> None:
    _init_db(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO weather_archive (issued_at_utc, lat, lon, raw_json) VALUES (?, ?, ?, ?)",
            (issued_at_utc, lat, lon, raw_json),
        )
        conn.commit()


def _load_latest_cache(db_path: Path) -> tuple[str, dict] | None:
    if not db_path.exists():
        return None
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT issued_at_utc, raw_json FROM weather_archive ORDER BY id DESC LIMIT 1"
        ).fetchone()
    if row is None:
        return None
    return row[0], json.loads(row[1])


def _interpolate_short_gaps(arr: np.ndarray, low: float, high: float, max_gap: int = 2) -> tuple[np.ndarray, int]:
    """Clip/validate physical range and linearly interpolate NaN gaps <= max_gap."""
    out = arr.astype(np.float64).copy()
    invalid = np.isnan(out) | (out < low) | (out > high)
    out[invalid] = np.nan

    n = len(out)
    interp_count = 0
    i = 0
    while i < n:
        if np.isnan(out[i]):
            j = i
            while j < n and np.isnan(out[j]):
                j += 1
            gap_len = j - i
            if gap_len <= max_gap and i > 0 and j < n:
                out[i:j] = np.linspace(out[i - 1], out[j], gap_len + 2)[1:-1]
                interp_count += gap_len
            else:
                # Fill longer edge/interior gaps conservatively with 0.0
                out[i:j] = 0.0
            i = j
        else:
            i += 1

    return np.clip(out, low, high), interp_count


def _parse_open_meteo(
    raw: dict,
    issued_at_utc: str,
    past_days: int,
    is_stale: bool = False,
    staleness_reason: str | None = None,
) -> WeatherPayload:
    hourly = raw.get("hourly", {})
    times = hourly.get("time", [])
    if not times:
        raise ValueError("Open-Meteo payload missing hourly.time")

    # Enforce monotonic timestamps and convert UTC -> Asia/Karachi (UTC+5)
    parsed_utc = []
    timestamps_pkt = []
    for t_str in times:
        dt = datetime.fromisoformat(t_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if parsed_utc and dt <= parsed_utc[-1]:
            raise ValueError("Non-monotonic timestamps in Open-Meteo payload")
        parsed_utc.append(dt)
        timestamps_pkt.append(dt.astimezone(KARACHI_TZ).strftime("%Y-%m-%d %H:%M PKT"))

    def _to_arr(key: str) -> np.ndarray:
        vals = hourly.get(key, [np.nan] * len(times))
        return np.array([np.nan if v is None else float(v) for v in vals], dtype=np.float64)

    precip, g1 = _interpolate_short_gaps(_to_arr("precipitation"), 0.0, 500.0)
    prob, g2 = _interpolate_short_gaps(_to_arr("precipitation_probability"), 0.0, 100.0)
    sm1, g3 = _interpolate_short_gaps(_to_arr("soil_moisture_0_to_1cm"), 0.0, 1.0)
    sm2, g4 = _interpolate_short_gaps(_to_arr("soil_moisture_1_to_3cm"), 0.0, 1.0)
    sm3, g5 = _interpolate_short_gaps(_to_arr("soil_moisture_3_to_9cm"), 0.0, 1.0)

    sm_0_9 = (sm1 + sm2 + sm3) / 3.0
    past_hours = min(len(times), past_days * 24)

    return WeatherPayload(
        timestamps_utc=[dt.strftime("%Y-%m-%dT%H:%MZ") for dt in parsed_utc],
        timestamps_pkt=timestamps_pkt,
        precipitation_mm=precip,
        precipitation_prob_pct=prob,
        soil_moisture_0_9cm=sm_0_9,
        past_hours_count=past_hours,
        issued_at_utc=issued_at_utc,
        is_stale=is_stale,
        staleness_reason=staleness_reason,
        interpolated_gaps=g1 + g2 + g3 + g4 + g5,
    )


def fetch_weather(
    lat: float = DEFAULT_LAT,
    lon: float = DEFAULT_LON,
    past_days: int = 5,
    forecast_days: int = 3,
    cache_db: str | Path = "data/weather_cache.db",
    timeout_sec: float = 10.0,
    retries: int = 2,
) -> WeatherPayload:
    """Fetch 0-72h forecast + past days from Open-Meteo with SQLite fallback."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(
            [
                "precipitation",
                "precipitation_probability",
                "soil_moisture_0_to_1cm",
                "soil_moisture_1_to_3cm",
                "soil_moisture_3_to_9cm",
            ]
        ),
        "past_days": past_days,
        "forecast_days": forecast_days,
        "cell_selection": "land",
        "timezone": "UTC",
    }
    url = f"{OPEN_METEO_URL}?{urllib.parse.urlencode(params)}"
    db_path = Path(cache_db)

    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FloodForgeAI/2.0"})
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                raw_text = resp.read().decode("utf-8")
            raw_json = json.loads(raw_text)
            issued_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
            _save_to_cache(db_path, issued_utc, lat, lon, raw_text)
            return _parse_open_meteo(raw_json, issued_utc, past_days=past_days, is_stale=False)
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            last_err = exc
            if attempt < retries:
                time.sleep(0.5 * (2 ** attempt))

    cached = _load_latest_cache(db_path)
    if cached is not None:
        issued_utc, raw_json = cached
        return _parse_open_meteo(
            raw_json,
            issued_at_utc=issued_utc,
            past_days=past_days,
            is_stale=True,
            staleness_reason=f"Live Open-Meteo fetch failed ({last_err}); using cached payload from {issued_utc}.",
        )

    raise RuntimeError(f"Open-Meteo unavailable and no cached payload at {db_path}: {last_err}")
