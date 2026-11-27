import numpy as np

from floodforge.loader import load_clipped_twin
from floodforge.schemas import Intervention, InterventionType, Portfolio, Scenario
from floodforge.simulator import D8Simulator


def test_clipped_twin_loads_cleanly():
    twin, meta = load_clipped_twin()
    assert twin.shape == (200, 200)
    assert twin.crs == "EPSG:32643"
    assert twin.cell_size_m == 30.0
    assert twin.f_imp is not None
    assert twin.zones is not None
    assert not np.isnan(twin.dem).any()
    assert not np.isnan(twin.f_imp).any()
    assert not np.isnan(twin.population).any()
    assert twin.buildings.sum() == 2002
    assert twin.facilities["hospital"].sum() > 0
    assert twin.facilities["school"].sum() > 0
    assert "mode_b_presets" in meta


def test_d8_simulator_and_risk_transfer():
    twin, _ = load_clipped_twin()
    sim = D8Simulator()
    # July 23, 2001 Cloudburst: 620 mm over 10 hr -> 62 mm/hr, severe inundation threshold=150 mm
    scenario = Scenario(rainfall_mm_per_hr=62.0, duration_hr=10.0, budget_pkr=200_000_000)
    base = sim.run_scenario(twin, scenario, Portfolio(), threshold_mm=150.0)
    assert base.metrics.buildings_exposed > 0
    assert "upstream_islamabad" in base.zone_breakdown
    assert "downstream_rawalpindi" in base.zone_breakdown

    opt = sim.optimize_portfolio(twin, scenario, threshold_mm=150.0)
    assert len(opt.interventions) > 0
    assert opt.within_budget(scenario.budget_pkr)

    mit = sim.run_scenario(
        twin, scenario, opt, baseline_acc=base.accumulation_mm, threshold_mm=150.0
    )
    assert mit.metrics.exposed_area_km2 < base.metrics.exposed_area_km2 * 0.70
    assert mit.metrics.buildings_exposed < base.metrics.buildings_exposed
    assert mit.risk_transfer is not None and not mit.risk_transfer.flagged

    # Verify drainage-only upstream can be evaluated cleanly without errors
    drain_only = Portfolio([Intervention("d1", InterventionType.DRAINAGE, 50, 100, 12000, 4_800_000)])
    drain_res = sim.run_scenario(
        twin, scenario, drain_only, baseline_acc=base.accumulation_mm, threshold_mm=150.0
    )
    assert drain_res.risk_transfer is not None
