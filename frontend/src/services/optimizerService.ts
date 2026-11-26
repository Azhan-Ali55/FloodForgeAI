import { runPortfolioOptimizationLocal } from '../engine/optimizer';
import type {
  OptimizationConfig,
  OptimizationResult,
  Scenario,
  TwinGrid,
} from '../types/floodforge';
import { apiRequest, type EngineMode } from './apiClient';

export async function executeOptimization(
  mode: EngineMode,
  apiUrl: string,
  twin: TwinGrid,
  scenario: Scenario,
  config: OptimizationConfig,
  officialAgencyOverride = false
): Promise<{ result: OptimizationResult; usedFallback: boolean; error?: string }> {
  if (mode === 'local') {
    return {
      result: runPortfolioOptimizationLocal(twin, scenario, config, officialAgencyOverride),
      usedFallback: false,
    };
  }

  try {
    const remote = await apiRequest<OptimizationResult>(
      apiUrl,
      '/api/optimize',
      {
        method: 'POST',
        body: JSON.stringify({
          study_area: twin.studyAreaId,
          scenario,
          config,
          official_agency_override: officialAgencyOverride,
        }),
      },
      15000
    );
    return { result: remote, usedFallback: false };
  } catch (err) {
    return {
      result: runPortfolioOptimizationLocal(twin, scenario, config, officialAgencyOverride),
      usedFallback: true,
      error: err instanceof Error ? err.message : 'Optimizer API unavailable',
    };
  }
}
