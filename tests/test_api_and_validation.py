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
    now_pkt = datetime.now(PKT_TZ).strftime("%Y-%m-%dT%H:00")
    fake_payload = {
        "hourly": {
            "time": ["2026-01-01T00:00", now_pkt, "2026-01-01T23:00"],
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
