"""Configurable 5-tier risk classification and safe-zone support for Mode A.

IMPORTANT: FloodForge AI is a screening-level decision-support prototype,
NOT an authorized public warning system. Numeric river-stage thresholds are
deliberately excluded pending PMD gauge calibration, and Emergency-tier
directives belong solely to authorized agencies (PMD, NDMA, PDMA).
"""

from dataclasses import dataclass
import numpy as np


NON_EVACUATION_CAVEAT = (
    "Screening-level NWP/D8 decision support only — NOT an official flood "
    "warning or evacuation order. Verify against live PMD gauges and NDMA/PDMA bulletins."
)

# Configurable screening thresholds (modeled exposed area km2 & population)
DEFAULT_ALERT_THRESHOLDS = {
    "advisory_area_km2": 0.15,
    "watch_area_km2": 0.50,
    "warning_area_km2": 1.20,
    "advisory_pop": 500.0,
    "watch_pop": 3000.0,
    "warning_pop": 8000.0,
}


@dataclass
class AlertAssessment:
    """5-tier screening risk assessment for a single simulation scenario."""

    tier: str  # Normal, Advisory, Watch, Warning (Emergency reserved for agencies)
    decision_action: str
    authority_boundary: str
    uncertainty_note: str
    caveat: str
    vulnerable_zones: list[dict]
    safe_facilities: list[dict]
    safe_area_pct: float


def classify_risk_tier(
    metrics: dict,
    thresholds: dict | None = None,
    official_emergency_confirmed: bool = False,
) -> tuple[str, str, str]:
    """Classify modeled exposure into the 5-tier framework."""
    if official_emergency_confirmed:
        return (
            "Emergency",
            "Issued solely through authorized PMD, NDMA, PDMA, and district procedures.",
            "Authorized agencies only",
        )

    th = {**DEFAULT_ALERT_THRESHOLDS, **(thresholds or {})}
    area = float(metrics.get("exposed_area_km2", 0.0))
    pop = float(metrics.get("population_exposed", 0.0))

    if area >= th["warning_area_km2"] or pop >= th["warning_pop"]:
        return (
            "Warning",
            "Cross-verify with PMD gauges/bulletins; activate preparedness checklists.",
            "Official assessment",
        )
    if area >= th["watch_area_km2"] or pop >= th["watch_pop"]:
        return (
            "Watch",
            "Review exposed roads/facilities; place WASA & Rescue 1122 on standby.",
            "Inter-agency alert",
        )
    if area >= th["advisory_area_km2"] or pop >= th["advisory_pop"]:
        return (
            "Advisory",
            "Inspect drainage bottlenecks and dewatering pump readiness.",
            "Technical advisory",
        )
    return (
        "Normal",
        "Standard automated forecast polling and archive logging.",
        "Internal monitoring",
    )


def identify_vulnerable_zones(inputs: dict, sim_result) -> list[dict]:
    """Rank neighborhood zones by modeled flooded area and exposed population."""
    zones = inputs["zones"]
    mask = sim_result.flooded_mask
    cell_size_m = float(inputs.get("cell_size_m", 30.0))
    cell_area_km2 = (cell_size_m * cell_size_m) / 1_000_000.0

    rows = []
    for z in sorted(int(v) for v in np.unique(zones) if v > 0):
        z_mask = zones == z
        flooded_in_z = mask & z_mask
        rows.append(
            {
                "zone": z,
                "flooded_area_km2": round(float(np.sum(flooded_in_z) * cell_area_km2), 4),
                "population_exposed": round(
                    float(np.sum(np.maximum(0.0, np.nan_to_num(inputs["population"][flooded_in_z], nan=0.0)))), 1
                ),
                "buildings_exposed": int(
                    np.sum(np.maximum(0, np.nan_to_num(inputs["buildings"][flooded_in_z], nan=0)))
                ),
                "max_depth_m": round(float(np.nanmax(sim_result.depth[z_mask])), 2),
                "mean_imperviousness": round(
                    float(np.nanmean(inputs["landcover_imperviousness"][z_mask])), 2
                ),
            }
        )

    rows.sort(key=lambda r: (-r["population_exposed"], -r["flooded_area_km2"]))
    return rows


def find_safe_zones(inputs: dict, sim_result, safety_margin_m: float = 0.05) -> tuple[list[dict], float]:
    """Identify unflooded public facilities and % of catchment remaining safe."""
    mask = sim_result.flooded_mask
    depth = sim_result.depth
    dem = inputs["dem"]
    zones = inputs["zones"]
    rows, cols = mask.shape

    safe_pct = float(100.0 * np.mean(~mask))
    safe_facilities = []

    fac_data = inputs.get("facilities", [])
    if isinstance(fac_data, np.ndarray) and fac_data.ndim == 2:
        fac_iter = [(int(r), int(c), "critical_facility") for r, c in np.argwhere(np.nan_to_num(fac_data, nan=0) > 0)]
    else:
        fac_iter = fac_data

    for fac in fac_iter:
        r, c, f_type = int(fac[0]), int(fac[1]), str(fac[2])
        if 0 <= r < rows and 0 <= c < cols:
            is_safe = bool((not mask[r, c]) and (depth[r, c] <= safety_margin_m))
            if is_safe:
                safe_facilities.append(
                    {
                        "type": f_type,
                        "row": r,
                        "col": c,
                        "zone": int(zones[r, c]),
                        "elevation_m": round(float(dem[r, c]), 1),
                        "modeled_depth_m": round(float(depth[r, c]), 3),
                    }
                )

    safe_facilities.sort(key=lambda f: -f["elevation_m"])
    return safe_facilities, round(safe_pct, 2)


def assess_alert(
    inputs: dict,
    sim_result,
    is_hypothetical: bool = False,
    is_stale: bool = False,
    thresholds: dict | None = None,
    official_emergency_confirmed: bool = False,
) -> AlertAssessment:
    """Build complete Mode A alert assessment including safe zones and caveats."""
    tier, action, boundary = classify_risk_tier(
        sim_result.metrics,
        thresholds=thresholds,
        official_emergency_confirmed=official_emergency_confirmed,
    )
    vulnerable = identify_vulnerable_zones(inputs, sim_result)
    safe_facs, safe_pct = find_safe_zones(inputs, sim_result)

    notes = []
    if is_hypothetical:
        notes.append("HYPOTHETICAL STRESS-TEST SCENARIO (not an actual weather forecast).")
    if is_stale:
        notes.append("Using cached weather forecast; live Open-Meteo feed unavailable.")
    if not notes:
        notes.append("Coarse 30 m D8 screening + 9-25 km NWP grid; localized cloudbursts carry uncertainty.")

    return AlertAssessment(
        tier=tier,
        decision_action=action,
        authority_boundary=boundary,
        uncertainty_note=" ".join(notes),
        caveat=NON_EVACUATION_CAVEAT,
        vulnerable_zones=vulnerable,
        safe_facilities=safe_facs,
        safe_area_pct=safe_pct,
    )
