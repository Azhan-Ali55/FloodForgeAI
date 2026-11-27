import type {
  AlertTier,
  AntecedentWetnessLevel,
  AreaSafetySummary,
  ExposureMetrics,
  HotspotItem,
  MonitoringStation,
  Portfolio,
  RiskTransferReport,
  Scenario,
  SimResult,
  TwinGrid,
  ZoneSafetyItem,
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
  routeFraction: Float64Array;
}

const routingCacheMap = new Map<string, RoutingCache>();

function getFlowRouting(twin: TwinGrid): RoutingCache {
  const { rows, cols, dem } = twin;
  const n = rows * cols;
  let demSig = 2166136261;
  for (let i = 0; i < n; i += 7) {
    demSig ^= Math.round((dem[i] ?? 0) * 100);
    demSig = Math.imul(demSig, 16777619);
  }
  const key = `${rows}x${cols}:${demSig >>> 0}`;
  const cached = routingCacheMap.get(key);
  if (cached) return cached;

  const order = new Int32Array(n);
  const downstreamIdx = new Int32Array(n);
  const routeFraction = new Float64Array(n);
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
      if (bestTarget !== -1) {
        const slopeNorm = Math.min(1.0, Math.max(0.0, bestSlope / 0.35));
        routeFraction[idx] = 0.72 + 0.22 * slopeNorm;
      }
    }
  }

  const built = { key, sortedOrder: order, downstreamIdx, routeFraction };
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
  const { rows, cols, f_imp, cell_size_m } = twin;
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
    totalValue: number,
    decay = 0.65
  ) => {
    let weightSum = 0;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const nr = centerR + dr;
        const nc = centerC + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const dist = Math.hypot(dr, dc);
        if (dist <= radius + 0.15) weightSum += 1 / (1 + dist * decay);
      }
    }
    if (weightSum <= 0) return;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const nr = centerR + dr;
        const nc = centerC + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const dist = Math.hypot(dr, dc);
        if (dist <= radius + 0.15) {
          const w = (1 / (1 + dist * decay)) / weightSum;
          target[nr * cols + nc] += totalValue * w;
        }
      }
    }
  };

  const rad = Math.min(12, Math.max(2, Math.floor(Math.min(rows, cols) / 8)));
  const radPerm = Math.min(10, rad);
  const radDrain = Math.min(6, rad);

  for (const item of portfolio.interventions) {
    if (item.row < 0 || item.row >= rows || item.col < 0 || item.col >= cols) continue;
    if (item.type === 'permeable_surface') {
      const blockFactor = Math.min(2.5, Math.max(0.5, item.size / 16_000));
      applyKernel(permCoverage, item.row, item.col, radPerm, blockFactor * 140, 0.2);
    } else if (item.type === 'retention_pond') {
      const equivalentMm = (item.size * 1000) / cellAreaM2;
      applyKernel(storageCapMm, item.row, item.col, rad, equivalentMm * 18, 0.2);
    } else if (item.type === 'drainage_upgrade') {
      const equivalentMm = (item.size * scenario.duration_hr * 1000) / cellAreaM2;
      applyKernel(drainageCapMm, item.row, item.col, radDrain, equivalentMm * 1.5, 0.35);
    }
  }

  // Direct f_imp runoff coefficient matching locked backend (no wetnessAdj check when dry/wet, keep sensitivity)
  const inflow = new Float64Array(n);
  const accumulation = new Float64Array(n);
  const pondingFactor = 0.9 / (1.0 + Math.max(0, scenario.duration_hr - 4.0) * 0.08);

  for (let i = 0; i < n; i++) {
    const cRaw = Math.min(1.0, Math.max(0.05, f_imp[i]));
    const cov = Math.min(1, permCoverage[i]);
    const cEff = Math.min(1.0, cRaw * sensitivityMultiplier * (1 - 0.4 * cov));
    inflow[i] = totalRainMm * cEff * pondingFactor;
  }

  const order = routing.sortedOrder;
  const downstream = routing.downstreamIdx;
  const routeFrac = routing.routeFraction;

  for (let k = 0; k < n; k++) {
    const idx = order[k];
    let water = inflow[idx];

    if (storageCapMm[idx] > 0) {
      const retained = Math.min(water * 0.9, storageCapMm[idx] * 0.85);
      water -= retained;
    }

    if (drainageCapMm[idx] > 0) {
      const relieved = Math.min(water * 0.72, drainageCapMm[idx] * 0.4);
      water -= relieved;

      let target = idx;
      for (let hop = 0; hop < 4; hop++) {
        const next = downstream[target];
        if (next === -1) break;
        target = next;
      }
      if (target !== idx) {
        inflow[target] += relieved * 0.42;
      }
    }

    const target = downstream[idx];
    if (target !== -1) {
      const rf = routeFrac[idx];
      accumulation[idx] = water * (1 - rf);
      inflow[target] += water * rf;
    } else {
      accumulation[idx] = water * 0.48;
    }
  }

  return accumulation;
}

