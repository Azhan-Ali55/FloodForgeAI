/**
 * Typed REST API client for FloodForge AI Python backend integration.
 * Uses VITE_API_BASE_URL from environment variables; never stores secrets
 * and never falls back to localhost in non-local production builds.
 */

export type EngineMode = 'local' | 'api';

function resolveDefaultApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim().replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === '127.0.0.1') return 'http://127.0.0.1:8000';
    if (host === 'localhost') return 'http://localhost:8000';
  }
  return '';
}

export const DEFAULT_API_BASE_URL = resolveDefaultApiBaseUrl();

export const DEFAULT_ENGINE_MODE: EngineMode =
  import.meta.env.VITE_DEFAULT_ENGINE_MODE === 'api' && DEFAULT_API_BASE_URL.length > 0
    ? 'api'
    : 'local';

export class ApiError extends Error {
  status?: number;
  errorCategory?: string;
  constructor(message: string, status?: number, errorCategory?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCategory = errorCategory;
  }
}

export async function apiRequest<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<T> {
  const trimmedBase = baseUrl.trim().replace(/\/$/, '');
  if (!trimmedBase) {
    throw new ApiError('Backend API URL is not configured for this environment');
  }

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
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${trimmedBase}${cleanPath}`;

  // Avoid attaching Content-Type on bodyless GET requests to prevent unnecessary CORS preflight
  const hasBody = options.body !== undefined && options.body !== null;
  const headers: HeadersInit = hasBody
    ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
    : { ...(options.headers || {}) };

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    });
    if (!res.ok) {
      let detailMsg = `HTTP ${res.status} ${res.statusText}`;
      let errorCategory: string | undefined;
      try {
        const errBody = await res.json();
        if (typeof errBody?.detail === 'string') {
          detailMsg = errBody.detail;
        } else if (errBody?.detail && typeof errBody.detail === 'object') {
          detailMsg = errBody.detail.message || JSON.stringify(errBody.detail);
          errorCategory = errBody.detail.error_category;
        }
      } catch {
        // Ignore non-JSON error bodies
      }
      throw new ApiError(detailMsg, res.status, errorCategory);
    }
    return (await res.json()) as T;
  } catch (err) {
    // Re-throw only caller-initiated aborts; turn internal timeouts into ApiError so fallbacks can recover cleanly
    if (extSignal?.aborted) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs} ms`, 408, 'request_timeout');
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Backend endpoint unreachable'
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function pingBackendHealth(
  baseUrl: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; latencyMs: number; version?: string; error?: string }> {
  if (!baseUrl.trim()) {
    return {
      ok: false,
      latencyMs: 0,
      error: 'No analytics server URL configured (In-Browser mode active).',
    };
  }
  const t0 = performance.now();
  try {
    const data = await apiRequest<{ status: string; version?: string; ready?: boolean }>(
      baseUrl,
      '/api/health',
      { method: 'GET', signal },
      3500
    );
    if (!data || typeof data !== 'object' || typeof data.status !== 'string') {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - t0),
        error: 'Malformed /api/health payload',
      };
    }
    return {
      ok: (data.status === 'ok' || data.status === 'healthy') && data.ready !== false,
      latencyMs: Math.round(performance.now() - t0),
      version: data.version,
    };
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw err;
    }
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}
