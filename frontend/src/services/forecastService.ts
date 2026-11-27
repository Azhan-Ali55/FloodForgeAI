import type {
  AntecedentWetnessLevel,
  BackendForecastSummary,
  ForecastHorizon,
  OutlookDayPoint,
  Scenario,
  WeatherBundle,
} from '../types/floodforge';
import { apiRequest } from './apiClient';

const VALID_WETNESS = new Set(['dry', 'normal', 'wet', 'saturated', 'unavailable']);

export function validateBackendForecastResponse(raw: unknown): BackendForecastSummary {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Malformed /api/forecast response: expected JSON object');
  }
  const f = raw as Record<string, unknown>;
  if (typeof f.source !== 'string' || f.source === 'unavailable') {
    throw new Error('Backend forecast unavailable');
  }
  if (typeof f.antecedent_wetness !== 'string' || !VALID_WETNESS.has(f.antecedent_wetness)) {
    throw new Error(`Invalid antecedent_wetness from /api/forecast: ${String(f.antecedent_wetness)}`);
  }
  for (const numField of ['peak_6h_total_mm', 'peak_6h_rate_mm_per_hr', 'total_72h_mm', 'peak_1h_mm_per_hr']) {
    const v = f[numField];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new Error(`Invalid numeric field '${numField}' in /api/forecast response`);
    }
  }
  if (f.soil_moisture_0_to_1cm !== null) {
    if (typeof f.soil_moisture_0_to_1cm !== 'number' || !Number.isFinite(f.soil_moisture_0_to_1cm)) {
      throw new Error('Invalid soil_moisture_0_to_1cm in /api/forecast response');
    }
  }
  if (f.hourly_precipitation_mm !== undefined) {
    if (!Array.isArray(f.hourly_precipitation_mm)) {
      throw new Error('Invalid hourly_precipitation_mm in /api/forecast response');
    }
    const hasValidHour = f.hourly_precipitation_mm.some(
      (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0
    );
    if (!hasValidHour && f.hourly_precipitation_mm.length > 0) {
      throw new Error('Backend forecast hourly series has no valid precipitation entries');
    }
  }
  return raw as BackendForecastSummary;
}

export async function fetchBackendForecast(
  apiUrl: string,
  signal?: AbortSignal
): Promise<BackendForecastSummary> {
  const data = await apiRequest<unknown>(apiUrl, '/api/forecast', { method: 'GET', signal }, 7000);
  return validateBackendForecastResponse(data);
}

export function buildScenarioFromBackendForecast(
  forecast: BackendForecastSummary,
  budgetPkr: number,
  horizon: ForecastHorizon = 24
): Scenario {
  let peak6hMm = Math.max(0, forecast.peak_6h_total_mm);
  if (Array.isArray(forecast.hourly_precipitation_mm) && forecast.hourly_precipitation_mm.length > 0) {
    const sliced = forecast.hourly_precipitation_mm
      .slice(0, horizon)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
    if (sliced.length > 0) {
      let best = 0;
      if (sliced.length >= 6) {
        for (let i = 0; i <= sliced.length - 6; i++) {
          let win = 0;
          for (let j = 0; j < 6; j++) win += sliced[i + j];
          if (win > best) best = win;
        }
      } else {
        best = sliced.reduce((a, b) => a + b, 0);
      }
      peak6hMm = best;
    }
  }

  const isDry = peak6hMm < 0.2;
  const rate = isDry ? 0 : Number((peak6hMm / 6).toFixed(2));
  const smLabel =
    forecast.soil_moisture_0_to_1cm !== null
      ? `${forecast.soil_moisture_0_to_1cm.toFixed(3)} m³/m³ ${forecast.antecedent_wetness}`
      : 'soil moisture unavailable';

  return {
    rainfall_mm_per_hr: rate,
    duration_hr: isDry ? 1 : 6,
    budget_pkr: budgetPkr,
    threshold_mm: 50,
    antecedent_wetness:
      forecast.antecedent_wetness === 'unavailable' ? 'normal' : forecast.antecedent_wetness,
    uncertainty_factor: 1.0,
    tag: 'LIVE_FORECAST',
    label: `Live Backend ${horizon}h Forecast (${smLabel})`,
  };
}

/**
 * Formats live 0-9 cm soil moisture status consistently across Dashboard, Telemetry, and Station popups.
 */
