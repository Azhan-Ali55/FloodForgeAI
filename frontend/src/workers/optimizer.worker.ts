import { runPortfolioOptimizationLocal } from '../engine/optimizer';
import type { OptimizationConfig, OptimizationResult, Scenario, TwinGrid } from '../types/floodforge';

interface WorkerRequest {
  id: number;
  twin: TwinGrid;
  scenario: Scenario;
  config: OptimizationConfig;
  officialAgencyOverride: boolean;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: OptimizationResult;
  error?: string;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, twin, scenario, config, officialAgencyOverride } = event.data;
  try {
    const result = runPortfolioOptimizationLocal(twin, scenario, config, officialAgencyOverride);
    const payload: WorkerResponse = { id, ok: true, result };
    self.postMessage(payload);
  } catch (err) {
    const payload: WorkerResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : 'Worker optimization failed',
    };
    self.postMessage(payload);
  }
};
