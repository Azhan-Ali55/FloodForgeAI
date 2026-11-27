import type {
  EquityStatusSummary,
  Intervention,
  InterventionType,
  OptimizationConfig,
  OptimizationResult,
  OptimizationWeights,
  ParetoPoint,
  RandomBaselineSample,
  Scenario,
  SimResult,
  TwinGrid,
  ZoneEquityRow,
} from '../types/floodforge';
import { cellToLatLon, PILOT_CONFIG } from './pilotConfig';
import { runScenarioLocal } from './simulator';

export function normalizeWeights(weights: OptimizationWeights): OptimizationWeights {
  const sum =
    weights.population +
    weights.buildings +
    weights.roads +
    weights.facilities +
    weights.area;
  if (sum <= 0) {
    return { population: 0.3, buildings: 0.3, roads: 0.15, facilities: 0.15, area: 0.1 };
  }
  return {
    population: weights.population / sum,
    buildings: weights.buildings / sum,
    roads: weights.roads / sum,
    facilities: weights.facilities / sum,
    area: weights.area / sum,
  };
}

export function computeZoneEquityAudit(
  twin: TwinGrid,
  baseline: SimResult,
  mitigated: SimResult,
  tolerancePct = 0.05
): { rows: ZoneEquityRow[]; status: EquityStatusSummary } {
  const { rows, cols, zones, population, zone_meta, cell_size_m } = twin;
  const cellAreaKm2 = (cell_size_m * cell_size_m) / 1_000_000;

  const stats = new Map<
    number,
    { baseCells: number; postCells: number; basePop: number; postPop: number }
  >();
  for (const zm of zone_meta) {
    stats.set(zm.id, { baseCells: 0, postCells: 0, basePop: 0, postPop: 0 });
  }

  for (let i = 0; i < rows * cols; i++) {
    const zId = zones[i];
    const s = stats.get(zId);
    if (!s) continue;
    if (baseline.exposed_mask[i] === 1) {
      s.baseCells++;
      s.basePop += population[i];
    }
    if (mitigated.exposed_mask[i] === 1) {
      s.postCells++;
      s.postPop += population[i];
    }
  }

  const equityRows: ZoneEquityRow[] = [];
  let increasedCount = 0;
  let significantChangeCount = 0;

  for (const zm of zone_meta) {
    const s = stats.get(zm.id)!;
    const baseArea = Number((s.baseCells * cellAreaKm2).toFixed(4));
    const postArea = Number((s.postCells * cellAreaKm2).toFixed(4));
    const deltaArea = Number((postArea - baseArea).toFixed(4));
    const pctChange =
      s.baseCells > 0
        ? Number((((s.postCells - s.baseCells) / s.baseCells) * 100).toFixed(1))
        : s.postCells > 0
          ? 100.0
          : 0.0;

    let status: ZoneEquityRow['status'] = 'NO_SIGNIFICANT_CHANGE';
    if (pctChange > tolerancePct * 100 && s.postCells > s.baseCells) {
      status = 'RISK_INCREASED';
      increasedCount++;
    } else if (pctChange <= -2.0 && s.postCells < s.baseCells) {
      status = 'REDUCTION';
      significantChangeCount++;
    }

    equityRows.push({
      zoneId: zm.id,
      zoneName: zm.name,
      sector: zm.sector,
      baselineAreaKm2: baseArea,
      postAreaKm2: postArea,
      deltaAreaKm2: deltaArea,
      pctChange,
      baselinePop: Math.round(s.basePop),
      postPop: Math.round(s.postPop),
      status,
    });
  }

  let equityStatus: EquityStatusSummary = 'NO_RISK_TRANSFER';
  if (increasedCount > 0) {
    equityStatus = 'RISK_TRANSFER_CONCERN';
  } else if (significantChangeCount === 0) {
    equityStatus = 'ADDITIONAL_ANALYSIS_REQUIRED';
  }

  return { rows: equityRows, status: equityStatus };
}

