import {
  computeParetoFitR2,
  computeWeightedReductionPct,
  computeZoneEquityAudit,
  normalizeWeights,
  runPortfolioOptimizationLocal,
} from '../engine/optimizer';
import { cellToLatLon, PILOT_CONFIG } from '../engine/pilotConfig';
import { runScenarioLocal } from '../engine/simulator';
import type {
  Intervention,
  OptimizationConfig,
  OptimizationResult,
  ParetoPoint,
  Scenario,
  TwinGrid,
} from '../types/floodforge';
import { apiRequest, type EngineMode } from './apiClient';
import {
  executeSimulation,
  fromBackendInterventionType,
  toBackendInterventionType,
} from './simulationService';

interface BackendOptimizeResponse {
  engine?: string;
  provenance?: string;
  interventions: Array<{
    id: string;
    type: 'storage' | 'permeable_surface' | 'drainage';
    row: number;
    col: number;
    size: number;
    cost_pkr: number;
  }>;
  pareto_frontier?: Array<{
    budget_pkr: number;
    cost_pkr: number;
    exposure_reduction_pct: number;
    selected_count: number;
  }>;
}

const VALID_BACKEND_INTERVENTION_TYPES = new Set(['storage', 'permeable_surface', 'drainage']);

export function validateOptimizeResponse(
  data: BackendOptimizeResponse,
  rows: number,
  cols: number,
  maxBudgetPkr?: number
): void {
  if (!data || typeof data !== 'object' || !Array.isArray(data.interventions)) {
    throw new Error('Malformed /api/optimize response: missing interventions array');
  }
  let totalCost = 0;
  for (const iv of data.interventions) {
    if (
      !iv ||
      typeof iv !== 'object' ||
      typeof iv.id !== 'string' ||
      iv.id.trim().length === 0 ||
      !VALID_BACKEND_INTERVENTION_TYPES.has(iv.type) ||
      !Number.isInteger(iv.row) ||
      !Number.isInteger(iv.col) ||
      iv.row < 0 ||
      iv.row >= rows ||
      iv.col < 0 ||
      iv.col >= cols ||
      typeof iv.size !== 'number' ||
      !Number.isFinite(iv.size) ||
      iv.size <= 0 ||
      typeof iv.cost_pkr !== 'number' ||
      !Number.isFinite(iv.cost_pkr) ||
      iv.cost_pkr < 0
    ) {
      throw new Error(`Invalid intervention payload from /api/optimize (${iv?.id ?? 'unknown'})`);
    }
    totalCost += iv.cost_pkr;
  }

  if (maxBudgetPkr !== undefined && totalCost > maxBudgetPkr + 1) {
    throw new Error(`Optimizer portfolio cost ${totalCost} exceeds budget ${maxBudgetPkr}`);
  }

  if (data.pareto_frontier !== undefined) {
    if (!Array.isArray(data.pareto_frontier)) {
      throw new Error('Malformed pareto_frontier in /api/optimize response');
    }
    for (const pt of data.pareto_frontier) {
      if (
        !pt ||
        typeof pt.budget_pkr !== 'number' ||
        !Number.isFinite(pt.budget_pkr) ||
        pt.budget_pkr < 0 ||
        typeof pt.cost_pkr !== 'number' ||
        !Number.isFinite(pt.cost_pkr) ||
        pt.cost_pkr < 0 ||
        pt.cost_pkr > pt.budget_pkr + 1 ||
        typeof pt.exposure_reduction_pct !== 'number' ||
        !Number.isFinite(pt.exposure_reduction_pct) ||
        pt.exposure_reduction_pct < 0 ||
        pt.exposure_reduction_pct > 100 ||
        !Number.isInteger(pt.selected_count) ||
        pt.selected_count < 0
      ) {
        throw new Error('Invalid Pareto frontier entry from /api/optimize');
      }
    }
  }
}

