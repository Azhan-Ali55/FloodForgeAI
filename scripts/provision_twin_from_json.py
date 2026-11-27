"""Reconstruct data/processed/clipped/*.npy from tracked frontend/public/real_twin_200x200.json.

Use on clean Git clones or container builds where gitignored .npy binaries are absent.
Does not invent data; writes exact arrays serialized in frontend/public/real_twin_200x200.json.
"""
from __future__ import annotations

import json
from pathlib import Path
import numpy as np


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    src_json = repo / "frontend" / "public" / "real_twin_200x200.json"
    out_dir = repo / "data" / "processed" / "clipped"
    if not src_json.exists():
        raise FileNotFoundError(f"Source twin JSON not found: {src_json}")

    payload = json.loads(src_json.read_text(encoding="utf-8"))
    rows, cols = int(payload["rows"]), int(payload["cols"])
    shape = (rows, cols)

    out_dir.mkdir(parents=True, exist_ok=True)
    np.save(out_dir / "dem_filled.npy", np.asarray(payload["dem"], dtype=np.float32).reshape(shape))
    np.save(out_dir / "f_imp.npy", np.asarray(payload["f_imp"], dtype=np.float32).reshape(shape))
    np.save(out_dir / "population.npy", np.asarray(payload["population"], dtype=np.float32).reshape(shape))
    np.save(out_dir / "buildings.npy", np.asarray(payload["buildings"], dtype=np.uint8).reshape(shape))
    np.save(out_dir / "roads.npy", np.asarray(payload["roads"], dtype=np.uint8).reshape(shape))
    np.save(out_dir / "zones_adm3.npy", np.asarray(payload["zones"], dtype=np.uint8).reshape(shape))

    facilities = payload.get("facilities") or {}
    if "hospital" in facilities:
        np.save(
            out_dir / "facilities_hospital.npy",
            np.asarray(facilities["hospital"], dtype=np.uint8).reshape(shape),
        )
    if "school" in facilities:
        np.save(
            out_dir / "facilities_school.npy",
            np.asarray(facilities["school"], dtype=np.uint8).reshape(shape),
        )

    meta_file = out_dir / "metadata.json"
    if not meta_file.exists() and isinstance(payload.get("metadata"), dict):
        meta_file.write_text(json.dumps(payload["metadata"], indent=2), encoding="utf-8")

    print(f"Provisioned clipped twin rasters ({rows}x{cols}) into {out_dir}")


if __name__ == "__main__":
    main()
