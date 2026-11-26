import type {
  AlertTier,
  AntecedentWetnessLevel,
  ExposureMetrics,
  HotspotItem,
  Portfolio,
  RiskTransferReport,
  Scenario,
  SimResult,
  TwinGrid,
} from '../types/floodforge';
import { cellToLatLon, PILOT_CONFIG } from './pilotConfig';
import { formatPktTime } from '../utils/formatters';

const NEIGHBOR_OFFSETS = [
  [-1, -1, Math.SQRT2],
  [-1, 0, 1],
  [-1, 1, Math.SQRT2],
  [0, -1, 1],
  [0, 1, 1],
  [1, -1, Math.SQRT2],
  [1, 0, 1],
  [1, 1, Math.SQRT2],
] as const;

interface RoutingCache {
  key: string;
  sortedOrder: Int32Array;
  downstreamIdx: Int32Array;
  lownessFactor: Float64Array;
}

const routingCacheMap = new Map<string, RoutingCache>();

function getFlowRouting(twin: TwinGrid): RoutingCache {
  const key = `${twin.studyAreaId}:${twin.seed}:${twin.rows}x${twin.cols}`;
  const cached = routingCacheMap.get(key);
  if (cached) return cached;

  const { rows, cols, dem } = twin;
  const n = rows * cols;
  const order = new Int32Array(n);
  const downstreamIdx = new Int32Array(n);
  const lownessFactor = new Float64Array(n);
  downstreamIdx.fill(-1);

  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => dem[b] - dem[a]);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const elev = dem[idx];
      let bestSlope = 0;
      let bestTarget = -1;

      for (let k = 0; k < NEIGHBOR_OFFSETS.length; k++) {
        const nr = r + NEIGHBOR_OFFSETS[k][0];
        const nc = c + NEIGHBOR_OFFSETS[k][1];
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const nIdx = nr * cols + nc;
        const slope = (elev - dem[nIdx]) / NEIGHBOR_OFFSETS[k][2];
        if (slope > bestSlope) {
          bestSlope = slope;
          bestTarget = nIdx;
        }
      }
      downstreamIdx[idx] = bestTarget;

      // Local relative lowness factor (5-cell radius)
      let sum = 0;
      let count = 0;
      for (let dr = -4; dr <= 4; dr += 2) {
        for (let dc = -4; dc <= 4; dc += 2) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            sum += dem[nr * cols + nc];
            count++;
          }
        }
      }
      const localMean = sum / Math.max(1, count);
      const relDrop = Math.max(0, localMean - elev);
      lownessFactor[idx] = 1.0 + relDrop / 3.2;
    }
  }

  const built = { key, sortedOrder: order, downstreamIdx, lownessFactor };
  routingCacheMap.set(key, built);
  return built;
}

export function getWetnessAdjustment(wetness: AntecedentWetnessLevel = 'normal'): number {
  switch (wetness) {
    case 'dry':
      return 0.78;
    case 'normal':
      return 1.0;
    case 'wet':
      return 1.24;
    case 'saturated':
      return 1.48;
  }
}

export function classifyFloodRiskTier(
  exposedAreaKm2: number,
  officialAgencyOverride = false
): AlertTier {
  const t = PILOT_CONFIG.alerts.thresholds_area_km2;
  if (exposedAreaKm2 >= t.warning) {
    return officialAgencyOverride ? 'Emergency' : 'Warning';
  }
  if (exposedAreaKm2 >= t.watch) return 'Watch';
  if (exposedAreaKm2 >= t.advisory) return 'Advisory';
  return 'Normal';
}

