import { runPortfolioOptimizationLocal } from '../engine/optimizer';
import type { OptimizationConfig, OptimizationResult, Scenario, TwinGrid } from '../types/floodforge';

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: OptimizationResult;
  error?: string;
}

let workerSeq = 0;

/**
 * Offloads heavy local D8 multi-budget optimization to a Web Worker so the main UI
 * thread remains responsive on desktop and mobile devices. Falls back synchronously
 * in SSR/test runtimes where Worker is unavailable.
 */
export function runPortfolioOptimizationAsync(
  twin: TwinGrid,
  scenario: Scenario,
  config: OptimizationConfig,
  officialAgencyOverride = false,
  signal?: AbortSignal
): Promise<OptimizationResult> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  if (typeof Worker === 'undefined') {
    return Promise.resolve(
      runPortfolioOptimizationLocal(twin, scenario, config, officialAgencyOverride)
    );
  }

  return new Promise<OptimizationResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(runPortfolioOptimizationLocal(twin, scenario, config, officialAgencyOverride));
      return;
    }

    const reqId = ++workerSeq;
    let settled = false;

    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      worker.terminate();
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (settled || event.data.id !== reqId) return;
      settled = true;
      cleanup();
      if (event.data.ok && event.data.result) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error || 'Optimization worker failed'));
      }
    };

    worker.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve(runPortfolioOptimizationLocal(twin, scenario, config, officialAgencyOverride));
      } catch (err) {
        reject(err);
      }
    };

    worker.postMessage({
      id: reqId,
      twin,
      scenario,
      config,
      officialAgencyOverride,
    });
  });
}
