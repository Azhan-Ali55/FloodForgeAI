"""FastAPI server exposing the real 200x200 Nullah Lai TwinGrid and D8 Simulator."""
from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import json
import logging
import math
import os
import threading
import time
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from .loader import load_clipped_twin
from .schemas import Intervention, InterventionType, Portfolio, Scenario
from .simulator import D8Simulator

logger = logging.getLogger("floodforge.api")
if not logger.handlers:
    logging.basicConfig(
        level=os.getenv("FLOODFORGE_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

# Pakistan Standard Time (Asia/Karachi) is fixed UTC+05:00 with no DST
PKT_TZ = timezone(timedelta(hours=5))
DEFAULT_CORS_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:4174",
    "http://localhost:4174",
]


def _parse_cors_origins() -> list[str]:
    raw = os.getenv("FLOODFORGE_CORS_ORIGINS", "").strip()
    if not raw:
        return DEFAULT_CORS_ORIGINS
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or DEFAULT_CORS_ORIGINS


app = FastAPI(title="FloodForge AI Backend", version="0.3.0")

cors_regex = os.getenv("FLOODFORGE_CORS_ORIGIN_REGEX", "").strip() or None
app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_origin_regex=cors_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-Request-ID"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    t0 = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.exception("req_id=%s path=%s unhandled_error=%s", req_id, request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "error_category": "internal_computation_failure",
                "request_id": req_id,
            },
        )
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    response.headers["X-Request-ID"] = req_id
    logger.info(
        "req_id=%s method=%s path=%s status=%s duration_ms=%.1f",
        req_id,
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


def _check_finite(v: float, field_name: str) -> float:
    if not math.isfinite(v):
        raise ValueError(f"{field_name} must be a finite number")
    return v


class ScenarioIn(BaseModel):
    rainfall_mm_per_hr: float = Field(ge=0.0, le=500.0)
    duration_hr: float = Field(gt=0.0, le=168.0)
    budget_pkr: float = Field(ge=0.0, le=10_000_000_000.0)
    antecedent_wetness: Literal["dry", "normal", "wet", "saturated"] | None = None
    uncertainty_factor: float = Field(default=1.0, gt=0.0, le=3.0)

    @field_validator("rainfall_mm_per_hr", "duration_hr", "budget_pkr", "uncertainty_factor")
    @classmethod
    def validate_finite(cls, v: float, info) -> float:
        return _check_finite(v, info.field_name)


class InterventionIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    type: Literal["storage", "permeable_surface", "drainage"]
    row: int = Field(ge=0, le=2000)
    col: int = Field(ge=0, le=2000)
    size: float = Field(gt=0.0, le=10_000_000.0)
    cost_pkr: float = Field(ge=0.0, le=10_000_000_000.0)

    @field_validator("size", "cost_pkr")
    @classmethod
    def validate_finite_num(cls, v: float, info) -> float:
        return _check_finite(v, info.field_name)


class PortfolioIn(BaseModel):
    interventions: list[InterventionIn] = Field(default_factory=list, max_length=100)


class SimulateRequest(BaseModel):
    seed: int | None = Field(default=None, description="Deprecated: D8 simulation is deterministic.")
    scenario: ScenarioIn
    portfolio: PortfolioIn = PortfolioIn()
    threshold_mm: float | None = Field(default=None, gt=0.0, le=2000.0)

    @field_validator("threshold_mm")
    @classmethod
    def validate_threshold(cls, v: float | None) -> float | None:
        return _check_finite(v, "threshold_mm") if v is not None else None


class OptimizeRequest(BaseModel):
    seed: int | None = Field(default=None, description="Deprecated: D8 optimization is deterministic.")
    scenario: ScenarioIn
    threshold_mm: float | None = Field(default=None, gt=0.0, le=2000.0)
    enabled_types: list[Literal["storage", "permeable_surface", "drainage"]] | None = Field(
        default=None, max_length=3
    )
    include_pareto: bool = False

    @field_validator("threshold_mm")
    @classmethod
    def validate_threshold(cls, v: float | None) -> float | None:
        return _check_finite(v, "threshold_mm") if v is not None else None


@lru_cache(maxsize=1)
def get_real_twin():
    return load_clipped_twin()


@lru_cache(maxsize=1)
def get_simulator():
    return D8Simulator()


def _require_ready_twin():
    try:
        return get_real_twin(), get_simulator()
    except FileNotFoundError as exc:
        logger.error("dataset_unavailable detail=%s", exc)
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "error_category": "dataset_unavailable",
                "message": str(exc),
            },
        ) from exc
    except Exception as exc:
        logger.error("dataset_or_config_invalid detail=%s", exc)
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "error_category": "invalid_configuration_or_data",
                "message": str(exc),
            },
        ) from exc


