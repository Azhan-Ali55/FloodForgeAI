"""Unit and integration tests for FloodForge AI."""

import numpy as np
import pytest

from floodforge.io import load_inputs
from floodforge.interventions import generate_candidates
from floodforge.metrics import compute_metrics, risk_transfer_check
from floodforge.optimizer import optimize
from floodforge.simulation import simulate


@pytest.fixture(scope="module")
def mock_inputs():
    return load_inputs(path=None, seed=42)


def test_simulation_runs(mock_inputs):
    res = simulate(mock_inputs, rainfall_mm=100.0, duration_hr=3.0)
    assert res.depth.shape == mock_inputs["dem"].shape
    assert res.flooded_mask.shape == mock_inputs["dem"].shape
    assert res.flow_accum.shape == mock_inputs["dem"].shape
    assert res.flooded_mask.dtype == bool
    assert set(res.metrics.keys()) == {
        "exposed_area_km2",
        "buildings_exposed",
        "population_exposed",
        "road_segments_exposed",
        "facilities_exposed",
    }


def test_more_rainfall_increases_flooded_area(mock_inputs):
    low_rain = simulate(mock_inputs, rainfall_mm=50.0, duration_hr=3.0)
    high_rain = simulate(mock_inputs, rainfall_mm=150.0, duration_hr=3.0)
    assert high_rain.metrics["exposed_area_km2"] > low_rain.metrics["exposed_area_km2"]
    assert np.all(high_rain.depth >= low_rain.depth)


def test_interventions_never_increase_exposure_in_isolation(mock_inputs):
    baseline = simulate(mock_inputs, rainfall_mm=100.0, duration_hr=3.0)
    candidates = generate_candidates(mock_inputs, baseline_result=baseline)
    assert 30 <= len(candidates) <= 100

    # Test a representative sample across all 3 intervention types
    by_type = {}
    for cand in candidates:
        by_type.setdefault(cand.type, []).append(cand)
    assert set(by_type.keys()) == {
        "retention_pond",
        "permeable_surface",
        "drainage_upgrade",
    }

    for iv_type, group in by_type.items():
        for cand in group[:5]:
            res = simulate(mock_inputs, rainfall_mm=100.0, duration_hr=3.0, interventions=[cand])
            assert res.metrics["exposed_area_km2"] <= baseline.metrics["exposed_area_km2"] + 1e-12, (
                f"{iv_type} {cand.id} increased exposed area"
            )
            assert res.metrics["buildings_exposed"] <= baseline.metrics["buildings_exposed"]
            assert res.metrics["population_exposed"] <= baseline.metrics["population_exposed"] + 1e-9


def test_optimizer_respects_budget_and_is_reproducible(mock_inputs):
    budget = 5_000_000.0
    res1 = optimize(
        mock_inputs,
        rainfall_mm=100.0,
        duration_hr=3.0,
        budget_pkr=budget,
        n_iter=60,
        seed=7,
    )
    res2 = optimize(
        mock_inputs,
        rainfall_mm=100.0,
        duration_hr=3.0,
        budget_pkr=budget,
        n_iter=60,
        seed=7,
    )

    assert res1.total_cost_pkr <= budget
    assert sum(iv.cost_pkr for iv in res1.best_portfolio) == pytest.approx(res1.total_cost_pkr)
    assert len(res1.history) == 60
    assert res1.best_score >= res1.avg_random_score >= res1.worst_random_score

    # Reproducibility check
    assert res1.best_score == pytest.approx(res2.best_score)
    assert [iv.id for iv in res1.best_portfolio] == [iv.id for iv in res2.best_portfolio]


def test_risk_transfer_check_flags_worse_off_zone():
    zones = np.array(
        [
            [1, 1, 2, 2],
            [1, 1, 2, 2],
        ],
        dtype=int,
    )
    base_mask = np.array(
        [
            [True, False, True, False],
            [False, False, False, False],
        ]
    )
    opt_mask = np.array(
        [
            [False, False, True, True],
            [False, False, False, False],
        ]
    )
    table = risk_transfer_check(base_mask, opt_mask, zones, tolerance=0.05)
    by_zone = {row["zone"]: row for row in table}
    assert by_zone[1]["risk_transfer_flag"] is False
    assert by_zone[2]["risk_transfer_flag"] is True


def test_surrogate_trains_and_prescreens(mock_inputs):
    from floodforge.surrogate import train_surrogate

    baseline = simulate(mock_inputs, rainfall_mm=100.0, duration_hr=3.0)
    candidates = generate_candidates(mock_inputs, baseline_result=baseline)
    surr = train_surrogate(
        mock_inputs,
        candidates=candidates,
        budget_pkr=6_000_000.0,
        n_samples=120,
        n_trees=8,
        seed=1,
    )
    assert "exposed_area_km2" in surr.r2_scores
    opt_res = optimize(
        mock_inputs,
        rainfall_mm=100.0,
        duration_hr=3.0,
        budget_pkr=6_000_000.0,
        n_iter=60,
        seed=2,
        surrogate=surr,
    )
    assert opt_res.total_cost_pkr <= 6_000_000.0
    assert len(opt_res.history) == 60