function computeAccumulationArray(
  twin: TwinGrid,
  scenario: Scenario,
  portfolio: Portfolio,
  sensitivityMultiplier = 1.0
): Float64Array {
  const { rows, cols, land_cover, f_imp, cell_size_m } = twin;
  const n = rows * cols;
  const cellAreaM2 = cell_size_m * cell_size_m;
  const uncertaintyFactor = scenario.uncertainty_factor ?? 1.0;
  const totalRainMm =
    scenario.rainfall_mm_per_hr * scenario.duration_hr * uncertaintyFactor;
  const routing = getFlowRouting(twin);

  const permCoverage = new Float64Array(n);
  const storageCapMm = new Float64Array(n);
  const drainageCapMm = new Float64Array(n);

  const applyKernel = (
    target: Float64Array,
    centerR: number,
    centerC: number,
    radius: number,
    totalValue: number
  ) => {
    let weightSum = 0;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const nr = centerR + dr;
        const nc = centerC + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const dist = Math.hypot(dr, dc);
        if (dist <= radius + 0.2) weightSum += 1 / (1 + dist * 0.65);
      }
    }
    if (weightSum <= 0) return;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const nr = centerR + dr;
        const nc = centerC + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const dist = Math.hypot(dr, dc);
        if (dist <= radius + 0.2) {
          const w = (1 / (1 + dist * 0.65)) / weightSum;
          target[nr * cols + nc] += totalValue * w;
        }
      }
    }
  };

  for (const item of portfolio.interventions) {
    if (item.row < 0 || item.row >= rows || item.col < 0 || item.col >= cols) continue;
    if (item.type === 'permeable_surface') {
      // Ward-scale permeable surface block (~2 ha) cutting local runoff across a 5-cell kernel
      const equivalentCov = Math.min(1.0, item.size / 16_000);
      applyKernel(permCoverage, item.row, item.col, 5, equivalentCov * 48);
    } else if (item.type === 'retention_pond') {
      // Municipal detention basin (18,000 m3 = 20,000 mm across 1 cell -> ~450 mm across 45-cell catchment)
      const equivalentMm = (item.size * 1000) / cellAreaM2;
      applyKernel(storageCapMm, item.row, item.col, 5, equivalentMm * 0.9);
    } else if (item.type === 'drainage_upgrade') {
      // Major storm-drain segment upgrade relieving ponding across a 4-cell corridor
      const equivalentMm = (item.size * scenario.duration_hr * 1000) / cellAreaM2;
      applyKernel(drainageCapMm, item.row, item.col, 4, equivalentMm * 0.65);
    }
  }

  // Pervious-only antecedent wetness adjustment:
  // C_eff(x, y) = f_imp(x, y) * C_imp + (1 - f_imp(x, y)) * C_perv_adj(x, y)
  const wetnessAdj = getWetnessAdjustment(scenario.antecedent_wetness);
  const inflow = new Float64Array(n);
  const accumulation = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const lc = land_cover[i] as keyof typeof PILOT_CONFIG.runoff_coefficients;
    const baseC = PILOT_CONFIG.runoff_coefficients[lc] ?? 0.5;
    const impFrac = f_imp[i];
    const cImp = 0.88;
    const cPervAdj = Math.min(0.95, Math.max(0.15, baseC * wetnessAdj));
    const cRaw = impFrac * cImp + (1 - impFrac) * cPervAdj;
    const cov = Math.min(1, permCoverage[i]);
    const cEff = Math.min(
      0.98,
      cRaw * sensitivityMultiplier * (1 - 0.42 * cov)
    );
    inflow[i] = totalRainMm * cEff * 0.55;
  }

  const order = routing.sortedOrder;
  const downstream = routing.downstreamIdx;
  const lowness = routing.lownessFactor;
  const routeFraction = 0.30;

  for (let k = 0; k < n; k++) {
    const idx = order[k];
    let water = inflow[idx];

    if (storageCapMm[idx] > 0) {
      const retained = Math.min(water * 0.85, storageCapMm[idx] * 0.52);
      water -= retained;
    }

    if (drainageCapMm[idx] > 0) {
      const relieved = Math.min(water * 0.72, drainageCapMm[idx] * 0.38);
      water -= relieved;

      // Discharge fraction downstream along D8 path
      let target = idx;
      for (let hop = 0; hop < 4; hop++) {
        const next = downstream[target];
        if (next === -1) break;
        target = next;
      }
      if (target !== idx) {
        inflow[target] += relieved * 0.45;
      }
    }

    accumulation[idx] = water * Math.min(1.45, lowness[idx] * 0.72);

    const target = downstream[idx];
    if (target !== -1) {
      inflow[target] += water * routeFraction;
    }
  }

  return accumulation;
}

