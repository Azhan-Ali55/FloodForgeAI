/**
 * Typed REST API client for FloodForge AI Python backend integration.
 * Uses VITE_API_BASE_URL from environment variables; never stores secrets.
 */

export type EngineMode = 'local' | 'api';

export const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'http://localhost:8000');

export const DEFAULT_ENGINE_MODE: EngineMode =
  import.meta.env.VITE_DEFAULT_ENGINE_MODE === 'api' ? 'api' : 'local';

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<T> {
  const controller = new AbortController();
  const extSignal = options.signal;
  if (extSignal) {
    if (extSignal.aborted) {
      controller.abort();
    } else {
      extSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      throw new ApiError(`HTTP ${res.status} ${res.statusText}`, res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Backend endpoint unreachable'
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function pingBackendHealth(
  baseUrl: string
): Promise<{ ok: boolean; latencyMs: number; version?: string; error?: string }> {
  const t0 = performance.now();
  try {
    const data = await apiRequest<{ status: string; version?: string }>(
      baseUrl,
      '/api/health',
      { method: 'GET' },
      3500
    );
    return {
      ok: data.status === 'ok' || data.status === 'healthy',
      latencyMs: Math.round(performance.now() - t0),
      version: data.version,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}
