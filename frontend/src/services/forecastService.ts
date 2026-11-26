import type {
  AntecedentWetnessLevel,
  ForecastHorizon,
  Scenario,
  WeatherBundle,
} from '../types/floodforge';

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
  const totalMm = slice.reduce((s, h) => s + h.precipitationMm, 0);
  const peakMmHr = slice.reduce((m, h) => Math.max(m, h.precipitationMm), 0);

  // Use effective storm intensity/duration representation when live forecast is dry
  // so operational screening can still illustrate drainage baselines clearly.
  const effectiveIntensity =
    peakMmHr > 1
      ? Number(Math.max(12, peakMmHr * 1.6).toFixed(1))
      : 12;
  const effectiveDuration =
    totalMm > 5
      ? Number(Math.max(1.5, Math.min(6, totalMm / Math.max(8, effectiveIntensity))).toFixed(1))
      : 1.5;

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
        ? `${horizon}h High-Rainfall Envelope`
        : `${horizon}h Operational Forecast`,
  };
}
