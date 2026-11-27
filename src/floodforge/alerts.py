"""Configurable 5-tier alert classifier for Mode A decision support."""
from __future__ import annotations

from dataclasses import dataclass
from .schemas import SimResult


@dataclass
class AlertAssessment:
    tier: str
    authority_note: str
    uncertainty_note: str
    exposed_population: float
    exposed_buildings: int
    exposed_area_km2: float


TIER_AUTHORITY = {
    "Normal": "Internal monitoring only.",
    "Advisory": "Technical advisory; inspect drainage bottlenecks and pump readiness.",
    "Watch": "Inter-agency alert; review exposed roads/facilities and place WASA & Rescue 1122 on standby.",
    "Warning": "Official hydrological review required; cross-verify with PMD gauges/bulletins.",
    "Emergency": "Authorized agencies only (PMD, NDMA, PDMA, district administration); no automated evacuation directives.",
}


def classify_alert(
    sim_result: SimResult,
    max_precip_prob_pct: float = 50.0,
    is_hypothetical_demo: bool = False,
    official_gauge_confirmed: bool = False,
) -> AlertAssessment:
    m = sim_result.metrics
    pop = float(m.population_exposed)
    bldgs = int(m.buildings_exposed)
    area = float(m.exposed_area_km2)

    if official_gauge_confirmed and (pop >= 2500.0 or bldgs >= 400):
        tier = "Emergency"
    elif pop >= 1500.0 or bldgs >= 250 or area >= 0.8:
        tier = "Warning"
    elif pop >= 400.0 or bldgs >= 75 or area >= 0.25:
        tier = "Watch"
    elif pop > 0.0 or bldgs > 0 or max_precip_prob_pct >= 50.0:
        tier = "Advisory"
    else:
        tier = "Normal"

    prefix = "[HYPOTHETICAL DEMO MODE] " if is_hypothetical_demo else "[SCREENING MODE A] "
    uncertainty = (
        f"{prefix}30 m D8 screening estimate (max rain prob {max_precip_prob_pct:.0f}%); "
        "subject to NWP grid smoothing and uncalibrated Tier 1 limitations."
    )
    return AlertAssessment(
        tier=tier,
        authority_note=TIER_AUTHORITY[tier],
        uncertainty_note=uncertainty,
        exposed_population=pop,
        exposed_buildings=bldgs,
        exposed_area_km2=area,
    )
