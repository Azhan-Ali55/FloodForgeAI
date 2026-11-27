"""End-to-end smoke verification for FloodForge AI."""
from __future__ import annotations

from .config import load_config
from .mock_data import make_nullah_lai_twin
from .optimizer import optimize_portfolio
from .schemas import Portfolio, Scenario
from .simulation import ScreeningSimulator
from .surrogate import train_surrogate


def main() -> None:
    cfg = load_config()
    twin = make_nullah_lai_twin(shape=(60, 60), cell_size_m=cfg.cell_size_m, crs=cfg.crs, seed=42)
    sim = ScreeningSimulator(cfg=cfg, d8_passes=4)
    sc = Scenario(rainfall_mm_per_hr=60.0, duration_hr=2.0, budget_pkr=50_000_000.0)
    base = sim.run_scenario(twin, sc, Portfolio([]))
    assert base.accumulation_mm.shape == twin.shape
    bundle = train_surrogate(twin, cfg=cfg, simulator=sim, n_samples=40, n_estimators=20, seed=42)
    out = optimize_portfolio(
        twin=twin, scenario=sc, surrogate=bundle, cfg=cfg, simulator=sim,
        n_candidates_pool=40, shortlist_k=3, swap_iters=3, seed=42
    )
    assert out.best_portfolio.within_budget(sc.budget_pkr)
    print("ALL VERIFICATION CHECKS PASSED.")


if __name__ == "__main__":
    main()
