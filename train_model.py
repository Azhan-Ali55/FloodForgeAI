"""Train and save the FloodForge AI Random Forest surrogate model.

Usage:
    python train_model.py
    python train_model.py --data data/real_nullah_lai --samples 1500
"""

import argparse
from pathlib import Path
import pickle
import time

from floodforge.interventions import generate_candidates
from floodforge.io import load_inputs, summarize_inputs
from floodforge.surrogate import train_surrogate


def main():
    parser = argparse.ArgumentParser(description="Train FloodForge AI surrogate model.")
    parser.add_argument("--data", type=str, default="data/real_nullah_lai", help="Path to real data folder or .npz")
    parser.add_argument("--out", type=str, default="data/trained_surrogate.pkl", help="Output pickle path")
    parser.add_argument("--budget", type=float, default=15_000_000.0, help="Max budget ceiling (PKR) for training")
    parser.add_argument("--samples", type=int, default=1000, help="Number of simulated training scenarios")
    parser.add_argument("--trees", type=int, default=20, help="Number of Random Forest trees per metric")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists() and Path(f"{args.data}.npz").exists():
        data_path = Path(f"{args.data}.npz")
    using_real = data_path.exists()
    print(f"Loading inputs from: {data_path if using_real else 'synthetic mock fallback (real data not found yet)'}")
    inputs = load_inputs(data_path if using_real else None, seed=args.seed)
    summary = summarize_inputs(inputs)
    print(
        f"Catchment summary: {summary['shape']} @ {summary['cell_size_m']:.0f}m | "
        f"Imperv mean: {summary['mean_impervious_pct']}% | "
        f"Buildings: {summary['total_buildings']} | "
        f"Facilities: {summary['facility_count']} | "
        f"Zones: {summary['equity_zones']}"
    )

    candidates = generate_candidates(inputs)
    print(f"Generated {len(candidates)} candidate interventions")

    print(f"Training Random Forest surrogate ({args.samples} samples, {args.trees} trees)...")
    t0 = time.perf_counter()
    surrogate = train_surrogate(
        inputs=inputs,
        candidates=candidates,
        budget_pkr=args.budget,
        n_samples=args.samples,
        n_trees=args.trees,
        seed=args.seed,
    )
    elapsed = time.perf_counter() - t0

    print(f"Training completed in {elapsed:.2f} s")
    print("Held-out R^2 (fidelity to simulate(), NOT real-world accuracy):")
    for metric, r2 in surrogate.r2_scores.items():
        print(f"  {metric:<25}: R^2 = {r2:.4f}")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        pickle.dump(
            {
                "surrogate": surrogate,
                "candidates": candidates,
                "trained_on_real_data": using_real,
            },
            f,
        )
    print(f"Saved trained model to {out_path}")


if __name__ == "__main__":
    main()