def _validate_portfolio_bounds(interventions: list[InterventionIn], rows: int, cols: int) -> None:
    for item in interventions:
        if not (0 <= item.row < rows and 0 <= item.col < cols):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Intervention '{item.id}' coordinates ({item.row}, {item.col}) "
                    f"out of grid bounds [0..{rows - 1}, 0..{cols - 1}]"
                ),
            )


def _safe_optional_float(val: object, min_val: float | None = None, max_val: float | None = None) -> float | None:
    if val is None or isinstance(val, bool):
        return None
    try:
        num = float(val)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not math.isfinite(num):
        return None
    if min_val is not None and num < min_val:
        return None
    if max_val is not None and num > max_val:
        return None
    return round(num, 3)


def _parse_iso_pkt_naive(ts: object) -> datetime | None:
    if not isinstance(ts, str) or not ts.strip():
        return None
    try:
        dt = datetime.fromisoformat(ts.strip())
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(PKT_TZ).replace(tzinfo=None)
    return dt


def _normalize_hourly_series(
    raw_times: list,
    raw_precip_all: list,
    raw_soil_all: object,
) -> tuple[list[str], list[float | None], list[float | None], int]:
    """Validate strictly ascending non-duplicate timestamps and expand missing-hour gaps with None."""
    count = min(len(raw_times), len(raw_precip_all))
    soil_list = raw_soil_all if isinstance(raw_soil_all, list) else []

    parsed_dts: list[datetime] = []
    for i in range(count):
        dt = _parse_iso_pkt_naive(raw_times[i])
        if dt is None:
            raise ValueError(f"Unparseable forecast timestamp at index {i}: {raw_times[i]!r}")
        if parsed_dts and dt <= parsed_dts[-1]:
            raise ValueError(
                f"Duplicate or non-chronological timestamp at index {i}: {dt.isoformat()} <= {parsed_dts[-1].isoformat()}"
            )
        parsed_dts.append(dt)

    norm_times: list[str] = []
    norm_precip: list[float | None] = []
    norm_soil: list[float | None] = []
    gap_hours = 0

    for i, dt in enumerate(parsed_dts):
        if i > 0:
            delta_hrs = (dt - parsed_dts[i - 1]).total_seconds() / 3600.0
            if delta_hrs > 1.001:
                skipped = int(round(delta_hrs)) - 1
                # Insert explicit missing-hour slots instead of compressing across gaps
                for g in range(1, min(skipped + 1, 72)):
                    gap_dt = parsed_dts[i - 1] + timedelta(hours=g)
                    norm_times.append(gap_dt.strftime("%Y-%m-%dT%H:%M"))
                    norm_precip.append(None)
                    norm_soil.append(None)
                    gap_hours += 1

        norm_times.append(dt.strftime("%Y-%m-%dT%H:%M"))
        norm_precip.append(_safe_optional_float(raw_precip_all[i], min_val=0.0, max_val=1000.0))
        soil_val = soil_list[i] if i < len(soil_list) else None
        norm_soil.append(_safe_optional_float(soil_val, min_val=0.0, max_val=1.0))

    return norm_times, norm_precip, norm_soil, gap_hours


