"""Visualization utilities for FloodForge AI Mode A & Mode B runs."""
from __future__ import annotations

from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np

from .optimizer import OptimizationOutcome
from .schemas import TwinGrid


def plot_floodforge_dashboard(
    twin: TwinGrid,
    opt_out: OptimizationOutcome,
    pareto_rows: list[dict] | None = None,
    out_path: str | Path = "/content/drive/MyDrive/FloodForgeAI_backup/floodforge_dashboard.png",
) -> Path:
    """Render baseline vs. mitigated accumulation, intervention map, and Pareto curve."""
    base_acc = opt_out.baseline_result.accumulation_mm
    opt_acc = opt_out.best_result.accumulation_mm
    diff_acc = opt_out.best_result.accumulation_mm - base_acc

    ncols = 4 if pareto_rows else 3
    fig, axes = plt.subplots(1, ncols, figsize=(5.2 * ncols, 4.4))
    fig.patch.set_facecolor("white")

    # 1. Baseline accumulation
    im0 = axes[0].imshow(base_acc, cmap="Blues")
    axes[0].set_title("Baseline Accumulation (mm)")
    axes[0].set_xlabel("Col (30 m)")
    axes[0].set_ylabel("Row (30 m)")
    plt.colorbar(im0, ax=axes[0], fraction=0.046, pad=0.04)

    # 2. Mitigated accumulation + interventions
    im1 = axes[1].imshow(opt_acc, cmap="Blues")
    if opt_out.best_portfolio.interventions:
        rows = [item.row for item in opt_out.best_portfolio.interventions]
        cols = [item.col for item in opt_out.best_portfolio.interventions]
        axes[1].scatter(cols, rows, c="crimson", s=36, marker="o", edgecolors="white", linewidths=0.8, label="Interventions")
        axes[1].legend(loc="upper right", fontsize=8)
    axes[1].set_title("Mitigated + Portfolio")
    axes[1].set_xlabel("Col (30 m)")
    plt.colorbar(im1, ax=axes[1], fraction=0.046, pad=0.04)

    # 3. Net change in accumulation (mitigated - baseline)
    vmax = max(float(np.max(np.abs(diff_acc))), 1e-3)
    im2 = axes[2].imshow(diff_acc, cmap="RdBu_r", vmin=-vmax, vmax=vmax)
    axes[2].set_title("Delta Accumulation (mm)")
    axes[2].set_xlabel("Col (30 m)")
    plt.colorbar(im2, ax=axes[2], fraction=0.046, pad=0.04)

    # 4. Optional Pareto budget sweep
    if pareto_rows:
        budgets_m = [r["budget_pkr"] / 1e6 for r in pareto_rows]
        red_pct = [r["pop_reduction_pct"] for r in pareto_rows]
        axes[3].plot(budgets_m, red_pct, marker="o", linewidth=2, color="#1f77b4")
        axes[3].set_title("Pareto Pop. Reduction")
        axes[3].set_xlabel("Budget (Million PKR)")
        axes[3].set_ylabel("Population Reduction (%)")
        axes[3].grid(True, alpha=0.3)

    plt.tight_layout()
    out_file = Path(out_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_file, dpi=160, bbox_inches="tight")
    plt.close(fig)
    return out_file