export function computeExposureMetrics(
  twin: TwinGrid,
  accumulation: Float64Array,
  thresholdMm = PILOT_CONFIG.grid.exposure_threshold_mm
): { exposedMask: Uint8Array; metrics: ExposureMetrics } {
  const n = twin.rows * twin.cols;
  const exposedMask = new Uint8Array(n);
  const cellAreaKm2 = (twin.cell_size_m * twin.cell_size_m) / 1_000_000;

  let exposedCells = 0;
  let buildingsExposed = 0;
  let populationExposed = 0;
  let roadCellsExposed = 0;
  const exposedSegs = new Set<number>();

  const facilitiesExposed: Record<string, number> = {};
  for (const key of Object.keys(twin.facilities)) {
    facilitiesExposed[key] = 0;
  }
  let totalFacilities = 0;

  for (let i = 0; i < n; i++) {
    if (accumulation[i] >= thresholdMm) {
      exposedMask[i] = 1;
      exposedCells++;
      buildingsExposed += twin.buildings[i];
      populationExposed += twin.population[i];
      if (twin.roads[i]) {
        roadCellsExposed++;
        if (twin.road_segments[i] > 0) exposedSegs.add(twin.road_segments[i]);
      }
      for (const [fKey, fMask] of Object.entries(twin.facilities)) {
        if (fMask[i]) {
          facilitiesExposed[fKey] = (facilitiesExposed[fKey] ?? 0) + 1;
          totalFacilities++;
        }
      }
    }
  }

  return {
    exposedMask,
    metrics: {
      exposed_area_km2: Number((exposedCells * cellAreaKm2).toFixed(3)),
      buildings_exposed: buildingsExposed,
      population_exposed: Math.round(populationExposed),
      road_cells_exposed: roadCellsExposed,
      road_segments_exposed: exposedSegs.size,
      facilities_exposed: facilitiesExposed,
      total_facilities_exposed: totalFacilities,
    },
  };
}

function computeRiskTransfer(
  twin: TwinGrid,
  baselineAcc: Float64Array,
  mitigatedAcc: Float64Array,
  thresholdMm = PILOT_CONFIG.grid.exposure_threshold_mm
): RiskTransferReport {
  const n = twin.rows * twin.cols;
  const worseMask = new Uint8Array(n);
  let buildingsWorse = 0;
  let populationWorse = 0;
  let worseCount = 0;

  for (let i = 0; i < n; i++) {
    const delta = mitigatedAcc[i] - baselineAcc[i];
    if (delta > 1.5 && mitigatedAcc[i] >= thresholdMm * 0.9) {
      worseMask[i] = 1;
      worseCount++;
      buildingsWorse += twin.buildings[i];
      populationWorse += twin.population[i];
    }
  }

  return {
    worse_mask: worseMask,
    buildings_worse: buildingsWorse,
    population_worse: Math.round(populationWorse),
    flagged: worseCount > 0 && (buildingsWorse > 0 || worseCount >= 3),
  };
}