def _align_pkt_future_index(times: list[str], now_pkt: datetime | None = None) -> tuple[int, bool]:
    """Return (start_idx_of_current_or_future_hour, is_expired).

    Excludes elapsed hours strictly before the current PKT hour floor.
    If all timestamps in ``times`` predate the current PKT hour floor, marks expired.
    """
    if not times:
        return 0, True
    ref_pkt = now_pkt or datetime.now(PKT_TZ)
    current_hour_naive = ref_pkt.astimezone(PKT_TZ).replace(
        minute=0, second=0, microsecond=0, tzinfo=None
    )
    target_prefix = current_hour_naive.strftime("%Y-%m-%dT%H:00")
    for idx, t in enumerate(times):
        if t.startswith(target_prefix):
            return idx, False

    best_future_idx: int | None = None
    best_future_diff = float("inf")
    for idx, t in enumerate(times):
        dt = _parse_iso_pkt_naive(t)
        if dt is None:
            continue
        diff = (dt - current_hour_naive).total_seconds()
        if diff >= 0 and diff < best_future_diff:
            best_future_diff = diff
            best_future_idx = idx

    if best_future_idx is not None:
        return best_future_idx, False
    return len(times), True


def _find_current_pkt_hour_idx(times: list[str]) -> int:
    idx, _ = _align_pkt_future_index(times)
    return idx


@app.get("/api/live")
def liveness():
    """Pure process liveness probe (decoupled from dataset loading)."""
    return {"status": "alive", "version": app.version}


@app.get("/api/ready")
def readiness():
    """Readiness probe confirming clipped geospatial twin and config are valid."""
    (twin, meta), _ = _require_ready_twin()
    return {
        "status": "ready",
        "version": app.version,
        "shape": list(twin.shape),
        "crs": twin.crs,
        "cell_size_m": twin.cell_size_m,
        "bbox_wgs84": meta.get("pilot_metadata", {}).get("bbox_wgs84"),
    }


@app.get("/api/health")
def health():
    """Backward-compatible health endpoint combining readiness + capability metadata."""
    (twin, meta), _ = _require_ready_twin()
    return {
        "status": "ok",
        "ready": True,
        "version": app.version,
        "engine": "d8-hydrological-screening",
        "ml_model_loaded": False,
        "shape": list(twin.shape),
        "crs": twin.crs,
        "cell_size_m": twin.cell_size_m,
        "bbox_wgs84": meta.get("pilot_metadata", {}).get("bbox_wgs84"),
    }


@app.get("/api/twin")
def get_twin_payload():
    (twin, meta), _ = _require_ready_twin()
    return {
        "rows": int(twin.shape[0]),
        "cols": int(twin.shape[1]),
        "cell_size_m": twin.cell_size_m,
        "crs": twin.crs,
        "metadata": meta,
        "dem": twin.dem.round(2).ravel().tolist(),
        "f_imp": twin.f_imp.round(3).ravel().tolist() if twin.f_imp is not None else [],
        "land_cover": twin.land_cover.ravel().tolist(),
        "population": twin.population.round(1).ravel().tolist(),
        "buildings": twin.buildings.ravel().tolist(),
        "roads": twin.roads.astype(int).ravel().tolist(),
        "zones": twin.zones.ravel().tolist() if twin.zones is not None else [],
        "facilities": {
            k: v.astype(int).ravel().tolist() for k, v in twin.facilities.items()
        },
    }


