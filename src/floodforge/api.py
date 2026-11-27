"""FastAPI server exposing the real 200x200 Nullah Lai TwinGrid and D8 Simulator."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal
from urllib.request import urlopen
import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .loader import load_clipped_twin
from .schemas import Intervention, InterventionType, Portfolio, Scenario
from .simulator import D8Simulator

app = FastAPI(title="FloodForge AI Backend", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScenarioIn(BaseModel):
    rainfall_mm_per_hr: float
    duration_hr: float
    budget_pkr: float


class InterventionIn(BaseModel):
    id: str
    type: Literal["storage", "permeable_surface", "drainage"]
    row: int
    col: int
    size: float
    cost_pkr: float


class PortfolioIn(BaseModel):
    interventions: list[InterventionIn] = []


class SimulateRequest(BaseModel):
    seed: int = 0
    scenario: ScenarioIn
    portfolio: PortfolioIn = PortfolioIn()
    threshold_mm: float | None = None


class OptimizeRequest(BaseModel):
    seed: int = 0
    scenario: ScenarioIn
    threshold_mm: float | None = None


@lru_cache(maxsize=1)
def get_real_twin():
    return load_clipped_twin()


@lru_cache(maxsize=1)
def get_simulator():
    return D8Simulator()


@app.get("/api/health")
def health():
    twin, meta = get_real_twin()
    return {
        "status": "ok",
        "shape": list(twin.shape),
        "crs": twin.crs,
        "cell_size_m": twin.cell_size_m,
        "bbox_wgs84": meta.get("pilot_metadata", {}).get("bbox_wgs84"),
    }


@app.get("/api/twin")
def get_twin_payload():
    twin, meta = get_real_twin()
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
    """Fetch 72-hour hourly precipitation & soil moisture from Open-Meteo and compute peak rolling 6h window."""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        "?latitude=33.64&longitude=73.06"
        "&hourly=precipitation,precipitation_probability,soil_moisture_0_to_1cm"
        "&forecast_days=3&timezone=Asia%2FKarachi"
    )
    try:
        with urlopen(url, timeout=6) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        times: list[str] = payload["hourly"]["time"][:72]
        precip: list[float] = [float(x or 0.0) for x in payload["hourly"]["precipitation"][:72]]
        soil_arr: list[float] = [
            float(x if x is not None else 0.24)
            for x in payload["hourly"].get("soil_moisture_0_to_1cm", [0.24] * 72)[:72]
        ]
        soil_now = round(soil_arr[0] if soil_arr else 0.24, 3)
        wetness = (
            "saturated"
            if soil_now > 0.36
            else "wet"
            if soil_now > 0.28
            else "normal"
            if soil_now > 0.18
            else "dry"
        )
        total_72h = round(sum(precip), 1)
        peak_1h = round(max(precip) if precip else 0.0, 1)

        best_6h = 0.0
        best_start_idx = 0
        for i in range(max(1, len(precip) - 5)):
            win = sum(precip[i : i + 6])
            if win > best_6h:
                best_6h = win
                best_start_idx = i

        return {
            "source": "open-meteo-live",
            "hourly_time": times,
            "hourly_precipitation_mm": precip,
            "hourly_soil_moisture_0_to_1cm": soil_arr,
            "soil_moisture_0_to_1cm": soil_now,
            "antecedent_wetness": wetness,
            "peak_6h_total_mm": round(best_6h, 1),
            "peak_6h_rate_mm_per_hr": round(best_6h / 6.0, 2),
            "peak_6h_window_start": times[best_start_idx] if times else None,
            "total_72h_mm": total_72h,
            "peak_1h_mm_per_hr": peak_1h,
        }
    except Exception as exc:
        # Clean fallback synthetic 72h monsoon forecast profile
        fallback = [0.0] * 72
        for idx, val in zip(range(28, 34), [14.0, 24.0, 34.0, 28.0, 18.0, 10.0]):
            fallback[idx] = val
        return {
            "source": "simulated-fallback",
            "error": str(exc),
            "hourly_time": [f"+{h}h" for h in range(72)],
            "hourly_precipitation_mm": fallback,
            "hourly_soil_moisture_0_to_1cm": [0.29] * 72,
            "soil_moisture_0_to_1cm": 0.29,
            "antecedent_wetness": "wet",
            "peak_6h_total_mm": 128.0,
            "peak_6h_rate_mm_per_hr": 21.33,
            "peak_6h_window_start": "+28h",
            "total_72h_mm": 128.0,
            "peak_1h_mm_per_hr": 34.0,
        }


@app.post("/api/simulate")
def simulate(req: SimulateRequest):
    twin, _ = get_real_twin()
    sim = get_simulator()
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


@app.post("/api/optimize")
def optimize(req: OptimizeRequest):
    twin, _ = get_real_twin()
    sim = get_simulator()
    scenario = Scenario(**req.scenario.model_dump())
    portfolio = sim.optimize_portfolio(twin, scenario, threshold_mm=req.threshold_mm)
    return {
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
        ]
    }
