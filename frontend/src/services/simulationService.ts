import { PILOT_CONFIG } from '../engine/pilotConfig';
import { classifyFloodRiskTier, runScenarioLocal } from '../engine/simulator';
import type {
  InterventionType,
  Portfolio,
  Scenario,
  SimResult,
  TwinGrid,
} from '../types/floodforge';
import { apiRequest, type EngineMode } from './apiClient';

type BackendInterventionType = 'storage' | 'permeable_surface' | 'drainage';

export function toBackendInterventionType(type: InterventionType): BackendInterventionType {
  if (type === 'retention_pond') return 'storage';
  if (type === 'drainage_upgrade') return 'drainage';
  return 'permeable_surface';
}

export function fromBackendInterventionType(type: BackendInterventionType): InterventionType {
  if (type === 'storage') return 'retention_pond';
  if (type === 'drainage') return 'drainage_upgrade';
  return 'permeable_surface';
}

interface BackendSimulateResponse {
  accumulation_mm: number[][];
  exposed_mask: boolean[][];
  metrics: {
    exposed_area_km2: number;
    buildings_exposed: number;
    population_exposed: number;
    road_cells_exposed: number;
    road_segments_exposed?: number;
    facilities_exposed: Record<string, number>;
    total_facilities_exposed?: number;
  };
  risk_transfer?: {
    worse_mask: boolean[][];
    buildings_worse: number;
    population_worse: number;
    flagged: boolean;
  } | null;
  uncertainty?: Record<string, [number, number]>;
  assumptions?: string[];
  screening_level?: boolean;
  zone_breakdown?: Record<string, Record<string, number>>;
}

export function validateSimulateResponse(
  data: BackendSimulateResponse,
  expectedRows: number,
  expectedCols: number
): void {
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray(data.accumulation_mm) ||
    data.accumulation_mm.length !== expectedRows ||
    !Array.isArray(data.exposed_mask) ||
    data.exposed_mask.length !== expectedRows ||
    !data.metrics ||
    typeof data.metrics !== 'object'
  ) {
    throw new Error('Malformed /api/simulate response shape or grid dimensions');
  }

  const metricKeys: Array<keyof BackendSimulateResponse['metrics']> = [
    'exposed_area_km2',
    'buildings_exposed',
    'population_exposed',
    'road_cells_exposed',
  ];
  for (const k of metricKeys) {
    const val = data.metrics[k];
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
      throw new Error(`Invalid /api/simulate metric '${k}': ${String(val)}`);
    }
  }
  if (!data.metrics.facilities_exposed || typeof data.metrics.facilities_exposed !== 'object') {
    throw new Error('Malformed /api/simulate metrics.facilities_exposed');
  }

  for (let r = 0; r < expectedRows; r++) {
    const accRow = data.accumulation_mm[r];
    const maskRow = data.exposed_mask[r];
    if (
      !Array.isArray(accRow) ||
      accRow.length !== expectedCols ||
      !Array.isArray(maskRow) ||
      maskRow.length !== expectedCols
    ) {
      throw new Error(`Grid width mismatch at row ${r} in /api/simulate response`);
    }
    for (let c = 0; c < expectedCols; c++) {
      const accVal = accRow[c];
      if (typeof accVal !== 'number' || !Number.isFinite(accVal) || accVal < 0) {
        throw new Error(`Invalid accumulation_mm value at [${r}, ${c}]: ${String(accVal)}`);
      }
      if (typeof maskRow[c] !== 'boolean') {
        throw new Error(`Invalid exposed_mask value at [${r}, ${c}]: ${String(maskRow[c])}`);
      }
    }
  }

  if (data.risk_transfer !== undefined && data.risk_transfer !== null) {
    const rt = data.risk_transfer;
    if (
      !Array.isArray(rt.worse_mask) ||
      rt.worse_mask.length !== expectedRows ||
      typeof rt.buildings_worse !== 'number' ||
      !Number.isFinite(rt.buildings_worse) ||
      typeof rt.population_worse !== 'number' ||
      !Number.isFinite(rt.population_worse) ||
      typeof rt.flagged !== 'boolean'
    ) {
      throw new Error('Malformed risk_transfer block in /api/simulate response');
    }
    for (let r = 0; r < expectedRows; r++) {
      if (!Array.isArray(rt.worse_mask[r]) || rt.worse_mask[r].length !== expectedCols) {
        throw new Error(`risk_transfer.worse_mask width mismatch at row ${r}`);
      }
    }
  }
}

