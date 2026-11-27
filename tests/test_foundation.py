from floodforge.config import load_config
from floodforge.schemas import Intervention, InterventionType, Portfolio, Scenario
from floodforge.synthetic import make_synthetic_twin


def test_config_loads():
    cfg = load_config()
    assert cfg.crs == "EPSG:32643" and cfg.cell_size_m == 30
    assert cfg.runoff_coefficients[50] > cfg.runoff_coefficients[10]


def test_synthetic_twin_is_aligned():
    twin = make_synthetic_twin()
    assert twin.shape == (80, 80) and twin.buildings.sum() > 0


def test_scenario_and_portfolio():
    s = Scenario(rainfall_mm_per_hr=50, duration_hr=2, budget_pkr=50_000_000)
    assert s.total_rainfall_mm == 100
    dry = Scenario(rainfall_mm_per_hr=0, duration_hr=1, budget_pkr=50_000_000)
    assert dry.total_rainfall_mm == 0
    p = Portfolio([Intervention("a", InterventionType.STORAGE, 10, 10, 500, 7_500_000)])
    assert p.within_budget(s.budget_pkr) and not p.within_budget(1_000_000)
    for bad in ((-1, 2, 1), (10, 0, 1), (10, 2, -5), (float("nan"), 2, 1)):
        try:
            Scenario(*bad)
            raise AssertionError(f"expected ValueError for {bad}")
        except ValueError:
            pass


if __name__ == "__main__":  # run without pytest: python tests/test_foundation.py
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)