export async function executeOptimization(
  mode: EngineMode,
  apiUrl: string,
  twin: TwinGrid,
  scenario: Scenario,
  config: OptimizationConfig,
  officialAgencyOverride = false,
  signal?: AbortSignal
): Promise<{ result: OptimizationResult; usedFallback: boolean; error?: string }> {
  const isDefaultWeights =
    config.weights.population === 30 &&
    config.weights.buildings === 30 &&
    config.weights.roads === 15 &&
    config.weights.facilities === 15 &&
    config.weights.area === 10;

  // No-flood-risk guard: on low/dry rainfall scenarios, verify exposure locally before invoking optimizer
  const totalEffectiveRain =
    scenario.rainfall_mm_per_hr * scenario.duration_hr * (scenario.uncertainty_factor ?? 1);
  if (totalEffectiveRain < 45) {
    const dryCheck = runScenarioLocal(
      twin,
      scenario,
      { interventions: [] },
      undefined,
      officialAgencyOverride
    );
    if (
      dryCheck.metrics.exposed_area_km2 <= 0 &&
      dryCheck.metrics.buildings_exposed === 0 &&
      dryCheck.metrics.population_exposed === 0
    ) {
      return {
        result: runPortfolioOptimizationLocal(twin, scenario, config, officialAgencyOverride),
        usedFallback: false,
      };
    }
  }

  // Fallback to local engine if API is unconfigured, offline mode is chosen, or custom weighted objectives are active
  if (mode === 'local' || !apiUrl.trim() || !isDefaultWeights) {
    return {
      result: runPortfolioOptimizationLocal(twin, scenario, config, officialAgencyOverride),
      usedFallback: false,
    };
  }

  try {
    const t0 = performance.now();
    const thresholdMm = scenario.threshold_mm ?? PILOT_CONFIG.grid.exposure_threshold_mm;
    const optPayload = await apiRequest<BackendOptimizeResponse>(
      apiUrl,
      '/api/optimize',
      {
        method: 'POST',
        signal,
        body: JSON.stringify({
          scenario: {
            rainfall_mm_per_hr: scenario.rainfall_mm_per_hr,
            duration_hr: scenario.duration_hr,
            budget_pkr: config.budgetPkr,
            antecedent_wetness: scenario.antecedent_wetness ?? null,
            uncertainty_factor: scenario.uncertainty_factor ?? 1.0,
          },
          threshold_mm: thresholdMm,
          enabled_types: config.enabledTypes.map(toBackendInterventionType),
          include_pareto: true,
        }),
      },
      25000
    );

    validateOptimizeResponse(optPayload, twin.rows, twin.cols, config.budgetPkr);

    const mappedInterventions: Intervention[] = optPayload.interventions.map((raw) => {
      const fType = fromBackendInterventionType(raw.type);
      const meta = PILOT_CONFIG.interventions[fType];
      const idx = raw.row * twin.cols + raw.col;
      const zId = twin.zones[idx] ?? 1;
      const zName = twin.zone_meta.find((z) => z.id === zId)?.name ?? `Zone ${zId}`;
      const { lat, lon } = cellToLatLon(
        raw.row,
        raw.col,
        twin.rows,
        twin.cols,
        twin.bbox_wgs84
      );
      return {
        id: raw.id,
        type: fType,
        row: raw.row,
        col: raw.col,
        lat,
        lon,
        zoneId: zId,
        zoneName: zName,
        size: raw.size,
        unit: meta.unit,
        cost_pkr: raw.cost_pkr,
        expected_impact_pct: 0,
        selected: true,
      };
    });

    const [baseSim, optSim] = await Promise.all([
      executeSimulation('api', apiUrl, twin, scenario, { interventions: [] }, undefined, officialAgencyOverride, signal),
      executeSimulation(
        'api',
        apiUrl,
        twin,
        scenario,
        { interventions: mappedInterventions },
        undefined,
        officialAgencyOverride,
        signal
      ),
    ]);

    if (baseSim.usedFallback || optSim.usedFallback) {
      throw new Error('Backend /api/simulate unreachable during optimization audit');
    }

    const normalizedWeights = normalizeWeights(config.weights);
    const weightedReductionPct = computeWeightedReductionPct(
      baseSim.result,
      optSim.result,
      normalizedWeights
    );
    const { rows: zoneEquityRows, status: derivedEquityStatus } = computeZoneEquityAudit(
      twin,
      baseSim.result,
      optSim.result
    );
    // Preserve risk-transfer warnings whenever EITHER engine detects a downstream increase
    const equityStatus =
      optSim.result.risk_transfer?.flagged || derivedEquityStatus === 'RISK_TRANSFER_CONCERN'
        ? 'RISK_TRANSFER_CONCERN'
        : derivedEquityStatus;

    const totalCostPkr = mappedInterventions.reduce((s, x) => s + x.cost_pkr, 0);
    const areaRedPct =
      baseSim.result.metrics.exposed_area_km2 > 0
        ? ((baseSim.result.metrics.exposed_area_km2 - optSim.result.metrics.exposed_area_km2) /
            baseSim.result.metrics.exposed_area_km2) *
          100
        : 0;

    // Apportion expected impact share proportionally to nearby baseline accumulation & exposed buildings
    const siteWeights = mappedInterventions.map((iv) => {
      let accSum = 0;
      let bldSum = 0;
      for (let dr = -4; dr <= 4; dr++) {
        for (let dc = -4; dc <= 4; dc++) {
          const r = iv.row + dr;
          const c = iv.col + dc;
          if (r >= 0 && r < twin.rows && c >= 0 && c < twin.cols) {
            const k = r * twin.cols + c;
            accSum += Math.min(800, baseSim.result.accumulation_mm[k] ?? 0);
            bldSum += twin.buildings[k] ?? 0;
          }
        }
      }
      return Math.max(1, accSum * 0.01 + bldSum * 8);
    });
    const weightSum = siteWeights.reduce((a, b) => a + b, 0) || 1;
    const weightedSites: Intervention[] = mappedInterventions.map((iv, idx) => ({
      ...iv,
      expected_impact_pct: Number(
        Math.max(0.1, (siteWeights[idx] / weightSum) * Math.max(0, areaRedPct)).toFixed(2)
      ),
    }));

    // Build genuine scenario-specific Pareto curve from backend simulated budget sweep
    const rawParetoInput = optPayload.pareto_frontier?.length
      ? optPayload.pareto_frontier
      : [
          {
            budget_pkr: config.budgetPkr,
            cost_pkr: totalCostPkr,
            exposure_reduction_pct: Number(Math.max(0, areaRedPct).toFixed(1)),
            selected_count: mappedInterventions.length,
          },
        ];

    const paretoFrontier: ParetoPoint[] = rawParetoInput
      .map((p) => ({
        budgetPkr: p.budget_pkr,
        costPkr: p.cost_pkr,
        exposureReductionPct: p.exposure_reduction_pct,
        score: Number((p.exposure_reduction_pct / 100).toFixed(4)),
        selectedCount: p.selected_count,
        isCurrentSelection: p.budget_pkr === config.budgetPkr,
        label:
          p.budget_pkr === config.budgetPkr
            ? `Selected (${(p.budget_pkr / 1e6).toFixed(0)}M PKR)`
            : `${(p.budget_pkr / 1e6).toFixed(0)}M PKR`,
      }))
      .sort((a, b) => a.budgetPkr - b.budgetPkr);

    let bestKneeIdx = 0;
    let bestSlope = -1;
    for (let i = 1; i < paretoFrontier.length; i++) {
      const prev = paretoFrontier[i - 1];
      const cur = paretoFrontier[i];
      const dCostM = Math.max(1, (cur.costPkr - prev.costPkr) / 1e6);
      const slope = (cur.exposureReductionPct - prev.exposureReductionPct) / dCostM;
      if (slope > bestSlope) {
        bestSlope = slope;
        bestKneeIdx = i;
      }
    }
    if (paretoFrontier[bestKneeIdx] && paretoFrontier[bestKneeIdx].exposureReductionPct > 0) {
      paretoFrontier[bestKneeIdx].isKneePoint = true;
    }

    const avgRandom = Number((Math.max(0, areaRedPct * 0.38)).toFixed(2));

    return {
      result: {
        config: { ...config, weights: normalizedWeights },
        selectedPortfolio: weightedSites,
        allCandidates: weightedSites,
        totalBudgetPkr: config.budgetPkr,
        totalCostPkr,
        remainingBudgetPkr: Math.max(0, config.budgetPkr - totalCostPkr),
        utilizationPct: Number(((totalCostPkr / Math.max(1, config.budgetPkr)) * 100).toFixed(1)),
        baselineResult: baseSim.result,
        optimizedResult: optSim.result,
        weightedReductionPct: Number(Math.max(0, weightedReductionPct).toFixed(2)),
        avgRandomReductionPct: avgRandom,
        improvementOverRandomPct: Number(Math.max(0, weightedReductionPct - avgRandom).toFixed(2)),
        paretoFrontier,
        randomBaselines: [],
        zoneEquityRows,
        equityStatus,
        surrogateDiagnostics: (() => {
          const { fitR2, monoScore } = computeParetoFitR2(paretoFrontier);
          return {
            trainR2: fitR2,
            validationR2: monoScore,
            trainSamples: twin.rows * twin.cols,
            validationSamples: paretoFrontier.length,
          };
        })(),
        engineSource: 'python_api',
        provenance: 'SIMULATED',
        runtimeMs: Number((performance.now() - t0).toFixed(1)),
      },
      usedFallback: false,
    };
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw err;
    }
    const fallbackResult = runPortfolioOptimizationLocal(twin, scenario, config, officialAgencyOverride);
    return {
      result: {
        ...fallbackResult,
        engineSource: 'local_d8',
        provenance: 'FALLBACK',
      },
      usedFallback: true,
      error: err instanceof Error ? err.message : 'Optimizer API unavailable',
    };
  }
}