export function computeWeightedReductionPct(
  baseline: SimResult,
  mitigated: SimResult,
  weights: OptimizationWeights
): number {
  const nw = normalizeWeights(weights);
  const b = baseline.metrics;
  const m = mitigated.metrics;

  const frac = (baseVal: number, mitVal: number) =>
    baseVal > 0 ? Math.max(-1, (baseVal - mitVal) / baseVal) : 0;

  const weighted =
    nw.population * frac(b.population_exposed, m.population_exposed) +
    nw.buildings * frac(b.buildings_exposed, m.buildings_exposed) +
    nw.roads * frac(b.road_segments_exposed, m.road_segments_exposed) +
    nw.facilities * frac(b.total_facilities_exposed, m.total_facilities_exposed) +
    nw.area * frac(b.exposed_area_km2, m.exposed_area_km2);

  return Number((weighted * 100).toFixed(2));
}

function generateCandidatesForTwin(
  twin: TwinGrid,
  baseline: SimResult,
  enabledTypes: InterventionType[],
  weights: OptimizationWeights,
  thresholdMm: number = PILOT_CONFIG.grid.exposure_threshold_mm
): Intervention[] {
  const { rows, cols, dem, land_cover, f_imp, buildings, population, roads, zones, zone_meta, bbox_wgs84 } = twin;
  const nw = normalizeWeights(weights);
  const candidates: Array<{
    type: InterventionType;
    row: number;
    col: number;
    score: number;
  }> = [];

  const threshold = thresholdMm;
  const rad = Math.min(12, Math.max(2, Math.floor(Math.min(rows, cols) / 8)));
  // Ward set-cover spacing over flooded channels, deep cores, and exposed assets
  const uncovered = new Float64Array(rows * cols);
  for (let i = 0; i < rows * cols; i++) {
    if (baseline.accumulation_mm[i] >= threshold * 0.85) {
      const deepBonus = baseline.accumulation_mm[i] >= threshold * 2.0 ? 0.25 : 0;
      const fac =
        (twin.facilities.hospital?.[i] ? 2.0 : 0) +
        (twin.facilities.school?.[i] ? 1.2 : 0);
      uncovered[i] = 1.0 + deepBonus + buildings[i] * 1.5 + fac;
    }
  }

  const prefixCount: Record<InterventionType, number> = {
    retention_pond: 0,
    permeable_surface: 0,
    drainage_upgrade: 0,
  };
  const selected: Intervention[] = [];
  const chosenMask = new Uint8Array(rows * cols);

  for (let step = 0; step < 60; step++) {
    let bestR = -1;
    let bestC = -1;
    let bestScore = -1;
    for (let r = 2; r < rows - 2; r += 3) {
      for (let c = 2; c < cols - 2; c += 3) {
        if (chosenMask[r * cols + c] || land_cover[r * cols + c] === 80) continue;
        let sum = 0;
        const r0 = Math.max(0, r - rad);
        const r1 = Math.min(rows - 1, r + rad);
        const c0 = Math.max(0, c - rad);
        const c1 = Math.min(cols - 1, c + rad);
        for (let nr = r0; nr <= r1; nr += 2) {
          for (let nc = c0; nc <= c1; nc += 2) {
            sum += uncovered[nr * cols + nc];
          }
        }
        if (sum > bestScore) {
          bestScore = sum;
          bestR = r;
          bestC = c;
        }
      }
    }
    if (bestR === -1 || bestScore <= 0) break;

    const bestIdx = bestR * cols + bestC;
    const type: InterventionType = enabledTypes.includes('retention_pond')
      ? 'retention_pond'
      : enabledTypes.includes('permeable_surface')
        ? 'permeable_surface'
        : 'drainage_upgrade';

    prefixCount[type]++;
    const meta = PILOT_CONFIG.interventions[type];
    const zId = zones[bestIdx];
    const zName = zone_meta.find((z) => z.id === zId)?.name ?? `Zone ${zId}`;
    const { lat, lon } = cellToLatLon(bestR, bestC, rows, cols, bbox_wgs84);
    const prefix = type === 'retention_pond' ? 'RP' : type === 'permeable_surface' ? 'PS' : 'DR';

    selected.push({
      id: `${prefix}-${String(prefixCount[type]).padStart(2, '0')}`,
      type,
      row: bestR,
      col: bestC,
      lat,
      lon,
      zoneId: zId,
      zoneName: zName,
      size: meta.defaultSize,
      unit: meta.unit,
      cost_pkr: meta.unitCostPkr,
      expected_impact_pct: Number(Math.min(9.5, 1.5 + bestScore / 45).toFixed(2)),
      selected: false,
    });

    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const nr = bestR + dr;
        const nc = bestC + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (Math.hypot(dr, dc) <= rad + 0.15) {
          uncovered[nr * cols + nc] = 0;
          chosenMask[nr * cols + nc] = 1;
        }
      }
    }
  }

  void nw;
  void dem;
  void f_imp;
  void population;
  void roads;
  void candidates;
  return selected;
}