@app.get("/api/forecast")
def get_open_meteo_forecast():
    """Fetch future PKT-aligned Open-Meteo precipitation & soil moisture (excluding elapsed hours)."""
    url = os.getenv(
        "FLOODFORGE_OPEN_METEO_URL",
        "https://api.open-meteo.com/v1/forecast"
        "?latitude=33.64&longitude=73.06"
        "&hourly=precipitation,precipitation_probability,soil_moisture_0_to_1cm"
        "&forecast_days=3&timezone=Asia%2FKarachi",
    )
    try:
        with urlopen(url, timeout=6) as resp:
            if getattr(resp, "status", 200) >= 400:
                raise HTTPException(status_code=503, detail="Open-Meteo returned HTTP error")
            payload = json.loads(resp.read().decode("utf-8"))
        hourly = payload.get("hourly") or {}
        raw_times = hourly["time"]
        raw_precip_all = hourly["precipitation"]
        if not isinstance(raw_times, list) or not isinstance(raw_precip_all, list) or not raw_times or not raw_precip_all:
            raise ValueError("Open-Meteo payload missing hourly precipitation series")
        times, precip_raw, soil_arr, gap_hours = _normalize_hourly_series(
            raw_times, raw_precip_all, hourly.get("soil_moisture_0_to_1cm")
        )
    except HTTPException:
        raise
    except (URLError, HTTPError, TimeoutError, json.JSONDecodeError, KeyError, ValueError, TypeError) as exc:
        logger.warning("weather_provider_unavailable detail=%s", exc)
        raise HTTPException(
            status_code=503,
            detail={
                "source": "unavailable",
                "forecast_status": "unavailable",
                "error_category": "weather_provider_unavailable",
                "message": "Open-Meteo weather forecast unavailable or malformed; no synthetic forecast substituted.",
            },
        ) from exc

    cur_idx, is_expired = _align_pkt_future_index(times)
    if is_expired or cur_idx >= len(times):
        raise HTTPException(
            status_code=503,
            detail={
                "source": "unavailable",
                "forecast_status": "unavailable",
                "error_category": "forecast_expired",
                "message": "Weather forecast timestamps are completely elapsed/expired.",
            },
        )

    future_times = times[cur_idx : cur_idx + 72]
    future_precip_raw = precip_raw[cur_idx : cur_idx + 72]
    future_soil = soil_arr[cur_idx : cur_idx + 72]
    valid_future_vals = [v for v in future_precip_raw if v is not None]
    if not valid_future_vals:
        raise HTTPException(
            status_code=503,
            detail={
                "source": "unavailable",
                "forecast_status": "unavailable",
                "error_category": "weather_data_incomplete",
                "message": "All future precipitation entries are missing; refusing to assume zero rainfall.",
            },
        )

    missing_future_hours = sum(1 for v in future_precip_raw if v is None) + max(0, 72 - len(future_precip_raw))
    valid_24h = sum(1 for v in future_precip_raw[:24] if v is not None)
    valid_48h = sum(1 for v in future_precip_raw[:48] if v is not None)
    valid_72h = len(valid_future_vals)
    coverage_24h = round((valid_24h / 24.0) * 100.0, 1)
    coverage_48h = round((valid_48h / 48.0) * 100.0, 1)
    coverage_72h = round((valid_72h / 72.0) * 100.0, 1)
    forecast_status = (
        "verified"
        if missing_future_hours == 0 and gap_hours == 0 and len(future_precip_raw) >= 72
        else "partial"
    )

    soil_now: float | None = soil_arr[cur_idx] if cur_idx < len(soil_arr) else None
    if soil_now is None and future_soil:
        for probe in range(min(3, len(future_soil))):
            if future_soil[probe] is not None:
                soil_now = future_soil[probe]
                break

    if soil_now is None:
        wetness = "unavailable"
    elif soil_now > 0.36:
        wetness = "saturated"
    elif soil_now > 0.28:
        wetness = "wet"
    elif soil_now > 0.18:
        wetness = "normal"
    else:
        wetness = "dry"

    # Strict future-only calculations without compressing missing hourly gaps
    future_24h_total = round(sum(v for v in future_precip_raw[:24] if v is not None), 1)
    future_48h_total = round(sum(v for v in future_precip_raw[:48] if v is not None), 1)
    future_72h_total = round(sum(valid_future_vals), 1)
    peak_1h = round(max(valid_future_vals), 1)

    best_6h = 0.0
    best_start_idx = 0
    if len(future_precip_raw) >= 6:
        for i in range(len(future_precip_raw) - 5):
            win = sum(v for v in future_precip_raw[i : i + 6] if v is not None)
            if win > best_6h:
                best_6h = win
                best_start_idx = i
    else:
        best_6h = sum(valid_future_vals)
        best_start_idx = 0

    return {
        "source": "open-meteo-live",
        "forecast_status": forecast_status,
        "provenance": "WEATHER_FORECAST",
        "fetched_at_utc": datetime.now(timezone.utc).isoformat(),
        "aligned_pkt_time": future_times[0] if future_times else None,
        "coverage_pct": coverage_72h,
        "horizon_coverage": {
            "24h": coverage_24h,
            "48h": coverage_48h,
            "72h": coverage_72h,
        },
        "missing_future_hours": missing_future_hours,
        "gap_hours_count": gap_hours,
        "hourly_time": future_times,
        "hourly_precipitation_mm": future_precip_raw,
        "hourly_soil_moisture_0_to_1cm": future_soil,
        "soil_moisture_0_to_1cm": soil_now,
        "antecedent_wetness": wetness,
        "peak_6h_total_mm": round(best_6h, 1),
        "peak_6h_rate_mm_per_hr": round(best_6h / 6.0, 2),
        "peak_6h_window_start": future_times[best_start_idx] if best_6h > 0.0 and future_times else None,
        "future_24h_total_mm": future_24h_total,
        "future_48h_total_mm": future_48h_total,
        "future_72h_total_mm": future_72h_total,
        "total_72h_mm": future_72h_total,
        "remaining_window_total_mm": future_72h_total,
        "peak_1h_mm_per_hr": peak_1h,
    }


