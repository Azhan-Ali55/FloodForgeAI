"""Stretch goal: fast surrogate model approximating `simulate()` outputs.

IMPORTANT: Any R^2 reported by this module measures fidelity to our
simplified screening-level simulator (`simulate()`), NOT real-world flood
accuracy. Use only to pre-screen large candidate sets before re-evaluating
the top 20 portfolios with the real `simulate()` function.
"""

from dataclasses import dataclass
import numpy as np

from floodforge.interventions import Intervention
from floodforge.optimizer import DEFAULT_WEIGHTS, _sample_random_portfolio
from floodforge.simulation import simulate


class _SimpleDecisionTreeRegressor:
    """Minimal pure-NumPy CART regression tree for zero-dependency RF."""

    def __init__(self, max_depth: int = 8, min_samples_leaf: int = 5, max_features: int | None = None):
        self.max_depth = max_depth
        self.min_samples_leaf = min_samples_leaf
        self.max_features = max_features
        self.tree = None

    def fit(self, X: np.ndarray, y: np.ndarray, rng: np.random.Generator):
        self.tree = self._build(X, y, depth=0, rng=rng)
        return self

    def _build(self, X: np.ndarray, y: np.ndarray, depth: int, rng: np.random.Generator):
        n_samples, n_features = X.shape
        if depth >= self.max_depth or n_samples < 2 * self.min_samples_leaf or np.var(y) < 1e-12:
            return float(np.mean(y))

        feat_count = self.max_features or max(1, int(np.sqrt(n_features)))
        feat_indices = rng.choice(n_features, size=min(feat_count, n_features), replace=False)

        best_feat = -1
        best_thresh = 0.0
        best_score = np.inf

        for f in feat_indices:
            vals = np.unique(X[:, f])
            if vals.size <= 1:
                continue
            if vals.size > 8:
                thresholds = np.quantile(vals, np.linspace(0.15, 0.85, 7))
            else:
                thresholds = 0.5 * (vals[:-1] + vals[1:])

            for th in thresholds:
                left = X[:, f] <= th
                n_l = int(np.sum(left))
                n_r = n_samples - n_l
                if n_l < self.min_samples_leaf or n_r < self.min_samples_leaf:
                    continue
                y_l = y[left]
                y_r = y[~left]
                mse = n_l * np.var(y_l) + n_r * np.var(y_r)
                if mse < best_score:
                    best_score = mse
                    best_feat = int(f)
                    best_thresh = float(th)

        if best_feat == -1:
            return float(np.mean(y))

        left_mask = X[:, best_feat] <= best_thresh
        return (
            best_feat,
            best_thresh,
            self._build(X[left_mask], y[left_mask], depth + 1, rng),
            self._build(X[~left_mask], y[~left_mask], depth + 1, rng),
        )

    def predict(self, X: np.ndarray) -> np.ndarray:
        out = np.empty(X.shape[0], dtype=np.float64)
        for i in range(X.shape[0]):
            node = self.tree
            row = X[i]
            while isinstance(node, tuple):
                feat, thresh, left, right = node
                node = left if row[feat] <= thresh else right
            out[i] = node
        return out


