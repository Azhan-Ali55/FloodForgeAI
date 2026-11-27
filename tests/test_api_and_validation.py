from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import json
from unittest.mock import patch

import numpy as np
import pytest

from floodforge import api
from floodforge.loader import load_clipped_twin
from floodforge.schemas import Scenario

PKT_TZ = timezone(timedelta(hours=5))


def _asgi_request(
    method: str,
    path: str,
    json_body: dict | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], dict]:
    body_bytes = json.dumps(json_body).encode("utf-8") if json_body is not None else b""
    req_headers: list[tuple[bytes, bytes]] = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    if json_body is not None:
        req_headers.append((b"content-type", b"application/json"))
        req_headers.append((b"content-length", str(len(body_bytes)).encode()))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method.upper(),
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": req_headers,
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 8000),
    }

    sent: list[dict] = []
    consumed = False

    async def receive():
        nonlocal consumed
        if not consumed:
            consumed = True
            return {"type": "http.request", "body": body_bytes, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    asyncio.run(api.app(scope, receive, send))

    start = next(m for m in sent if m["type"] == "http.response.start")
    resp_headers = {k.decode().lower(): v.decode() for k, v in start.get("headers", [])}
    raw_body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    parsed: dict = {}
    if raw_body and "application/json" in resp_headers.get("content-type", ""):
        parsed = json.loads(raw_body.decode("utf-8"))
    return int(start["status"]), resp_headers, parsed


def test_liveness_readiness_and_health():
    status, hdrs, data = _asgi_request("GET", "/api/live")
    assert status == 200
    assert data["status"] == "alive"
    assert "x-request-id" in hdrs

    status, _, ready = _asgi_request("GET", "/api/ready")
    assert status == 200
    assert ready["status"] == "ready"
    assert ready["shape"] == [200, 200]

    status, _, health = _asgi_request("GET", "/api/health")
    assert status == 200
    assert health["status"] == "ok"
    assert health["ready"] is True
    assert health["ml_model_loaded"] is False
    assert health["shape"] == [200, 200]


def test_dry_zero_rainfall_and_invalid_inputs_return_422():
    status, _, dry_res = _asgi_request(
        "POST",
        "/api/simulate",
        json_body={
            "scenario": {"rainfall_mm_per_hr": 0.0, "duration_hr": 1.0, "budget_pkr": 50_000_000},
            "portfolio": {"interventions": []},
        },
    )
    assert status == 200
    assert dry_res["metrics"]["exposed_area_km2"] == 0.0

    status, _, dry_opt = _asgi_request(
        "POST",
        "/api/optimize",
        json_body={
            "scenario": {"rainfall_mm_per_hr": 0.0, "duration_hr": 1.0, "budget_pkr": 50_000_000},
            "include_pareto": True,
        },
    )
    assert status == 200
    assert dry_opt["interventions"] == []

    # Invalid negative rainfall -> 422 (never 500)
    status, _, _ = _asgi_request(
        "POST",
        "/api/simulate",
        json_body={"scenario": {"rainfall_mm_per_hr": -5.0, "duration_hr": 2.0, "budget_pkr": 1_000}},
    )
    assert status == 422

    # Invalid out-of-bounds intervention coordinates -> 422
    status, _, _ = _asgi_request(
        "POST",
        "/api/simulate",
        json_body={
            "scenario": {"rainfall_mm_per_hr": 50.0, "duration_hr": 2.0, "budget_pkr": 50_000_000},
            "portfolio": {
                "interventions": [
                    {
                        "id": "bad-1",
                        "type": "storage",
                        "row": 250,
                        "col": 10,
                        "size": 18000,
                        "cost_pkr": 5_760_000,
                    }
                ]
            },
        },
    )
    assert status == 422


def test_optimize_custom_types_and_scenario_specific_pareto():
    status, _, body = _asgi_request(
        "POST",
        "/api/optimize",
        json_body={
            "scenario": {
                "rainfall_mm_per_hr": 62.0,
                "duration_hr": 10.0,
                "budget_pkr": 200_000_000,
                "antecedent_wetness": "saturated",
            },
            "threshold_mm": 150.0,
            "enabled_types": ["permeable_surface"],
            "include_pareto": True,
        },
    )
    assert status == 200
    assert len(body["interventions"]) > 0
    assert all(iv["type"] == "permeable_surface" for iv in body["interventions"])
    assert len(body["pareto_frontier"]) >= 4


def test_cors_restricts_unknown_origin():
    _, hdrs_ok, _ = _asgi_request(
        "OPTIONS",
        "/api/simulate",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert hdrs_ok.get("access-control-allow-origin") == "http://127.0.0.1:5173"

    _, hdrs_blocked, _ = _asgi_request(
        "OPTIONS",
        "/api/simulate",
        headers={
            "Origin": "https://untrusted.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert hdrs_blocked.get("access-control-allow-origin") is None


def test_forecast_aligns_current_pkt_hour_and_handles_missing_and_outage():
    now_dt = datetime.now(PKT_TZ)
    now_pkt = now_dt.strftime("%Y-%m-%dT%H:00")
    next_pkt = (now_dt + timedelta(hours=1)).strftime("%Y-%m-%dT%H:00")
    fake_payload = {
        "hourly": {
            "time": ["2026-01-01T00:00", now_pkt, next_pkt],
            "precipitation": [0.0, 2.5, 0.0],
            "soil_moisture_0_to_1cm": [0.12, None, 0.35],
        }
    }

    class _MockResp:
        status = 200

        def __init__(self, payload_bytes: bytes):
            self._bytes = payload_bytes

        def read(self):
            return self._bytes

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    with patch("floodforge.api.urlopen", return_value=_MockResp(json.dumps(fake_payload).encode())):
        status, _, body = _asgi_request("GET", "/api/forecast")
        assert status == 200
        assert body["aligned_pkt_time"] == now_pkt
        assert body["source"] == "open-meteo-live"

    all_null_payload = {
        "hourly": {
            "time": [now_pkt],
            "precipitation": [0.0],
            "soil_moisture_0_to_1cm": [None],
        }
    }
    with patch("floodforge.api.urlopen", return_value=_MockResp(json.dumps(all_null_payload).encode())):
        status, _, body_missing = _asgi_request("GET", "/api/forecast")
        assert status == 200
        assert body_missing["soil_moisture_0_to_1cm"] is None
        assert body_missing["antecedent_wetness"] == "unavailable"

    with patch("floodforge.api.urlopen", side_effect=TimeoutError("upstream down")):
        status, _, body_outage = _asgi_request("GET", "/api/forecast")
        assert status == 503
        assert body_outage["detail"]["error_category"] == "weather_provider_unavailable"


def test_forecast_coverage_continuity_gaps_and_malformed_soil_moisture():
    now_dt = datetime.now(PKT_TZ).replace(minute=0, second=0, microsecond=0)

    class _MockResp:
        status = 200

        def __init__(self, payload_bytes: bytes):
            self._bytes = payload_bytes

        def read(self):
            return self._bytes

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    # 1. A 24h response must NOT claim 100% 72-hour verified coverage
    times_24 = [(now_dt + timedelta(hours=h)).strftime("%Y-%m-%dT%H:00") for h in range(24)]
    payload_24 = {
        "hourly": {
            "time": times_24,
            "precipitation": [1.0] * 24,
            "soil_moisture_0_to_1cm": ["bad-value"] + [0.22] * 23,
        }
    }
    with patch("floodforge.api.urlopen", return_value=_MockResp(json.dumps(payload_24).encode())):
        status, _, body24 = _asgi_request("GET", "/api/forecast")
        assert status == 200
        assert body24["coverage_pct"] < 50.0
        assert body24["horizon_coverage"]["24h"] == 100.0
        assert body24["horizon_coverage"]["72h"] < 50.0
        assert body24["forecast_status"] != "verified"
        assert body24["forecast_status"] == "partial"
        # Malformed soil moisture string handled cleanly without HTTP 500
        assert body24["antecedent_wetness"] == "unavailable"

    # 2. Missing hour gap must expand to None rather than compressing separate pulses into 6h window
    gap_times = [
        (now_dt + timedelta(hours=h)).strftime("%Y-%m-%dT%H:00")
        for h in [0, 1, 2, 10, 11, 12]
    ]
    gap_payload = {
        "hourly": {
            "time": gap_times,
            "precipitation": [10.0, 10.0, 10.0, 20.0, 20.0, 20.0],
            "soil_moisture_0_to_1cm": [0.25] * 6,
        }
    }
    with patch("floodforge.api.urlopen", return_value=_MockResp(json.dumps(gap_payload).encode())):
        status, _, gap_body = _asgi_request("GET", "/api/forecast")
        assert status == 200
        # Because hours 3..9 are expanded as None, max rolling 6h is 60.0 mm (hours 10..12), NOT 90.0 mm
        assert gap_body["peak_6h_total_mm"] == pytest.approx(60.0)
        assert None in gap_body["hourly_precipitation_mm"]

    # 3. Duplicate / non-chronological timestamps rejected cleanly (no HTTP 500)
    dup_payload = {
        "hourly": {
            "time": [now_dt.strftime("%Y-%m-%dT%H:00"), now_dt.strftime("%Y-%m-%dT%H:00")],
            "precipitation": [1.0, 2.0],
            "soil_moisture_0_to_1cm": [0.2, 0.2],
        }
    }
    with patch("floodforge.api.urlopen", return_value=_MockResp(json.dumps(dup_payload).encode())):
        status, _, _ = _asgi_request("GET", "/api/forecast")
        assert status == 502


def test_loader_rejects_corrupt_or_missing_rasters(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_clipped_twin(clipped_dir=tmp_path / "does_not_exist")

    np.save(tmp_path / "dem_filled.npy", np.array([[np.nan, 500.0], [500.0, 500.0]], dtype=np.float32))
    np.save(tmp_path / "f_imp.npy", np.full((2, 2), 0.5, dtype=np.float32))
    np.save(tmp_path / "buildings.npy", np.zeros((2, 2), dtype=np.uint8))
    np.save(tmp_path / "population.npy", np.zeros((2, 2), dtype=np.float32))
    np.save(tmp_path / "roads.npy", np.zeros((2, 2), dtype=np.uint8))
    np.save(tmp_path / "zones_adm3.npy", np.ones((2, 2), dtype=np.uint8))
    with pytest.raises(ValueError, match="NaN/Inf"):
        load_clipped_twin(clipped_dir=tmp_path)


def test_scenario_uncertainty_factor_scales_linearly():
    s = Scenario(rainfall_mm_per_hr=10.0, duration_hr=2.0, budget_pkr=0.0, uncertainty_factor=1.5)
    assert s.total_rainfall_mm * s.uncertainty_factor == 30.0


def test_audit_case_a_elapsed_hours_excluded_and_expired_or_null_rejected():
    """TEST A: At 18:00 PKT with 300mm elapsed earlier and 0mm remaining, future peak must be 0."""
    fixed_1800 = datetime(2026, 7, 23, 18, 15, tzinfo=PKT_TZ)
    times = [
        f"2026-07-{23 + day:02d}T{h:02d}:00"
        for day in range(4)
        for h in range(24)
    ]
    # Hours 00:00..17:00 sum to 300.0 mm; all remaining forecast hours (18:00 onward) are 0.0 mm
    precip = [16.0] * 17 + [28.0] + [0.0] * (len(times) - 18)
    assert sum(precip[:18]) == 300.0

    class _MockResp:
        status = 200

        def __init__(self, payload: dict):
            self._bytes = json.dumps(payload).encode()

        def read(self):
            return self._bytes

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    class _FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_1800 if tz is not None else fixed_1800.replace(tzinfo=None)

    with (
        patch("floodforge.api.datetime", _FixedDatetime),
        patch(
            "floodforge.api.urlopen",
            return_value=_MockResp(
                {
                    "hourly": {
                        "time": times,
                        "precipitation": precip,
                        "soil_moisture_0_to_1cm": [0.22] * len(times),
                    }
                }
            ),
        ),
    ):
        status, _, body = _asgi_request("GET", "/api/forecast")
        assert status == 200
        assert body["aligned_pkt_time"] == "2026-07-23T18:00"
        assert body["peak_6h_total_mm"] == 0.0
        assert body["peak_6h_rate_mm_per_hr"] == 0.0
        assert body["peak_6h_window_start"] is None
        assert body["peak_1h_mm_per_hr"] == 0.0
        assert body["future_24h_total_mm"] == 0.0
        assert body["remaining_window_total_mm"] == 0.0
        assert body["forecast_status"] == "verified"

    # Completely elapsed timestamps -> 503 forecast_expired
    expired_times = [f"2020-01-01T{h:02d}:00" for h in range(12)]
    with (
        patch("floodforge.api.datetime", _FixedDatetime),
        patch(
            "floodforge.api.urlopen",
            return_value=_MockResp(
                {
                    "hourly": {
                        "time": expired_times,
                        "precipitation": [25.0] * 12,
                    }
                }
            ),
        ),
    ):
        status, _, err_exp = _asgi_request("GET", "/api/forecast")
        assert status == 503
        assert err_exp["detail"]["error_category"] == "forecast_expired"

    # All-null future precipitation -> 503 weather_data_incomplete (never coerce missing to 0)
    with (
        patch("floodforge.api.datetime", _FixedDatetime),
        patch(
            "floodforge.api.urlopen",
            return_value=_MockResp(
                {
                    "hourly": {
                        "time": times[18:],
                        "precipitation": [None] * len(times[18:]),
                    }
                }
            ),
        ),
    ):
        status, _, err_null = _asgi_request("GET", "/api/forecast")
        assert status == 503
        assert err_null["detail"]["error_category"] == "weather_data_incomplete"


def test_audit_case_b_pareto_does_not_alter_primary_portfolio_and_independent_budgets():
    """TEST B: Enabling include_pareto with PKR 50M budget must return the exact same primary portfolio."""
    base_req = {
        "scenario": {
            "rainfall_mm_per_hr": 62.0,
            "duration_hr": 10.0,
            "budget_pkr": 50_000_000.0,
            "antecedent_wetness": "saturated",
        },
        "threshold_mm": 150.0,
    }
    st1, _, res_no_pareto = _asgi_request(
        "POST", "/api/optimize", json_body={**base_req, "include_pareto": False}
    )
    st2, _, res_with_pareto = _asgi_request(
        "POST", "/api/optimize", json_body={**base_req, "include_pareto": True}
    )
    assert st1 == 200 and st2 == 200
    assert res_no_pareto["provenance"] == "SIMULATED"
    assert res_with_pareto["provenance"] == "SIMULATED"
    assert res_with_pareto["interventions"] == res_no_pareto["interventions"]
    assert sum(iv["cost_pkr"] for iv in res_with_pareto["interventions"]) <= 50_000_000.0

    # Verify Pareto point for 50M matches primary selection and all Pareto budgets obey constraints
    row_50m = next(p for p in res_with_pareto["pareto_frontier"] if p["budget_pkr"] == 50_000_000.0)
    assert row_50m["selected_count"] == len(res_with_pareto["interventions"])
    assert row_50m["cost_pkr"] == round(sum(iv["cost_pkr"] for iv in res_with_pareto["interventions"]), 2)
    for row in res_with_pareto["pareto_frontier"]:
        assert 0.0 <= row["cost_pkr"] <= row["budget_pkr"]
        assert 0.0 <= row["exposure_reduction_pct"] <= 100.0


def test_simulate_parity_reference_metrics():
    """Capture canonical Python D8 metrics on the 200x200 Nullah Lai grid for TS cross-check."""
    status, _, sim_res = _asgi_request(
        "POST",
        "/api/simulate",
        json_body={
            "scenario": {
                "rainfall_mm_per_hr": 62.0,
                "duration_hr": 10.0,
                "budget_pkr": 200_000_000.0,
                "antecedent_wetness": "saturated",
            },
            "threshold_mm": 150.0,
            "portfolio": {"interventions": []},
        },
    )
    assert status == 200
    assert sim_res["engine"] == "python-d8-v1"
    assert sim_res["provenance"] == "SIMULATED"
    m = sim_res["metrics"]
    assert m["exposed_area_km2"] > 0.5
    assert m["buildings_exposed"] > 100