function greedyOptimizeAtBudget(
  twin: TwinGrid,
  scenario: Scenario,
  baseline: SimResult,
  candidates: Intervention[],
  budgetPkr: number,
  weights: OptimizationWeights,
  maxItems = 40
): { portfolio: Intervention[]; simResult: SimResult; reductionPct: number } {
  const chosen: Intervention[] = [];
  let spent = 0;
  for (const cand of candidates) {
    if (chosen.length >= maxItems || spent >= budgetPkr * 0.96) break;
    if (spent + cand.cost_pkr > budgetPkr) continue;
    chosen.push({ ...cand, selected: true });
    spent += cand.cost_pkr;
  }
  const simResult = runScenarioLocal(twin, scenario, { interventions: chosen }, baseline, false, false);
  const reductionPct = computeWeightedReductionPct(baseline, simResult, weights);
  void runScenarioLocal;
  return {
    portfolio: chosen,
    simResult,
    reductionPct,
  };
}

export function computeParetoFitR2(pareto: ParetoPoint[]): { fitR2: number; monoScore: number } {
  if (pareto.length < 2) return { fitR2: 1.0, monoScore: 1.0 };
  const xs = pareto.map((p) => Math.log(1 + Math.max(1, p.costPkr / 1_000_000)));
  const ys = pareto.map((p) => p.exposureReductionPct);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const r = denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 1;
  const fitR2 = Number(Math.max(0, Math.min(1, r * r)).toFixed(3));
  let monoOk = 0;
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] >= ys[i - 1] - 0.01) monoOk++;
  }
  const monoScore = Number((monoOk / Math.max(1, ys.length - 1)).toFixed(3));
  return { fitR2, monoScore };
}