@dataclass
class SurrogateModel:
    """Random Forest surrogate trained on `(rainfall, duration, portfolio) -> metrics`."""

    trees_by_metric: dict
    candidate_ids: list[str]
    r2_scores: dict[str, float]

    def _featurize(
        self,
        rainfall_mm: float,
        duration_hr: float,
        portfolios: list[list[Intervention]],
    ) -> np.ndarray:
        id_to_col = {cid: i for i, cid in enumerate(self.candidate_ids)}
        n_cands = len(self.candidate_ids)
        X = np.zeros((len(portfolios), 2 + n_cands), dtype=np.float64)
        X[:, 0] = rainfall_mm
        X[:, 1] = duration_hr
        for row_idx, p in enumerate(portfolios):
            for iv in p:
                col = id_to_col.get(iv.id)
                if col is not None:
                    X[row_idx, 2 + col] = 1.0
        return X

    def predict_metrics(
        self,
        rainfall_mm: float,
        duration_hr: float,
        portfolios: list[list[Intervention]],
    ) -> list[dict]:
        X = self._featurize(rainfall_mm, duration_hr, portfolios)
        preds = {}
        for metric_key, trees in self.trees_by_metric.items():
            tree_preds = np.mean([t.predict(X) for t in trees], axis=0)
            preds[metric_key] = tree_preds

        return [
            {k: float(preds[k][i]) for k in self.trees_by_metric}
            for i in range(len(portfolios))
        ]

    def predict_scores(
        self,
        rainfall_mm: float,
        duration_hr: float,
        portfolios: list[list[Intervention]],
        candidates: list[Intervention],
        baseline_metrics: dict,
        weights: dict | None = None,
    ) -> np.ndarray:
        w = weights or DEFAULT_WEIGHTS
        pred_list = self.predict_metrics(rainfall_mm, duration_hr, portfolios)
        scores = np.zeros(len(pred_list), dtype=np.float64)
        for i, m in enumerate(pred_list):
            w_sum = 0.0
            red = 0.0
            for k, wt in w.items():
                base_val = float(baseline_metrics.get(k, 0.0))
                if base_val > 0.0:
                    red += wt * ((base_val - m.get(k, base_val)) / base_val)
                    w_sum += wt
            scores[i] = red / w_sum if w_sum > 0.0 else 0.0
        return scores


def _r2_score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    ss_res = float(np.sum((y_true - y_pred) ** 2))
    ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
    if ss_tot < 1e-12:
        return 1.0 if ss_res < 1e-12 else 0.0
    return 1.0 - (ss_res / ss_tot)


def train_surrogate(
    inputs: dict,
    candidates: list[Intervention],
    budget_pkr: float,
    n_samples: int = 1000,
    n_trees: int = 20,
    seed: int = 42,
) -> SurrogateModel:
    """Generate synthetic training samples from `simulate()` and fit a Random Forest surrogate.

    Note: Reported `r2_scores` measure fidelity to `simulate()`, NOT real-world accuracy.
    """
    rng = np.random.default_rng(seed)
    candidate_ids = [c.id for c in candidates]
    n_cands = len(candidates)

    X = np.zeros((n_samples, 2 + n_cands), dtype=np.float64)
    metric_keys = [
        "exposed_area_km2",
        "buildings_exposed",
        "population_exposed",
        "road_segments_exposed",
        "facilities_exposed",
    ]
    Y = {k: np.zeros(n_samples, dtype=np.float64) for k in metric_keys}

    for i in range(n_samples):
        rain = float(rng.uniform(50.0, 160.0))
        dur = float(rng.uniform(1.0, 6.0))
        portfolio = _sample_random_portfolio(candidates, budget_pkr, rng)
        res = simulate(inputs, rainfall_mm=rain, duration_hr=dur, interventions=portfolio)

        X[i, 0] = rain
        X[i, 1] = dur
        id_to_col = {cid: idx for idx, cid in enumerate(candidate_ids)}
        for iv in portfolio:
            X[i, 2 + id_to_col[iv.id]] = 1.0
        for k in metric_keys:
            Y[k][i] = float(res.metrics[k])

    split = int(0.8 * n_samples)
    X_train, X_test = X[:split], X[split:]

    trees_by_metric = {}
    r2_scores = {}

    for k in metric_keys:
        y_train, y_test = Y[k][:split], Y[k][split:]
        trees = []
        for _ in range(n_trees):
            boot_idx = rng.integers(0, split, size=split)
            tree = _SimpleDecisionTreeRegressor(max_depth=8, min_samples_leaf=5)
            tree.fit(X_train[boot_idx], y_train[boot_idx], rng)
            trees.append(tree)
        trees_by_metric[k] = trees
        y_pred = np.mean([t.predict(X_test) for t in trees], axis=0)
        r2_scores[k] = round(_r2_score(y_test, y_pred), 4)

    return SurrogateModel(
        trees_by_metric=trees_by_metric,
        candidate_ids=candidate_ids,
        r2_scores=r2_scores,
    )