export function computeExposureMetrics(
  twin: TwinGrid,
  accumulation: Float64Array,
  thresholdMm: number = PILOT_CONFIG.grid.exposure_threshold_mm
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
  thresholdMm: number = PILOT_CONFIG.grid.exposure_threshold_mm
): RiskTransferReport {
  const n = twin.rows * twin.cols;
  const worseMask = new Uint8Array(n);
  let buildingsWorse = 0;
  let populationWorse = 0;
  let worseCount = 0;

  let baseExposedBld = 0;
  let mitExposedBld = 0;
  for (let i = 0; i < n; i++) {
    if (baselineAcc[i] >= thresholdMm) baseExposedBld += twin.buildings[i];
    if (mitigatedAcc[i] >= thresholdMm) mitExposedBld += twin.buildings[i];
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
    flagged:
      baseExposedBld > 0
        ? (mitExposedBld - baseExposedBld) / baseExposedBld > 0.02
        : worseCount > 0 && buildingsWorse > 0,
  };
}

export function runScenarioLocal(
  twin: TwinGrid,
  scenario: Scenario,
  portfolio: Portfolio = { interventions: [] },
  baselineResult?: SimResult,
  officialAgencyOverride = false,
  includeUncertainty = true
): SimResult {
  const t0 = performance.now();
  const threshold = scenario.threshold_mm ?? PILOT_CONFIG.grid.exposure_threshold_mm;

  const accumulation = computeAccumulationArray(twin, scenario, portfolio, 1.0);
  const { exposedMask, metrics } = computeExposureMetrics(twin, accumulation, threshold);

  let uncertainty: Record<string, [number, number]> = {};
  if (includeUncertainty) {
    // Screening uncertainty sensitivity bounds (±14%)
    const lowAcc = computeAccumulationArray(twin, scenario, portfolio, 0.86);
    const highAcc = computeAccumulationArray(twin, scenario, portfolio, 1.14);
    const lowMetrics = computeExposureMetrics(twin, lowAcc, threshold).metrics;
    const highMetrics = computeExposureMetrics(twin, highAcc, threshold).metrics;

    uncertainty = {
      exposed_area_km2: [lowMetrics.exposed_area_km2, highMetrics.exposed_area_km2],
      buildings_exposed: [lowMetrics.buildings_exposed, highMetrics.buildings_exposed],
      population_exposed: [lowMetrics.population_exposed, highMetrics.population_exposed],
      road_segments_exposed: [lowMetrics.road_segments_exposed, highMetrics.road_segments_exposed],
      total_facilities_exposed: [
        lowMetrics.total_facilities_exposed,
        highMetrics.total_facilities_exposed,
      ],
    };
  } else {
    uncertainty = {
      exposed_area_km2: [metrics.exposed_area_km2, metrics.exposed_area_km2],
      buildings_exposed: [metrics.buildings_exposed, metrics.buildings_exposed],
      population_exposed: [metrics.population_exposed, metrics.population_exposed],
      road_segments_exposed: [metrics.road_segments_exposed, metrics.road_segments_exposed],
      total_facilities_exposed: [
        metrics.total_facilities_exposed,
        metrics.total_facilities_exposed,
      ],
    };
  }

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

/**
 * Classifies and ranks Most Affected Zones/Stations vs. Safe High-Ground Zones/Stations
 * so citizens and emergency planners see clearly where risk concentrates and where is safe.
 */
export function computeAreaSafetySummary(
  twin: TwinGrid,
  simResult: SimResult,
  stations: MonitoringStation[]
): AreaSafetySummary {
  const { rows, cols, dem, zones, buildings, population, zone_meta, cell_size_m } = twin;
  const cellAreaKm2 = (cell_size_m * cell_size_m) / 1_000_000;
  const acc = simResult.accumulation_mm;
  const expMask = simResult.exposed_mask;

  let safeCellsTotal = 0;
  const zoneBuckets = new Map<
    number,
    {
      totalCells: number;
      expCells: number;
      safeCells: number;
      bld: number;
      pop: number;
      peakAcc: number;
      demSum: number;
    }
  >();

  for (const zm of zone_meta) {
    zoneBuckets.set(zm.id, {
      totalCells: 0,
      expCells: 0,
      safeCells: 0,
      bld: 0,
      pop: 0,
      peakAcc: 0,
      demSum: 0,
    });
  }

  for (let i = 0; i < rows * cols; i++) {
    const isSafe = acc[i] < 25;
    if (isSafe) safeCellsTotal++;

    const zId = zones[i];
    const b = zoneBuckets.get(zId);
    if (!b) continue;
    b.totalCells++;
    b.demSum += dem[i];
    if (acc[i] > b.peakAcc) b.peakAcc = acc[i];
    if (expMask[i] === 1) {
      b.expCells++;
      b.bld += buildings[i];
      b.pop += population[i];
    } else if (isSafe) {
      b.safeCells++;
    }
  }

  const zoneItems: ZoneSafetyItem[] = [];
  for (const zm of zone_meta) {
    const b = zoneBuckets.get(zm.id);
    if (!b || b.totalCells === 0) continue;
    const exposedAreaKm2 = Number((b.expCells * cellAreaKm2).toFixed(2));
    const safeAreaKm2 = Number((b.safeCells * cellAreaKm2).toFixed(2));
    const expRatio = b.expCells / b.totalCells;

    const status: ZoneSafetyItem['status'] =
      expRatio >= 0.25 || b.peakAcc >= 110
        ? 'CRITICAL'
        : expRatio >= 0.1 || b.peakAcc >= 65
          ? 'HIGH_RISK'
          : expRatio >= 0.02 || b.peakAcc >= 30
            ? 'MODERATE'
            : 'SAFE';

    zoneItems.push({
      zoneId: zm.id,
      zoneName: zm.name,
      sector: zm.sector,
      exposedAreaKm2,
      safeAreaKm2,
      exposedBuildings: b.bld,
      exposedPopulation: Math.round(b.pop),
      peakAccumulationMm: Number(b.peakAcc.toFixed(1)),
      meanElevationM: Number((b.demSum / b.totalCells).toFixed(1)),
      status,
    });
  }

  const mostAffectedZones = [...zoneItems]
    .sort((a, b) => b.exposedPopulation - a.exposedPopulation || b.peakAccumulationMm - a.peakAccumulationMm);
  const safeZones = [...zoneItems]
    .sort((a, b) => a.exposedAreaKm2 - b.exposedAreaKm2 || b.meanElevationM - a.meanElevationM);

  const affectedStations = stations
    .filter((s) => s.isExposed || s.riskLevel === 'Critical' || s.riskLevel === 'High')
    .sort((a, b) => b.modeledAccumulationMm - a.modeledAccumulationMm);

  const safeStations = stations
    .filter((s) => !s.isExposed && (s.riskLevel === 'Low' || s.riskLevel === 'Moderate'))
    .sort((a, b) => a.modeledAccumulationMm - b.modeledAccumulationMm || b.elevationM - a.elevationM);

  return {
    safeAreaKm2: Number((safeCellsTotal * cellAreaKm2).toFixed(2)),
    exposedAreaKm2: simResult.metrics.exposed_area_km2,
    mostAffectedZones,
    safeZones,
    affectedStations,
    safeStations,
  };
}
