import type {
  AntecedentWetnessLevel,
  BackendForecastSummary,
  ForecastHorizon,
  OutlookDayPoint,
  Scenario,
  WeatherBundle,
} from '../types/floodforge';
import { apiRequest } from './apiClient';

export async function fetchBackendForecast(
  apiUrl: string
): Promise<BackendForecastSummary> {
  return apiRequest<BackendForecastSummary>(apiUrl, '/api/forecast', { method: 'GET' }, 7000);
}

export function buildScenarioFromBackendForecast(
  forecast: BackendForecastSummary,
  budgetPkr: number
): Scenario {
  const rate =
    forecast.peak_6h_rate_mm_per_hr > 0.1
      ? Number(forecast.peak_6h_rate_mm_per_hr.toFixed(1))
      : 0.5;
  return {
    rainfall_mm_per_hr: rate,
    duration_hr: forecast.peak_6h_total_mm >= 2.0 ? 6 : 1,
    budget_pkr: budgetPkr,
    threshold_mm: 50,
    antecedent_wetness: forecast.antecedent_wetness,
    uncertainty_factor: 1.0,
    tag: 'LIVE_FORECAST',
    label: `Live Forecast (${forecast.soil_moisture_0_to_1cm.toFixed(3)} m³/m³ ${forecast.antecedent_wetness})`,
  };
}

/**
 * Formats live 0-9 cm soil moisture status consistently across Dashboard, Telemetry, and Station popups.
 */
export function formatSoilMoistureStatus(
  weather: WeatherBundle,
  backendForecast?: BackendForecastSummary | null
): { wetnessLabel: string; moistureM3: number; combinedLabel: string } {
  const rawWetness = backendForecast?.antecedent_wetness ?? deriveWetnessFromWeather(weather);
  const wetnessLabel = rawWetness.charAt(0).toUpperCase() + rawWetness.slice(1);
  const rawVal =
    weather.currentSoilMoisture?.deep3_9cm ??
    backendForecast?.soil_moisture_0_to_1cm ??
    weather.currentSoilMoisture?.top0_1cm ??
    0.24;
  const moistureM3 = Number.isFinite(rawVal) ? rawVal : 0.24;
  return {
    wetnessLabel,
    moistureM3,
    combinedLabel: `${wetnessLabel} · ${moistureM3.toFixed(2)} m³/m³`,
  };
}

/**
 * Derives operational rainfall scenarios from live or fallback weather bundles.
 */
export function deriveWetnessFromWeather(weather: WeatherBundle): AntecedentWetnessLevel {
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
  // Mode A rule: compute peak rolling 6-hour accumulation window from Open-Meteo hourly series
  let peak6hMm = 0;
  for (let i = 0; i <= Math.max(0, slice.length - 6); i++) {
    let win = 0;
    for (let j = 0; j < 6 && i + j < slice.length; j++) {
      win += slice[i + j].precipitationMm;
    }
    if (win > peak6hMm) peak6hMm = win;
  }

  // Dry days should stay at dry baseline (no false Critical alerts on 0 mm forecasts)
  const isDry = peak6hMm < 2.0;
  const effectiveDuration = isDry ? 1 : 6;
  const effectiveIntensity = isDry
    ? 0.5
    : Number(Math.max(4, peak6hMm / 6).toFixed(1));

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
 * Converts a selected day from the 30-Day Outlook into a 30m D8 screening Scenario.
 */
export function buildScenarioForOutlookDay(
  day: OutlookDayPoint,
  weather: WeatherBundle,
  budgetPkr: number
): Scenario {
  const rainDay = day.rainfallMm;
  const isDry = rainDay < 2.0;
  // Convective storm window: a daily storm typically concentrates ~70% of volume into a 6h burst
  const effectiveIntensity = isDry
    ? 0.5
    : Number(Math.max(4, (rainDay * 0.72) / 6).toFixed(1));
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