function flatten2D(arr: number[][], rows: number, cols: number): Float64Array {
  const out = new Float64Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const rowArr = arr[r];
    for (let c = 0; c < cols; c++) {
      const v = rowArr[c];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        throw new Error(`Invalid grid cell accumulation at [${r}, ${c}]`);
      }
      out[r * cols + c] = v;
    }
  }
  return out;
}

function flatten2DBool(arr: boolean[][], rows: number, cols: number): Uint8Array {
  const out = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[r * cols + c] = arr[r]?.[c] ? 1 : 0;
    }
  }
  return out;
}

export async function executeSimulation(
  mode: EngineMode,
  apiUrl: string,
  twin: TwinGrid,
  scenario: Scenario,
  portfolio: Portfolio = { interventions: [] },
  baseline?: SimResult,
  officialAgencyOverride = false,
  signal?: AbortSignal
): Promise<{ result: SimResult; usedFallback: boolean; error?: string }> {
  if (mode === 'local' || !apiUrl.trim()) {
    return {
      result: {
        ...runScenarioLocal(twin, scenario, portfolio, baseline, officialAgencyOverride),
        engineSource: 'local_d8',
      },
      usedFallback: false,
    };
  }

  try {
    const t0 = performance.now();
    const thresholdMm = scenario.threshold_mm ?? PILOT_CONFIG.grid.exposure_threshold_mm;
    const data = await apiRequest<BackendSimulateResponse>(
      apiUrl,
      '/api/simulate',
      {
        method: 'POST',
        signal,
        body: JSON.stringify({
          scenario: {
            rainfall_mm_per_hr: scenario.rainfall_mm_per_hr,
            duration_hr: scenario.duration_hr,
            budget_pkr: scenario.budget_pkr,
            antecedent_wetness: scenario.antecedent_wetness ?? null,
            uncertainty_factor: scenario.uncertainty_factor ?? 1.0,
          },
          portfolio: {
            interventions: portfolio.interventions.map((i) => ({
              id: i.id,
              type: toBackendInterventionType(i.type),
              row: i.row,
              col: i.col,
              size: i.size,
              cost_pkr: i.cost_pkr,
            })),
          },
          threshold_mm: thresholdMm,
        }),
      },
      12000
    );

    validateSimulateResponse(data, twin.rows, twin.cols);

    const exposedMask = flatten2DBool(data.exposed_mask, twin.rows, twin.cols);
    const exposedSegs = new Set<number>();
    for (let i = 0; i < exposedMask.length; i++) {
      if (exposedMask[i] === 1 && twin.roads[i] && twin.road_segments[i] > 0) {
        exposedSegs.add(twin.road_segments[i]);
      }
    }

    const facTotal = Object.values(data.metrics.facilities_exposed ?? {}).reduce(
      (s, v) => s + Number(v || 0),
      0
    );

    const simResult: SimResult = {
      accumulation_mm: flatten2D(data.accumulation_mm, twin.rows, twin.cols),
      exposed_mask: exposedMask,
      metrics: {
        exposed_area_km2: data.metrics.exposed_area_km2,
        buildings_exposed: data.metrics.buildings_exposed,
        population_exposed: data.metrics.population_exposed,
        road_cells_exposed: data.metrics.road_cells_exposed,
        road_segments_exposed: data.metrics.road_segments_exposed ?? exposedSegs.size,
        facilities_exposed: data.metrics.facilities_exposed ?? {},
        total_facilities_exposed: data.metrics.total_facilities_exposed ?? facTotal,
      },
      risk_transfer: data.risk_transfer
        ? {
            worse_mask: flatten2DBool(data.risk_transfer.worse_mask, twin.rows, twin.cols),
            buildings_worse: data.risk_transfer.buildings_worse,
            population_worse: data.risk_transfer.population_worse,
            flagged: data.risk_transfer.flagged,
          }
        : null,
      uncertainty: data.uncertainty ?? {},
      assumptions: data.assumptions ?? [],
      screening_level: data.screening_level ?? true,
      engineSource: 'python_api',
      scenario_tag: scenario.tag,
      alert_tier: classifyFloodRiskTier(data.metrics.exposed_area_km2, officialAgencyOverride),
      runtime_ms: Number((performance.now() - t0).toFixed(1)),
      timestamp_pkt: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi' }) + ' PKT',
    };

    return { result: simResult, usedFallback: false };
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw err;
    }
    return {
      result: {
        ...runScenarioLocal(twin, scenario, portfolio, baseline, officialAgencyOverride),
        engineSource: 'local_d8',
      },
      usedFallback: true,
      error: err instanceof Error ? err.message : 'Simulation API unavailable',
    };
  }
}