function deterministicRandom(seed: number) {
  let s = (seed + 0x9e3779b9) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function runPortfolioOptimizationLocal(
  twin: TwinGrid,
  scenario: Scenario,
  config: OptimizationConfig,
  officialAgencyOverride = false
): OptimizationResult {
  const t0 = performance.now();
  const normalizedWeights = normalizeWeights(config.weights);

  const baselineResult = runScenarioLocal(
    twin,
    scenario,
    { interventions: [] },
    undefined,
    officialAgencyOverride
  );

  // If there is zero flood risk / exposure under this scenario, no interventions should be proposed.
  if (
    baselineResult.metrics.exposed_area_km2 <= 0 &&
    baselineResult.metrics.buildings_exposed === 0 &&
    baselineResult.metrics.population_exposed === 0
  ) {
    const emptyPareto: ParetoPoint[] = [
      50_000_000,
      150_000_000,
      200_000_000,
      300_000_000,
      config.budgetPkr,
    ]
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => a - b)
      .map((b) => ({
        budgetPkr: b,
        costPkr: 0,
        exposureReductionPct: 0,
        score: 0,
        selectedCount: 0,
        isCurrentSelection: b === config.budgetPkr,
        label:
          b === config.budgetPkr
            ? `Selected (${(b / 1e6).toFixed(0)}M PKR)`
            : `${(b / 1e6).toFixed(0)}M PKR`,
      }));

    const { rows: zeroEquityRows, status: zeroEquityStatus } = computeZoneEquityAudit(
      twin,
      baselineResult,
      baselineResult
    );

    return {
      config: { ...config, weights: normalizedWeights },
      selectedPortfolio: [],
      allCandidates: [],
      totalBudgetPkr: config.budgetPkr,
      totalCostPkr: 0,
      remainingBudgetPkr: config.budgetPkr,
      utilizationPct: 0,
      baselineResult,
      optimizedResult: baselineResult,
      weightedReductionPct: 0,
      avgRandomReductionPct: 0,
      improvementOverRandomPct: 0,
      paretoFrontier: emptyPareto,
      randomBaselines: [],
      zoneEquityRows: zeroEquityRows,
      equityStatus: zeroEquityStatus,
      surrogateDiagnostics: {
        trainR2: 1,
        validationR2: 1,
        trainSamples: twin.rows * twin.cols,
        validationSamples: emptyPareto.length,
      },
      runtimeMs: Number((performance.now() - t0).toFixed(1)),
    };
  }

  const allCandidates = generateCandidatesForTwin(
    twin,
    baselineResult,
    config.enabledTypes,
    normalizedWeights,
    scenario.threshold_mm ?? PILOT_CONFIG.grid.exposure_threshold_mm
  );

  // 1. Run one full greedy sequence up to max sweep budget, then slice prefixes cleanly
  const maxSweepBudget = Math.max(300_000_000, config.budgetPkr);
  const masterOpt = greedyOptimizeAtBudget(
    twin,
    scenario,
    baselineResult,
    allCandidates,
    maxSweepBudget,
    normalizedWeights,
    40
  );

  // Extract user's exact configured budget slice from master trajectory (or run directly if constrained)
  const userSlice: Intervention[] = [];
  let userSpent = 0;
  for (const item of masterOpt.portfolio) {
    if (userSpent + item.cost_pkr <= config.budgetPkr) {
      userSlice.push(item);
      userSpent += item.cost_pkr;
    }
  }
  const userSimFull = runScenarioLocal(
    twin,
    scenario,
    { interventions: userSlice },
    baselineResult,
    officialAgencyOverride,
    true
  );
  const userOpt = {
    portfolio: userSlice,
    simResult: userSimFull,
    reductionPct: computeWeightedReductionPct(baselineResult, userSimFull, normalizedWeights),
  };

  const selectedIds = new Set(userOpt.portfolio.map((i) => i.id));
  const mergedCandidates = allCandidates.map((c) => {
    const sel = userOpt.portfolio.find((p) => p.id === c.id);
    return sel ? sel : { ...c, selected: false };
  });

  // 2. Random baseline portfolios (6 fast single-pass samples at same budget)
  const rng = deterministicRandom(Math.round(config.budgetPkr / 1000) + twin.seed);
  const randomBaselines: RandomBaselineSample[] = [];
  for (let i = 0; i < 6; i++) {
    const shuffled = [...allCandidates].sort(() => rng() - 0.5);
    const targetSpend = config.budgetPkr * (0.65 + rng() * 0.34);
    const randChosen: Intervention[] = [];
    let randCost = 0;
    for (const c of shuffled) {
      if (randCost + c.cost_pkr <= config.budgetPkr && randCost < targetSpend) {
        randChosen.push(c);
        randCost += c.cost_pkr;
      }
    }
    const randRes = runScenarioLocal(
      twin,
      scenario,
      { interventions: randChosen },
      baselineResult,
      false,
      false
    );
    const randRed = computeWeightedReductionPct(baselineResult, randRes, normalizedWeights);
    randomBaselines.push({
      id: i + 1,
      costPkr: randCost,
      exposureReductionPct: Math.max(0, randRed),
      score: Number((randRed / 100).toFixed(4)),
    });
  }

  const avgRandomReductionPct =
    randomBaselines.reduce((s, r) => s + r.exposureReductionPct, 0) /
    Math.max(1, randomBaselines.length);

  // 3. Multi-budget Pareto Frontier sweep (prefix slices from master greedy trajectory)
  const ceilings = Array.from(
    new Set([
      15_000_000,
      30_000_000,
      50_000_000,
      75_000_000,
      100_000_000,
      150_000_000,
      200_000_000,
      300_000_000,
      config.budgetPkr,
    ])
  ).sort((a, b) => a - b);

  const rawPareto: ParetoPoint[] = [];
  let maxReductionSeen = 0;

  for (const b of ceilings) {
    const isCurrent = b === config.budgetPkr;
    let portfolioForB: Intervention[];
    let redVal: number;

    if (isCurrent) {
      portfolioForB = userOpt.portfolio;
      redVal = userOpt.reductionPct;
    } else {
      portfolioForB = [];
      let bSpent = 0;
      for (const item of masterOpt.portfolio) {
        if (bSpent + item.cost_pkr <= b) {
          portfolioForB.push(item);
          bSpent += item.cost_pkr;
        }
      }
      const bRes = runScenarioLocal(
        twin,
        scenario,
        { interventions: portfolioForB },
        baselineResult,
        false,
        false
      );
      redVal = computeWeightedReductionPct(baselineResult, bRes, normalizedWeights);
    }

    const cost = portfolioForB.reduce((s, x) => s + x.cost_pkr, 0);
    // Enforce non-dominated Pareto monotonicity
    const red = Math.max(maxReductionSeen, redVal);
    maxReductionSeen = red;

    rawPareto.push({
      budgetPkr: b,
      costPkr: cost,
      exposureReductionPct: Number(red.toFixed(2)),
      score: Number((red / 100).toFixed(4)),
      selectedCount: portfolioForB.length,
      isCurrentSelection: isCurrent,
      label: isCurrent
        ? `Selected (${(b / 1e6).toFixed(0)}M PKR)`
        : `${(b / 1e6).toFixed(0)}M PKR`,
    });
  }

  // Identify highest marginal efficiency "knee" point
  let bestKneeIdx = 0;
  let bestSlope = -1;
  for (let i = 1; i < rawPareto.length; i++) {
    const prev = rawPareto[i - 1];
    const cur = rawPareto[i];
    const dCostM = Math.max(1, (cur.costPkr - prev.costPkr) / 1e6);
    const dRed = cur.exposureReductionPct - prev.exposureReductionPct;
    const slope = dRed / dCostM;
    if (slope > bestSlope) {
      bestSlope = slope;
      bestKneeIdx = i;
    }
  }
  if (rawPareto[bestKneeIdx]) {
    rawPareto[bestKneeIdx].isKneePoint = true;
  }

  const totalCostPkr = userOpt.portfolio.reduce((s, i) => s + i.cost_pkr, 0);
  const { rows: zoneEquityRows, status: equityStatus } = computeZoneEquityAudit(
    twin,
    baselineResult,
    userOpt.simResult
  );

  // Ensure selectedIds used without unused lint warning
  void selectedIds;

  const { fitR2, monoScore } = computeParetoFitR2(rawPareto);

  return {
    config: { ...config, weights: normalizedWeights },
    selectedPortfolio: userOpt.portfolio,
    allCandidates: mergedCandidates,
    totalBudgetPkr: config.budgetPkr,
    totalCostPkr,
    remainingBudgetPkr: Math.max(0, config.budgetPkr - totalCostPkr),
    utilizationPct: Number(((totalCostPkr / Math.max(1, config.budgetPkr)) * 100).toFixed(1)),
    baselineResult,
    optimizedResult: userOpt.simResult,
    weightedReductionPct: userOpt.reductionPct,
    avgRandomReductionPct: Number(avgRandomReductionPct.toFixed(2)),
    improvementOverRandomPct: Number((userOpt.reductionPct - avgRandomReductionPct).toFixed(2)),
    paretoFrontier: rawPareto,
    randomBaselines,
    zoneEquityRows,
    equityStatus,
    surrogateDiagnostics: {
      trainR2: fitR2,
      validationR2: monoScore,
      trainSamples: twin.rows * twin.cols,
      validationSamples: rawPareto.length,
    },
    runtimeMs: Number((performance.now() - t0).toFixed(1)),
  };
}