@app.post("/api/simulate")
def simulate(req: SimulateRequest):
    (twin, _), sim = _require_ready_twin()
    _validate_portfolio_bounds(req.portfolio.interventions, twin.shape[0], twin.shape[1])

    scenario = Scenario(**req.scenario.model_dump())
    portfolio = Portfolio(
        interventions=[
            Intervention(
                id=i.id,
                type=InterventionType(i.type),
                row=i.row,
                col=i.col,
                size=i.size,
                cost_pkr=i.cost_pkr,
            )
            for i in req.portfolio.interventions
        ]
    )
    res = sim.run_scenario(twin, scenario, portfolio, threshold_mm=req.threshold_mm)
    return {
        "engine": "python-d8-v1",
        "provenance": "SIMULATED",
        "accumulation_mm": res.accumulation_mm.round(2).tolist(),
        "exposed_mask": res.exposed_mask.tolist(),
        "metrics": {
            "exposed_area_km2": res.metrics.exposed_area_km2,
            "buildings_exposed": res.metrics.buildings_exposed,
            "population_exposed": res.metrics.population_exposed,
            "road_cells_exposed": res.metrics.road_cells_exposed,
            "facilities_exposed": res.metrics.facilities_exposed,
        },
        "risk_transfer": (
            {
                "worse_mask": res.risk_transfer.worse_mask.tolist(),
                "buildings_worse": res.risk_transfer.buildings_worse,
                "population_worse": res.risk_transfer.population_worse,
                "flagged": res.risk_transfer.flagged,
            }
            if res.risk_transfer
            else None
        ),
        "uncertainty": {k: [v[0], v[1]] for k, v in res.uncertainty.items()},
        "assumptions": res.assumptions,
        "screening_level": res.screening_level,
        "zone_breakdown": res.zone_breakdown,
    }


_OPTIMIZE_CACHE_LOCK = threading.Lock()
_OPTIMIZE_CACHE_MAX = 64
_OPTIMIZE_CACHE: OrderedDict[tuple, dict] = OrderedDict()


