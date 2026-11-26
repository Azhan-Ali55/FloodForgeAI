"""Random Forest surrogate model for fast candidate portfolio pre-screening."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score
from sklearn.model_selection import train_test_split

from .config import Config, load_config
from .interventions import build_budget_portfolio, generate_candidate_interventions
from .schemas import InterventionType, Portfolio, Scenario, TwinGrid
from .simulation import ScreeningSimulator

TARGET_NAMES = [
    "exposed_area_km2",
    "buildings_exposed",
    "population_exposed",
    "road_cells_exposed",
]


def extract_features(scenario: Scenario, portfolio: Portfolio) -> np.ndarray:
    items = portfolio.interventions
    total_storage = sum(x.size for x in items if x.type == InterventionType.STORAGE)
    total_perm = sum(x.size for x in items if x.type == InterventionType.PERMEABLE_SURFACE)
    total_drain = sum(x.size for x in items if x.type == InterventionType.DRAINAGE)
    return np.array(
        [
            scenario.rainfall_mm_per_hr,
            scenario.duration_hr,
            scenario.total_rainfall_mm,
            scenario.budget_pkr,
            portfolio.total_cost_pkr,
            float(len(items)),
            total_storage,
            total_perm,
            total_drain,
        ],
        dtype=float,
    )


@dataclass
class SurrogateBundle:
    model: RandomForestRegressor
    r2_scores: dict[str, float]
    targets: list[str]

    def predict_metrics(self, scenario: Scenario, portfolios: list[Portfolio]) -> np.ndarray:
        if not portfolios:
            return np.zeros((0, len(TARGET_NAMES)), dtype=float)
        X = np.vstack([extract_features(scenario, p) for p in portfolios])
        return self.model.predict(X)

    def save(self, path: str | Path) -> Path:
        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {"model": self.model, "r2_scores": self.r2_scores, "targets": self.targets},
            out,
        )
        return out

    @classmethod
    def load(cls, path: str | Path) -> "SurrogateBundle":
        payload = joblib.load(Path(path))
        return cls(
            model=payload["model"],
            r2_scores=payload.get("r2_scores", {}),
            targets=payload.get("targets", TARGET_NAMES),
        )


def train_surrogate(
    twin: TwinGrid,
    cfg: Config | None = None,
    simulator: ScreeningSimulator | None = None,
    n_samples: int = 300,
    n_estimators: int = 120,
    seed: int = 42,
) -> SurrogateBundle:
    cfg = cfg or load_config()
    sim = simulator or ScreeningSimulator(cfg=cfg)
    rng = np.random.default_rng(seed)

    base_sc = Scenario(
        rainfall_mm_per_hr=float(cfg.raw["scenario_limits"]["rainfall_mm_per_hr"]["default"]),
        duration_hr=float(cfg.raw["scenario_limits"]["duration_hr"]["default"]),
        budget_pkr=float(cfg.raw["scenario_limits"]["budget_pkr"]["default"]),
    )
    base_res = sim.run_scenario(twin, base_sc, Portfolio([]))
    candidates = generate_candidate_interventions(
        twin, cfg=cfg, n_candidates=150, hotspot_mask=base_res.exposed_mask, seed=seed
    )

    lim = cfg.raw["scenario_limits"]
    X_rows, Y_rows = [], []

    for _ in range(n_samples):
        rain = float(rng.uniform(lim["rainfall_mm_per_hr"]["min"], lim["rainfall_mm_per_hr"]["max"]))
        dur = float(rng.uniform(lim["duration_hr"]["min"], lim["duration_hr"]["max"]))
        budget = float(rng.uniform(lim["budget_pkr"]["min"], lim["budget_pkr"]["max"]))
        sc = Scenario(rainfall_mm_per_hr=rain, duration_hr=dur, budget_pkr=budget)
        port = build_budget_portfolio(candidates, budget_pkr=budget, rng=rng, max_items=10)
        res = sim.run_scenario(twin, sc, port)

        X_rows.append(extract_features(sc, port))
        Y_rows.append(
            [
                res.metrics.exposed_area_km2,
                float(res.metrics.buildings_exposed),
                res.metrics.population_exposed,
                float(res.metrics.road_cells_exposed),
            ]
        )

    X = np.vstack(X_rows)
    Y = np.vstack(Y_rows)
    X_train, X_test, y_train, y_test = train_test_split(X, Y, test_size=0.2, random_state=seed)

    model = RandomForestRegressor(n_estimators=n_estimators, random_state=seed, n_jobs=-1)
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    r2_scores = {
        name: float(r2_score(y_test[:, idx], preds[:, idx]))
        for idx, name in enumerate(TARGET_NAMES)
    }
    return SurrogateBundle(model=model, r2_scores=r2_scores, targets=TARGET_NAMES)
