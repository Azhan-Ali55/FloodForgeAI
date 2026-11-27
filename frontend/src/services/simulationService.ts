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

function flatten2D(arr: number[][], rows: number, cols: number): Float64Array {
  const out = new Float64Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[r * cols + c] = arr[r]?.[c] ?? 0;
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
  if (mode === 'local') {
    return {
      result: runScenarioLocal(twin, scenario, portfolio, baseline, officialAgencyOverride),
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

    const facTotal = Object.values(data.metrics.facilities_exposed ?? {}).reduce(
      (s, v) => s + Number(v || 0),
      0
    );

    const simResult: SimResult = {
      accumulation_mm: flatten2D(data.accumulation_mm, twin.rows, twin.cols),
      exposed_mask: flatten2DBool(data.exposed_mask, twin.rows, twin.cols),
      metrics: {
        exposed_area_km2: data.metrics.exposed_area_km2,
        buildings_exposed: data.metrics.buildings_exposed,
        population_exposed: data.metrics.population_exposed,
        road_cells_exposed: data.metrics.road_cells_exposed,
        road_segments_exposed:
          data.metrics.road_segments_exposed ?? Math.max(0, Math.round(data.metrics.road_cells_exposed / 12)),
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
      scenario_tag: scenario.tag,
      alert_tier: classifyFloodRiskTier(data.metrics.exposed_area_km2, officialAgencyOverride),
      runtime_ms: Number((performance.now() - t0).toFixed(1)),
      timestamp_pkt: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi' }) + ' PKT',
    };

    return { result: simResult, usedFallback: false };
  } catch (err) {
    return {
      result: runScenarioLocal(twin, scenario, portfolio, baseline, officialAgencyOverride),
      usedFallback: true,
      error: err instanceof Error ? err.message : 'Simulation API unavailable',
    };
  }
}