@app.post("/api/optimize")
def optimize(req: OptimizeRequest):
    (twin, _), sim = _require_ready_twin()
    enabled_key = tuple(sorted(set(req.enabled_types))) if req.enabled_types is not None else None
    cache_key = (
        round(req.scenario.rainfall_mm_per_hr, 4),
        round(req.scenario.duration_hr, 4),
        round(req.scenario.budget_pkr, 2),
        req.scenario.antecedent_wetness,
        round(req.scenario.uncertainty_factor, 4),
        round(req.threshold_mm, 3) if req.threshold_mm is not None else None,
        enabled_key,
        req.include_pareto,
    )
    with _OPTIMIZE_CACHE_LOCK:
        cached_payload = _OPTIMIZE_CACHE.get(cache_key)
        if cached_payload is not None:
            _OPTIMIZE_CACHE.move_to_end(cache_key)
            return cached_payload

    scenario = Scenario(**req.scenario.model_dump())
    enabled_set = (
        {InterventionType(t) for t in req.enabled_types}
        if req.enabled_types is not None
        else None
    )

    # Optimize independently for the exact requested primary budget so include_pareto never alters primary results
    portfolio = sim.optimize_portfolio(
        twin,
        scenario,
        threshold_mm=req.threshold_mm,
        enabled_types=enabled_set,
    )

    payload: dict = {
        "engine": "python-d8-optimizer-v1",
        "provenance": "SIMULATED",
        "interventions": [
            {
                "id": i.id,
                "type": i.type.value,
                "row": i.row,
                "col": i.col,
                "size": i.size,
                "cost_pkr": i.cost_pkr,
            }
            for i in portfolio.interventions
        ],
    }

    if req.include_pareto:
        base_res = sim.run_scenario(
            twin, scenario, Portfolio(), threshold_mm=req.threshold_mm, include_uncertainty=False
        )
        base_area = base_res.metrics.exposed_area_km2
        budgets = sorted({50_000_000.0, 150_000_000.0, 200_000_000.0, 300_000_000.0, scenario.budget_pkr})
        pareto_rows = []
        for b in budgets:
            if b == scenario.budget_pkr:
                sub_port = portfolio
            else:
                sub_port = sim.optimize_portfolio(
                    twin,
                    Scenario(
                        rainfall_mm_per_hr=scenario.rainfall_mm_per_hr,
                        duration_hr=scenario.duration_hr,
                        budget_pkr=b,
                        antecedent_wetness=scenario.antecedent_wetness,
                        uncertainty_factor=scenario.uncertainty_factor,
                    ),
                    threshold_mm=req.threshold_mm,
                    enabled_types=enabled_set,
                )
            spent = sum(iv.cost_pkr for iv in sub_port.interventions)
            if base_area <= 0 or not sub_port.interventions:
                red_pct = 0.0
            else:
                sub_res = sim.run_scenario(
                    twin,
                    scenario,
                    sub_port,
                    baseline_acc=base_res.accumulation_mm,
                    threshold_mm=req.threshold_mm,
                    include_uncertainty=False,
                )
                red_pct = round(
                    max(0.0, ((base_area - sub_res.metrics.exposed_area_km2) / base_area) * 100.0),
                    1,
                )
            pareto_rows.append(
                {
                    "budget_pkr": b,
                    "cost_pkr": round(spent, 2),
                    "exposure_reduction_pct": red_pct,
                    "selected_count": len(sub_port.interventions),
                }
            )
        payload["pareto_frontier"] = pareto_rows

    with _OPTIMIZE_CACHE_LOCK:
        _OPTIMIZE_CACHE[cache_key] = payload
        _OPTIMIZE_CACHE.move_to_end(cache_key)
        while len(_OPTIMIZE_CACHE) > _OPTIMIZE_CACHE_MAX:
            _OPTIMIZE_CACHE.popitem(last=False)
    return payload