export function runScenarioLocal(
  twin: TwinGrid,
  scenario: Scenario,
  portfolio: Portfolio = { interventions: [] },
  baselineResult?: SimResult,
  officialAgencyOverride = false
): SimResult {
  const t0 = performance.now();
  const threshold = PILOT_CONFIG.grid.exposure_threshold_mm;

  const accumulation = computeAccumulationArray(twin, scenario, portfolio, 1.0);
  const { exposedMask, metrics } = computeExposureMetrics(twin, accumulation, threshold);

  // Screening uncertainty sensitivity bounds (±14%)
  const lowAcc = computeAccumulationArray(twin, scenario, portfolio, 0.86);
  const highAcc = computeAccumulationArray(twin, scenario, portfolio, 1.14);
  const lowMetrics = computeExposureMetrics(twin, lowAcc, threshold).metrics;
  const highMetrics = computeExposureMetrics(twin, highAcc, threshold).metrics;

  const uncertainty: Record<string, [number, number]> = {
    exposed_area_km2: [lowMetrics.exposed_area_km2, highMetrics.exposed_area_km2],
    buildings_exposed: [lowMetrics.buildings_exposed, highMetrics.buildings_exposed],
    population_exposed: [lowMetrics.population_exposed, highMetrics.population_exposed],
    road_segments_exposed: [lowMetrics.road_segments_exposed, highMetrics.road_segments_exposed],
    total_facilities_exposed: [
      lowMetrics.total_facilities_exposed,
      highMetrics.total_facilities_exposed,
    ],
  };

  let riskTransfer: RiskTransferReport | null = null;
  if (baselineResult && portfolio.interventions.length > 0) {
    riskTransfer = computeRiskTransfer(
      twin,
      baselineResult.accumulation_mm,
      accumulation,
      threshold
    );
  }

  const runtimeMs = Number((performance.now() - t0).toFixed(1));

  return {
    accumulation_mm: accumulation,
    exposed_mask: exposedMask,
    metrics,
    risk_transfer: riskTransfer,
    uncertainty,
    assumptions: [
      `Screening-level 30 m D8 runoff accumulation proxy on ${twin.rows}×${twin.cols} ${twin.crs} grid.`,
      `Pervious-only antecedent wetness formulation preserves impervious cell runoff coefficients.`,
      `Exposure mask threshold fixed at ${threshold} mm modeled accumulation (0.15 m screening proxy).`,
      `Placeholder unit costs (PKR) and synthetic/open-proxy socio-physical rasters; verify against PMD & NDMA bulletins.`,
    ],
    screening_level: true,
    scenario_tag: scenario.tag,
    alert_tier: classifyFloodRiskTier(metrics.exposed_area_km2, officialAgencyOverride),
    runtime_ms: runtimeMs,
    timestamp_pkt: formatPktTime(),
  };
}

/**
 * Extracts top modeled flood hotspots grouped by Nullah Lai neighborhood zone.
 */
export function extractTopHotspots(
  twin: TwinGrid,
  simResult: SimResult,
  limit = 6
): HotspotItem[] {
  const { rows, cols, zones, buildings, population, zone_meta, bbox_wgs84 } = twin;
  const stats = new Map<
    number,
    {
      peakAcc: number;
      peakR: number;
      peakC: number;
      pop: number;
      bld: number;
      exposedCells: number;
    }
  >();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const zId = zones[idx];
      const acc = simResult.accumulation_mm[idx];
      const exposed = simResult.exposed_mask[idx] === 1;

      const cur = stats.get(zId) ?? {
        peakAcc: 0,
        peakR: r,
        peakC: c,
        pop: 0,
        bld: 0,
        exposedCells: 0,
      };
      if (acc > cur.peakAcc) {
        cur.peakAcc = acc;
        cur.peakR = r;
        cur.peakC = c;
      }
      if (exposed) {
        cur.exposedCells++;
        cur.pop += population[idx];
        cur.bld += buildings[idx];
      }
      stats.set(zId, cur);
    }
  }

  const items: HotspotItem[] = [];
  for (const zm of zone_meta) {
    const s = stats.get(zm.id);
    if (!s) continue;
    const { lat, lon } = cellToLatLon(s.peakR, s.peakC, rows, cols, bbox_wgs84);
    const tier: AlertTier =
      s.peakAcc >= 115
        ? 'Warning'
        : s.peakAcc >= 80
          ? 'Watch'
          : s.peakAcc >= 50
            ? 'Advisory'
            : 'Normal';

    items.push({
      rank: 0,
      zoneId: zm.id,
      zoneName: zm.name,
      sector: zm.sector,
      lat,
      lon,
      row: s.peakR,
      col: s.peakC,
      peakAccumulationMm: Number(s.peakAcc.toFixed(1)),
      exposedPopulation: Math.round(s.pop),
      exposedBuildings: s.bld,
      riskTier: tier,
    });
  }

  items.sort((a, b) => b.exposedPopulation - a.exposedPopulation || b.peakAccumulationMm - a.peakAccumulationMm);
  return items.slice(0, limit).map((item, idx) => ({ ...item, rank: idx + 1 }));
}
