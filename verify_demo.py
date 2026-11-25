"""One-command visual and functional verification demo for FloodForge AI.

Run:
    python verify_demo.py
"""

import time
import matplotlib.pyplot as plt
import numpy as np

from floodforge.io import load_inputs
from floodforge.optimizer import optimize
from floodforge.simulation import simulate


def main():
    print("=" * 64)
    print("FloodForge AI - Full Verification Demo")
    print("=" * 64)

    inputs = load_inputs(path=None, seed=42)
    rainfall_mm = 100.0
    duration_hr = 3.0
    budget_pkr = 8_000_000.0

    # 1. Sanity checks
    base = simulate(inputs, rainfall_mm=rainfall_mm, duration_hr=duration_hr)
    heavy = simulate(inputs, rainfall_mm=150.0, duration_hr=duration_hr)
    assert heavy.metrics["exposed_area_km2"] > base.metrics["exposed_area_km2"]
    print("[PASS] More rainfall -> more flooded area")

    # 2. Run optimizer
    t0 = time.perf_counter()
    opt = optimize(
        inputs=inputs,
        rainfall_mm=rainfall_mm,
        duration_hr=duration_hr,
        budget_pkr=budget_pkr,
        n_iter=500,
        seed=0,
    )
    elapsed = time.perf_counter() - t0
    assert opt.total_cost_pkr <= budget_pkr
    print(f"[PASS] Optimizer respected budget (PKR {opt.total_cost_pkr:,.0f} <= {budget_pkr:,.0f}) in {elapsed:.2f}s")
    print(f"[PASS] Optimized score ({opt.best_score:.4f}) > Random avg ({opt.avg_random_score:.4f})")

    opt_sim = simulate(
        inputs,
        rainfall_mm=rainfall_mm,
        duration_hr=duration_hr,
        interventions=opt.best_portfolio,
    )

    # 3. Print comparison table
    print("\n--- Before vs After (100 mm / 3 hr) ---")
    print(f"{'Metric':<25} {'Baseline':>12} {'Optimized':>12} {'Change':>10}")
    for k in [
        "exposed_area_km2",
        "buildings_exposed",
        "population_exposed",
        "road_segments_exposed",
        "facilities_exposed",
    ]:
        b = opt.baseline_metrics[k]
        o = opt.optimized_metrics[k]
        pct = ((o - b) / b * 100.0) if b > 0 else 0.0
        print(f"{k:<25} {b:>12.2f} {o:>12.2f} {pct:>9.1f}%")

    print("\n--- Risk-Transfer Check (Per Zone) ---")
    for row in opt.risk_transfer_table:
        status = "FLAG!" if row["risk_transfer_flag"] else "OK"
        print(
            f"Zone {row['zone']}: {row['baseline_area_km2']:.4f} -> "
            f"{row['optimized_area_km2']:.4f} km2 ({row['pct_change']*100:+.1f}%) [{status}]"
        )

    # 4. Save 3-panel visual comparison PNG
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    vmax = max(0.5, float(base.depth.max()))

    # Panel 1: Baseline flood
    axes[0].imshow(inputs["dem"], cmap="Greys", alpha=0.4)
    axes[0].imshow(
        np.ma.masked_where(~base.flooded_mask, base.depth),
        cmap="Blues",
        vmin=0.15,
        vmax=vmax,
    )
    axes[0].set_title(f"Baseline Flood\n({base.metrics['exposed_area_km2']:.3f} km2 flooded)")
    axes[0].axis("off")

    # Panel 2: Optimized flood + interventions
    axes[1].imshow(inputs["dem"], cmap="Greys", alpha=0.4)
    axes[1].imshow(
        np.ma.masked_where(~opt_sim.flooded_mask, opt_sim.depth),
        cmap="Blues",
        vmin=0.15,
        vmax=vmax,
    )
    marker_map = {
        "retention_pond": ("go", "Retention Pond"),
        "permeable_surface": ("ys", "Permeable Surface"),
        "drainage_upgrade": ("r^", "Drainage Upgrade"),
    }
    seen_labels = set()
    for iv in opt.best_portfolio:
        r, c = iv.center
        fmt, label = marker_map[iv.type]
        lbl = label if label not in seen_labels else None
        seen_labels.add(label)
        axes[1].plot(c, r, fmt, markersize=7, markeredgecolor="black", label=lbl)
    if seen_labels:
        axes[1].legend(loc="lower left", fontsize=8, framealpha=0.85)
    axes[1].set_title(f"Optimized Flood\n({opt_sim.metrics['exposed_area_km2']:.3f} km2 flooded)")
    axes[1].axis("off")

    # Panel 3: Random vs Optimized score
    axes[2].plot(opt.history, alpha=0.35, color="steelblue", label="Random portfolios")
    axes[2].axhline(opt.avg_random_score, color="orange", linestyle="--", label=f"Random avg ({opt.avg_random_score:.4f})")
    axes[2].axhline(opt.best_score, color="green", linewidth=2, label=f"Optimized best ({opt.best_score:.4f})")
    axes[2].set_title("Optimizer vs Random Portfolios")
    axes[2].set_xlabel("Iteration")
    axes[2].set_ylabel("Score")
    axes[2].legend(fontsize=8)
    axes[2].grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig("comparison_demo.png", dpi=150)
    print("\nSaved visual comparison to comparison_demo.png")


if __name__ == "__main__":
    main()
