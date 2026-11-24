import time
import matplotlib.pyplot as plt
import numpy as np
from floodforge.mock_data import generate_mock_inputs
from floodforge.simulation import simulate


def main():
    inputs = generate_mock_inputs(seed=42)

    # First call (includes DEM cache precomputation)
    t0 = time.perf_counter()
    res = simulate(inputs, rainfall_mm=100.0, duration_hr=3.0)
    t1 = time.perf_counter()

    # Second call (cached DEM routing)
    t2 = time.perf_counter()
    res2 = simulate(inputs, rainfall_mm=100.0, duration_hr=3.0)
    t3 = time.perf_counter()

    print(f"First simulate() call: {(t1 - t0) * 1000:.1f} ms")
    print(f"Cached simulate() call: {(t3 - t2) * 1000:.1f} ms")
    print("Baseline metrics (100 mm, 3 hr):", res2.metrics)
    print(f"Max depth: {res2.depth.max():.2f} m, Flooded cells: {res2.flooded_mask.sum()}")

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    im0 = axes[0].imshow(inputs["dem"], cmap="terrain")
    axes[0].set_title("Mock DEM (m)")
    fig.colorbar(im0, ax=axes[0], shrink=0.8, label="Elevation (m)")
    axes[0].axis("off")

    im1 = axes[1].imshow(inputs["dem"], cmap="Greys", alpha=0.4)
    masked_depth = np.ma.masked_where(~res2.flooded_mask, res2.depth)
    im2 = axes[1].imshow(masked_depth, cmap="Blues", vmin=0.15, vmax=max(1.0, float(res2.depth.max())))
    axes[1].set_title("Baseline Flood Map (100 mm / 3 hr, depth > 0.15 m)")
    fig.colorbar(im2, ax=axes[1], shrink=0.8, label="Flood Depth (m)")
    axes[1].axis("off")

    plt.tight_layout()
    plt.savefig("baseline_flood_map.png", dpi=150)
    print("Saved baseline_flood_map.png")


if __name__ == "__main__":
    main()
