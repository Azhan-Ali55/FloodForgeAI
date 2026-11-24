"""End-to-end CLI demo for FloodForge AI: simulate -> optimize -> compare."""

import time
from floodforge.io import load_inputs
from floodforge.optimizer import optimize


def main():
    rainfall_mm = 100.0
    duration_hr = 3.0
    budget_pkr = 8_000_000.0  # 8M PKR placeholder budget
    n_iter = 500              # Fast interactive demo; use 2000 for deeper search

    print("Loading catchment inputs (mock fallback)...")
    inputs = load_inputs(seed=42)

    print(
        f"Running optimization: rainfall={rainfall_mm} mm, "
        f"duration={duration_hr} hr, budget=PKR {budget_pkr:,.0f}, n_iter={n_iter}..."
    )
    t0 = time.perf_counter()
    result = optimize(
        inputs=inputs,
        rainfall_mm=rainfall_mm,
        duration_hr=duration_hr,
        budget_pkr=budget_pkr,
        n_iter=n_iter,
        seed=0,
    )
    elapsed = time.perf_counter() - t0

    print(f"\nCompleted in {elapsed:.2f} s")
    print(
        f"Score: Best={result.best_score:.4f} | "
        f"Random Avg={result.avg_random_score:.4f} | "
        f"Random Worst={result.worst_random_score:.4f}"
    )
    print(
        f"Selected {len(result.best_portfolio)} interventions | "
        f"Total Cost: PKR {result.total_cost_pkr:,.0f} / {budget_pkr:,.0f}"
    )
    for iv in result.best_portfolio:
        print(f"  - {iv.id} ({iv.type}) @ cell {iv.center}, zone {iv.zone}, cost=PKR {iv.cost_pkr:,.0f}")

    print("\n=== BEFORE / AFTER IMPACT METRICS ===")
    print(f"{'Metric':<26} {'Baseline':>14} {'Optimized':>14} {'Change':>12}")
    print("-" * 70)
    for key in [
        "exposed_area_km2",
        "buildings_exposed",
        "population_exposed",
        "road_segments_exposed",
        "facilities_exposed",
    ]:
        base = result.baseline_metrics[key]
        opt = result.optimized_metrics[key]
        pct = ((opt - base) / base * 100.0) if base > 0 else 0.0
        print(f"{key:<26} {base:>14.2f} {opt:>14.2f} {pct:>11.1f}%")

    print("\n=== RISK-TRANSFER CHECK (PER ZONE) ===")
    print(
        f"{'Zone':<6} {'Base km2':>10} {'Opt km2':>10} "
        f"{'Delta km2':>10} {'% Change':>10} {'Flag':>8}"
    )
    print("-" * 60)
    for row in result.risk_transfer_table:
        flag_str = "FLAG!" if row["risk_transfer_flag"] else "OK"
        print(
            f"{row['zone']:<6} {row['baseline_area_km2']:>10.4f} "
            f"{row['optimized_area_km2']:>10.4f} {row['delta_area_km2']:>10.4f} "
            f"{row['pct_change'] * 100:>9.1f}% {flag_str:>8}"
        )


if __name__ == "__main__":
    main()