export function formatSoilMoistureStatus(
  weather: WeatherBundle,
  backendForecast?: BackendForecastSummary | null
): { wetnessLabel: string; moistureM3: number | null; combinedLabel: string } {
  const backendWet = backendForecast?.antecedent_wetness;
  const rawWetness =
    backendWet && backendWet !== 'unavailable' ? backendWet : deriveWetnessFromWeather(weather);
  const wetnessLabel = rawWetness.charAt(0).toUpperCase() + rawWetness.slice(1);
  const rawVal =
    weather.currentSoilMoisture?.deep3_9cm ??
    backendForecast?.soil_moisture_0_to_1cm ??
    weather.currentSoilMoisture?.top0_1cm ??
    null;
  const moistureM3 = rawVal !== null && Number.isFinite(rawVal) ? rawVal : null;
  return {
    wetnessLabel: backendWet === 'unavailable' && moistureM3 === null ? 'Unavailable' : wetnessLabel,
    moistureM3,
    combinedLabel:
      moistureM3 !== null
        ? `${wetnessLabel} · ${moistureM3.toFixed(2)} m³/m³`
        : 'Soil moisture unavailable',
  };
}

/**
 * Derives operational rainfall scenarios from live or fallback weather bundles.
 */
function deriveWetnessFromWeather(weather: WeatherBundle): AntecedentWetnessLevel {
  const api = weather.api7DayMm;
  const sm = weather.currentSoilMoisture.deep3_9cm;
  if (api > 45 || sm > 0.36) return 'saturated';
  if (api > 22 || sm > 0.28) return 'wet';
  if (api > 8 || sm > 0.18) return 'normal';
  return 'dry';
}

export function buildForecastScenario(
  weather: WeatherBundle,
  horizon: ForecastHorizon,
  budgetPkr: number,
  mode: 'LIVE_FORECAST' | 'UNCERTAINTY_ENVELOPE' = 'LIVE_FORECAST'
): Scenario {
  const slice = weather.hourlyForecast.slice(0, horizon);
  // Mode A rule: compute peak rolling 6-hour accumulation window conserving exact volume
  let peak6hMm = 0;
  for (let i = 0; i <= Math.max(0, slice.length - 6); i++) {
    let win = 0;
    for (let j = 0; j < 6 && i + j < slice.length; j++) {
      win += slice[i + j].precipitationMm;
    }
    if (win > peak6hMm) peak6hMm = win;
  }

  const isDry = peak6hMm < 0.2;
  const effectiveDuration = isDry ? 1 : 6;
  const effectiveIntensity = isDry ? 0 : Number((peak6hMm / 6).toFixed(2));

  const uncertaintyFactor =
    mode === 'UNCERTAINTY_ENVELOPE'
      ? Number((1.18 + (weather.maxProbabilityPct / 100) * 0.22).toFixed(2))
      : 1.0;

  return {
    rainfall_mm_per_hr: effectiveIntensity,
    duration_hr: effectiveDuration,
    budget_pkr: budgetPkr,
    antecedent_wetness: deriveWetnessFromWeather(weather),
    uncertainty_factor: uncertaintyFactor,
    tag: mode,
    label:
      mode === 'UNCERTAINTY_ENVELOPE'
        ? `${horizon}h High-Rainfall Envelope (6h Peak)`
        : `${horizon}h Forecast (Peak 6h Window)`,
  };
}

/**
 * Converts a selected day from the 30-Day Outlook into a 30m D8 screening Scenario,
 * preserving total convective storm volume without artificial minimum inflation.
 */
export function buildScenarioForOutlookDay(
  day: OutlookDayPoint,
  weather: WeatherBundle,
  budgetPkr: number
): Scenario {
  const rainDay = Math.max(0, day.rainfallMm);
  const isDry = rainDay < 0.2;
  // Convective storm window: concentrates ~72% of daily total into a 6h burst without volume inflation
  const effectiveIntensity = isDry ? 0 : Number(((rainDay * 0.72) / 6).toFixed(2));
  const durationHr = isDry ? 1 : 6;

  return {
    rainfall_mm_per_hr: effectiveIntensity,
    duration_hr: durationHr,
    budget_pkr: budgetPkr,
    antecedent_wetness: rainDay >= 60 ? 'wet' : deriveWetnessFromWeather(weather),
    uncertainty_factor: day.tier === 'ENSEMBLE_30D' ? 1.15 : 1.0,
    tag: 'LIVE_FORECAST',
    label: `Day +${day.dayOffset} (${day.dateLabel}) Outlook`,
  };
}
