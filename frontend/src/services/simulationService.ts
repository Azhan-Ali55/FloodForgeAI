import { runScenarioLocal } from '../engine/simulator';
import type { Portfolio, Scenario, SimResult, TwinGrid } from '../types/floodforge';
import { apiRequest, type EngineMode } from './apiClient';

interface BackendSimulateResponse {
  accumulation_mm: number[][];
  exposed_mask: boolean[][];
  metrics: SimResult['metrics'];
  risk_transfer?: {
    worse_mask: boolean[][];
    buildings_worse: number;
    population_worse: number;
    flagged: boolean;
  } | null;
  uncertainty?: Record<string, [number, number]>;
  assumptions?: string[];
  screening_level?: boolean;
  alert_tier?: SimResult['alert_tier'];
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
  officialAgencyOverride = false
): Promise<{ result: SimResult; usedFallback: boolean; error?: string }> {
  if (mode === 'local') {
    return {
      result: runScenarioLocal(twin, scenario, portfolio, baseline, officialAgencyOverride),
      usedFallback: false,
    };
  }

  try {
    const t0 = performance.now();
    const data = await apiRequest<BackendSimulateResponse>(apiUrl, '/api/simulate', {
      method: 'POST',
      body: JSON.stringify({
        study_area: twin.studyAreaId,
        scenario,
        portfolio,
        official_agency_override: officialAgencyOverride,
      }),
    });

    const simResult: SimResult = {
      accumulation_mm: flatten2D(data.accumulation_mm, twin.rows, twin.cols),
      exposed_mask: flatten2DBool(data.exposed_mask, twin.rows, twin.cols),
      metrics: data.metrics,
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
      alert_tier: data.alert_tier ?? 'Advisory',
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
