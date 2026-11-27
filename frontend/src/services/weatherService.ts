import { PILOT_CONFIG } from '../engine/pilotConfig';
import type {
  DailyWeatherPoint,
  EarliestFloodAlert,
  HourlyWeatherPoint,
  OutlookDayPoint,
  StationRiskLevel,
  WeatherBundle,
} from '../types/floodforge';
import { formatPktTime } from '../utils/formatters';

const CACHE_KEY = 'floodforge_weather_cache_v3';
export const MAX_USABLE_CACHE_AGE_HOURS = 12;
const OPEN_METEO_BASE =
  import.meta.env.VITE_OPEN_METEO_URL || 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';

interface OpenMeteoRawResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly: {
    time: number[]; // unix seconds
    precipitation: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    temperature_2m?: Array<number | null>;
    relative_humidity_2m?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    weather_code?: Array<number | null>;
    soil_moisture_0_to_1cm?: Array<number | null>;
    soil_moisture_1_to_3cm?: Array<number | null>;
    soil_moisture_3_to_9cm?: Array<number | null>;
  };
  daily?: {
    time: number[];
    precipitation_sum?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    weather_code?: Array<number | null>;
  };
}

interface OpenMeteoEnsembleResponse {
  daily?: {
    time: number[];
    [key: string]: Array<number | null> | number[];
  };
}

function describeWmoWeatherCode(code: number | null): string {
  if (code === null || !Number.isFinite(code)) return 'Data unavailable';
  if (code === 0) return 'Clear Sky';
  if (code <= 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog / Haze';
  if (code >= 51 && code <= 57) return 'Light Drizzle';
  if (code >= 61 && code <= 63) return 'Moderate Rain';
  if (code >= 65 && code <= 67) return 'Heavy Rain';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

function classifyDailyRainRisk(rainfallMm: number): StationRiskLevel {
  if (rainfallMm >= 65) return 'Critical';
  if (rainfallMm >= 35) return 'High';
  if (rainfallMm >= 15) return 'Moderate';
  return 'Low';
}

function computeEarliestFloodAlert(
  outlook30d: OutlookDayPoint[]
): EarliestFloodAlert | null {
  // First look for High or Critical upcoming flood-triggering rainfall (>= 35 mm/day)
  const severeDay = outlook30d.find((d) => d.rainfallMm >= 35 || d.p90RainfallMm >= 55);
  if (severeDay) {
    const rainDisplay = Math.max(severeDay.rainfallMm, severeDay.p90RainfallMm * 0.85);
    return {
      dayOffset: severeDay.dayOffset,
      dateLabel: severeDay.dateLabel,
      rainfallMm: Number(rainDisplay.toFixed(1)),
      probabilityPct: severeDay.probabilityPct,
      riskLevel: severeDay.riskLevel === 'Low' ? 'High' : severeDay.riskLevel,
      summary: `Advance Flood Watch in ${severeDay.dayOffset} ${severeDay.dayOffset === 1 ? 'day' : 'days'} (${severeDay.dateLabel}): ~${severeDay.rainfallMm.toFixed(0)} mm (${severeDay.probabilityPct}% prob) forecasted.`,
    };
  }
  const modDay = outlook30d.find((d) => d.rainfallMm >= 15);
  if (modDay) {
    return {
      dayOffset: modDay.dayOffset,
      dateLabel: modDay.dateLabel,
      rainfallMm: modDay.rainfallMm,
      probabilityPct: modDay.probabilityPct,
      riskLevel: 'Moderate',
      summary: `Moderate rain advisory in ${modDay.dayOffset} ${modDay.dayOffset === 1 ? 'day' : 'days'} (${modDay.dateLabel}): ${modDay.rainfallMm.toFixed(1)} mm expected.`,
    };
  }
  return null;
}

function computeApi7Day(pastDailyTotals: number[], decayK = 0.85): number {
  let api = 0;
  const n = pastDailyTotals.length;
  for (let i = 0; i < n; i++) {
    const daysAgo = n - i;
    api += Math.pow(decayK, daysAgo) * pastDailyTotals[i];
  }
  return Number(api.toFixed(1));
}

function buildDaily5dSummary(hourlyForecast: HourlyWeatherPoint[]): DailyWeatherPoint[] {
  const days: DailyWeatherPoint[] = [];
  for (let d = 0; d < 5; d++) {
    const slice = hourlyForecast.slice(d * 24, (d + 1) * 24);
    if (slice.length === 0) break;

    const dt = new Date(slice[0].timestampIso);
    const dateLabel = dt.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Karachi',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });

    const temps = slice
      .map((s) => s.temperatureC)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const winds = slice
      .map((s) => s.windSpeedKmh)
      .filter((v): v is number => v !== null && Number.isFinite(v));

    const rainfallMm = Number(
      slice.reduce((acc, s) => acc + s.precipitationMm, 0).toFixed(1)
    );
    const maxProbabilityPct = slice.reduce(
      (mx, s) => Math.max(mx, s.probabilityPct),
      0
    );
    const midCode = slice[Math.min(12, slice.length - 1)]?.weatherCode ?? null;

    days.push({
      dateLabel,
      minTempC: temps.length ? Number(Math.min(...temps).toFixed(1)) : null,
      maxTempC: temps.length ? Number(Math.max(...temps).toFixed(1)) : null,
      avgTempC: temps.length
        ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1))
        : null,
      rainfallMm,
      maxWindKmh: winds.length ? Number(Math.max(...winds).toFixed(1)) : null,
      maxProbabilityPct,
      weatherCode: midCode,
      conditionLabel: describeWmoWeatherCode(midCode),
    });
  }
  return days;
}

function parseEnsembleDays(
  ensemble: OpenMeteoEnsembleResponse | null
): Map<string, { meanMm: number; p90Mm: number; exceedProbPct: number }> {
  const map = new Map<string, { meanMm: number; p90Mm: number; exceedProbPct: number }>();
  if (!ensemble?.daily?.time) return map;

  const times = ensemble.daily.time;
  const memberKeys = Object.keys(ensemble.daily).filter((k) =>
    k.startsWith('precipitation_sum')
  );
  if (memberKeys.length === 0) return map;

  for (let i = 0; i < times.length; i++) {
    const dt = new Date(times[i] * 1000);
    const dateIso = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const vals: number[] = [];
    for (const key of memberKeys) {
      const arr = ensemble.daily[key] as Array<number | null>;
      const v = arr?.[i];
      if (typeof v === 'number' && Number.isFinite(v)) vals.push(Math.max(0, v));
    }
    if (vals.length === 0) continue;
    vals.sort((a, b) => a - b);
    const meanMm = vals.reduce((s, x) => s + x, 0) / vals.length;
    const p90Idx = Math.min(vals.length - 1, Math.floor(vals.length * 0.9));
    const p90Mm = vals[p90Idx];
    const wetMembers = vals.filter((v) => v >= 10).length;
    const exceedProbPct = Math.round((wetMembers / vals.length) * 100);
    map.set(dateIso, {
      meanMm: Number(meanMm.toFixed(1)),
      p90Mm: Number(p90Mm.toFixed(1)),
      exceedProbPct,
    });
  }
  return map;
}

export function parseOpenMeteoResponse(
  raw: OpenMeteoRawResponse,
  ensemble: OpenMeteoEnsembleResponse | null,
  nowMs: number = Date.now()
): WeatherBundle {
  if (
    !raw ||
    !raw.hourly ||
    !Array.isArray(raw.hourly.time) ||
    !Array.isArray(raw.hourly.precipitation) ||
    raw.hourly.time.length === 0 ||
    raw.hourly.precipitation.length === 0
  ) {
    throw new Error('Malformed Open-Meteo response: missing hourly time/precipitation arrays');
  }
  const { hourly, daily } = raw;
  const nowSec = Math.floor(nowMs / 1000);
  const curHourFloorSec = Math.floor(nowMs / 3600_000) * 3600;
  const times = hourly.time;

  let interpolatedCount = 0;
  const cleanNum = (
    arr: Array<number | null> | undefined,
    i: number,
    fallback: number | null,
    clampNonNegative = true
  ): number | null => {
    if (!arr) return fallback;
    const v = arr[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      return clampNonNegative ? Math.max(0, v) : v;
    }
    const prev = i > 0 ? arr[i - 1] : null;
    const next = i < arr.length - 1 ? arr[i + 1] : null;
    if (prev !== null && prev !== undefined && next !== null && next !== undefined) {
      interpolatedCount++;
      const avg = (prev + next) / 2;
      return clampNonNegative ? Math.max(0, avg) : avg;
    }
    return fallback;
  };

  const currentIdx = times.findIndex((t) => t >= curHourFloorSec);
  if (currentIdx === -1) {
    throw new Error('Expired Open-Meteo forecast: all hourly timestamps are elapsed');
  }

  // Aggregate past 7 days daily rainfall
  const pastDailySums: number[] = [];
  const past7DaysDaily: Array<{ day: string; rainfallMm: number }> = [];
  for (let d = 7; d >= 1; d--) {
    const start = Math.max(0, currentIdx - d * 24);
    const end = Math.max(0, currentIdx - (d - 1) * 24);
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += cleanNum(hourly.precipitation, i, 0) ?? 0;
    }
    pastDailySums.push(Number(sum.toFixed(1)));
    const dt = new Date((times[start] ?? nowSec - d * 86400) * 1000);
    past7DaysDaily.push({
      day: dt.toLocaleDateString('en-GB', {
        timeZone: 'Asia/Karachi',
        weekday: 'short',
        day: '2-digit',
      }),
      rainfallMm: Number(sum.toFixed(1)),
    });
  }

  // Extract up to 120h (5-day) future hourly forecast without treating missing precip as zero
  const hourlyForecast: HourlyWeatherPoint[] = [];
  let f24 = 0;
  let f48 = 0;
  let f72 = 0;
  let f120 = 0;
  let peakHourly24h = 0;
  let peakHourly72h = 0;
  let maxProb = 0;
  let missingFuturePrecipCount = 0;
  let validFuturePrecipCount = 0;

  const limit = Math.min(120, times.length - currentIdx);
  for (let h = 0; h < limit; h++) {
    const idx = currentIdx + h;
    const rawP = hourly.precipitation[idx];
    const hasValidP = typeof rawP === 'number' && Number.isFinite(rawP) && rawP >= 0;
    if (hasValidP) {
      validFuturePrecipCount++;
    } else {
      missingFuturePrecipCount++;
    }
    const dt = new Date(times[idx] * 1000);
    const precip = hasValidP ? Number(rawP.toFixed(1)) : 0;
    const prob = Math.round(cleanNum(hourly.precipitation_probability, idx, 0) ?? 0);
    const tempRaw = cleanNum(hourly.temperature_2m, idx, null, false);
    const humRaw = cleanNum(hourly.relative_humidity_2m, idx, null, true);
    const windRaw = cleanNum(hourly.wind_speed_10m, idx, null, true);
    const codeRaw = cleanNum(hourly.weather_code, idx, null, true);
    const smTop = Number((cleanNum(hourly.soil_moisture_0_to_1cm, idx, 0.24) ?? 0.24).toFixed(3));
    const smMid = Number((cleanNum(hourly.soil_moisture_1_to_3cm, idx, 0.26) ?? 0.26).toFixed(3));
    const smDeep = Number((cleanNum(hourly.soil_moisture_3_to_9cm, idx, 0.28) ?? 0.28).toFixed(3));

    if (h < 24) {
      f24 += precip;
      if (precip > peakHourly24h) peakHourly24h = precip;
    }
    if (h < 48) f48 += precip;
    if (h < 72) f72 += precip;
    f120 += precip;
    if (h < 72 && precip > peakHourly72h) peakHourly72h = precip;
    if (h < 72 && prob > maxProb) maxProb = prob;

    const label = dt.toLocaleString('en-GB', {
      timeZone: 'Asia/Karachi',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    hourlyForecast.push({
      timestampIso: dt.toISOString(),
      label,
      hourOffset: h + 1,
      precipitationMm: precip,
      probabilityPct: prob,
      temperatureC: tempRaw !== null ? Number(tempRaw.toFixed(1)) : null,
      humidityPct: humRaw !== null ? Math.round(humRaw) : null,
      windSpeedKmh: windRaw !== null ? Number(windRaw.toFixed(1)) : null,
      weatherCode: codeRaw !== null ? Math.round(codeRaw) : null,
      soilMoistureTop: smTop,
      soilMoistureMid: smMid,
      soilMoistureDeep: smDeep,
      isHistorical: false,
    });
  }

  if (validFuturePrecipCount === 0) {
    throw new Error('Open-Meteo future precipitation series contains no valid values');
  }

  // Build 30-Day Outlook combining 16-Day Open-Meteo Daily + Days 17..30 Ensemble
  const ensembleMap = parseEnsembleDays(ensemble);
  const outlook30d: OutlookDayPoint[] = [];
  const todayIso = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

  // Index daily 16-day forecast starting from today
  const dailyMap = new Map<
    string,
    {
      rain: number;
      prob: number;
      tMax: number | null;
      tMin: number | null;
      code: number | null;
    }
  >();
  if (daily?.time) {
    for (let i = 0; i < daily.time.length; i++) {
      const dIso = new Date(daily.time[i] * 1000).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Karachi',
      });
      if (dIso < todayIso) continue;
      dailyMap.set(dIso, {
        rain: Number((cleanNum(daily.precipitation_sum, i, 0) ?? 0).toFixed(1)),
        prob: Math.round(cleanNum(daily.precipitation_probability_max, i, 0) ?? 0),
        tMax: cleanNum(daily.temperature_2m_max, i, null, false),
        tMin: cleanNum(daily.temperature_2m_min, i, null, false),
        code: cleanNum(daily.weather_code, i, null, true),
      });
    }
  }

  const baseDate = new Date(nowMs);
  let hasEnsembleTail = false;
  const maxEnsDays = ensembleMap.size > 0 ? Math.min(35, 16 + ensembleMap.size) : 16;
  const totalOutlookDays = ensembleMap.size > 0 ? Math.max(30, maxEnsDays) : 16;

  for (let d = 0; d < totalOutlookDays; d++) {
    const dt = new Date(baseDate.getTime() + d * 86400_000);
    const dateIso = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const dateLabel = dt.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Karachi',
      day: '2-digit',
      month: 'short',
    });
    const monthYearLabel = dt.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Karachi',
      month: 'short',
      year: 'numeric',
    });

    const d16 = dailyMap.get(dateIso);
    const ens = ensembleMap.get(dateIso);
    if (d >= 16 && ens) hasEnsembleTail = true;

    const tier: OutlookDayPoint['tier'] =
      d < 5 ? 'HIGH_PRECISION_5D' : d < 16 && d16 ? 'MEDIUM_RANGE_16D' : 'ENSEMBLE_30D';

    let isAvailable = false;
    let confidenceTier: OutlookDayPoint['confidenceTier'] = 'UNAVAILABLE';
    let confidenceLabel = 'Unavailable';
    let rainfallMm = 0;
    let p90RainfallMm = 0;
    let probabilityPct = 0;
    let minTempC: number | null = null;
    let maxTempC: number | null = null;
    let weatherCode: number | null = null;

    if (d16 && d < 16) {
      isAvailable = true;
      confidenceTier = d < 5 ? 'HIGHER' : 'LOWER';
      confidenceLabel = 'Confidence unavailable';
      rainfallMm = d16.rain;
      p90RainfallMm = ens ? Math.max(d16.rain, ens.p90Mm) : Number((d16.rain * 1.25).toFixed(1));
      probabilityPct = d16.prob;
      minTempC = d16.tMin !== null ? Number(d16.tMin.toFixed(1)) : null;
      maxTempC = d16.tMax !== null ? Number(d16.tMax.toFixed(1)) : null;
      weatherCode = d16.code !== null ? Math.round(d16.code) : null;
    } else if (ens) {
      isAvailable = true;
      confidenceTier = 'EXPERIMENTAL';
      confidenceLabel = 'Experimental long-range (confidence unavailable)';
      rainfallMm = ens.meanMm;
      p90RainfallMm = ens.p90Mm;
      probabilityPct = Math.max(0, ens.exceedProbPct);
      weatherCode = rainfallMm > 15 ? 63 : rainfallMm > 3 ? 61 : 2;
    } else {
      isAvailable = false;
      confidenceTier = 'UNAVAILABLE';
      confidenceLabel = 'Unavailable';
      rainfallMm = 0;
      p90RainfallMm = 0;
      probabilityPct = 0;
      weatherCode = null;
    }

    outlook30d.push({
      dayOffset: d + 1,
      dateIso,
      dateLabel,
      monthYearLabel,
      isAvailable,
      confidenceTier,
      confidenceLabel,
      rainfallMm,
      p90RainfallMm,
      probabilityPct,
      minTempC,
      maxTempC,
      weatherCode,
      conditionLabel: isAvailable ? describeWmoWeatherCode(weatherCode) : 'Data unavailable',
      tier,
      riskLevel: classifyDailyRainRisk(rainfallMm),
    });
  }

  const forecast16dMm = Number(
    outlook30d.slice(0, 16).reduce((s, d) => s + d.rainfallMm, 0).toFixed(1)
  );
  const forecast30dMm = Number(
    outlook30d.reduce((s, d) => s + d.rainfallMm, 0).toFixed(1)
  );

  const curSm = {
    top0_1cm: Number(
      (cleanNum(hourly.soil_moisture_0_to_1cm, currentIdx, 0.23) ?? 0.23).toFixed(3)
    ),
    mid1_3cm: Number(
      (cleanNum(hourly.soil_moisture_1_to_3cm, currentIdx, 0.25) ?? 0.25).toFixed(3)
    ),
    deep3_9cm: Number(
      (cleanNum(hourly.soil_moisture_3_to_9cm, currentIdx, 0.27) ?? 0.27).toFixed(3)
    ),
  };

  const curTemp = cleanNum(hourly.temperature_2m, currentIdx, null, false);
  const curHum = cleanNum(hourly.relative_humidity_2m, currentIdx, null, true);
  const curWind = cleanNum(hourly.wind_speed_10m, currentIdx, null, true);
  const curPrecipRaw = hourly.precipitation[currentIdx];
  const curPrecip =
    typeof curPrecipRaw === 'number' && Number.isFinite(curPrecipRaw) && curPrecipRaw >= 0
      ? curPrecipRaw
      : null;
  const curCode = cleanNum(hourly.weather_code, currentIdx, null, true);
  const curCodeInt = curCode !== null ? Math.round(curCode) : null;

  const coveragePct = Number(((validFuturePrecipCount / Math.max(1, limit)) * 100).toFixed(1));
  const forecastState: WeatherBundle['forecastState'] =
    missingFuturePrecipCount === 0 && limit >= 24 ? 'verified' : 'stale';

  const now = new Date(nowMs);
  return {
    source: 'OPEN_METEO_LIVE',
    forecastState,
    outlookSource: hasEnsembleTail ? 'OPEN_METEO_16D_ENSEMBLE' : 'OPEN_METEO_16D_ONLY',
    isStale: missingFuturePrecipCount > 0 || limit < 24,
    cacheAgeHours: 0,
    coveragePct,
    missingHoursCount: missingFuturePrecipCount,
    fetchedAtIso: now.toISOString(),
    fetchedAtPkt: formatPktTime(now),
    lat: raw.latitude ?? PILOT_CONFIG.weather.lat,
    lon: raw.longitude ?? PILOT_CONFIG.weather.lon,
    timezone: 'Asia/Karachi',
    api7DayMm: computeApi7Day(pastDailySums),
    past7DayTotalMm: Number(pastDailySums.reduce((a, b) => a + b, 0).toFixed(1)),
    forecast24hMm: Number(f24.toFixed(1)),
    forecast48hMm: Number(f48.toFixed(1)),
    forecast72hMm: Number(f72.toFixed(1)),
    forecast120hMm: Number(f120.toFixed(1)),
    forecast16dMm,
    forecast30dMm,
    peakHourly24hMm: Number(peakHourly24h.toFixed(1)),
    peakHourlyMm: Number(peakHourly72h.toFixed(1)),
    maxProbabilityPct: maxProb,
    currentWeather: {
      temperatureC: curTemp !== null ? Number(curTemp.toFixed(1)) : null,
      humidityPct: curHum !== null ? Math.round(curHum) : null,
      windSpeedKmh: curWind !== null ? Number(curWind.toFixed(1)) : null,
      precipitationMm: curPrecip !== null ? Number(curPrecip.toFixed(1)) : null,
      weatherCode: curCodeInt,
      conditionLabel: describeWmoWeatherCode(curCodeInt),
    },
    currentSoilMoisture: curSm,
    hourlyForecast,
    dailyForecast5d: buildDaily5dSummary(hourlyForecast),
    outlook30d,
    earliestFloodAlert: computeEarliestFloodAlert(outlook30d),
    past7DaysDaily,
    validationStatus:
      interpolatedCount > 0 || missingFuturePrecipCount > 0 ? 'INTERPOLATED_GAPS' : 'VALIDATED',
  };
}

function buildOutlookFallback(
  hourlyForecast: HourlyWeatherPoint[],
  monsoonStressMode = false
): OutlookDayPoint[] {
  const now = new Date();
  const out: OutlookDayPoint[] = [];

  for (let d = 0; d < 30; d++) {
    const dt = new Date(now.getTime() + d * 86400_000);
    const dateIso = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const dateLabel = dt.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Karachi',
      day: '2-digit',
      month: 'short',
    });

    let rain = 0;
    let p90 = 0;
    let prob = 18;

    if (d < 5) {
      const slice = hourlyForecast.slice(d * 24, (d + 1) * 24);
      rain = Number(slice.reduce((s, p) => s + p.precipitationMm, 0).toFixed(1));
      p90 = Number((rain * 1.22).toFixed(1));
      prob = slice.reduce((m, p) => Math.max(m, p.probabilityPct), 20);
    } else if (monsoonStressMode) {
      // Realistic 30-day monsoon wave: watch on Day 12 (78 mm) & severe storm on Day 22 (132 mm)
      const wave1 = 78 * Math.exp(-Math.pow((d - 11) / 1.4, 2));
      const wave2 = 132 * Math.exp(-Math.pow((d - 21) / 1.5, 2));
      const bg = 4.5 + 3.5 * Math.sin(d * 0.7);
      rain = Number(Math.max(0, wave1 + wave2 + bg).toFixed(1));
      p90 = Number((rain * 1.28).toFixed(1));
      prob = Math.min(92, Math.round(25 + rain * 0.55));
    } else {
      const pulse = d === 9 ? 28.4 : d === 10 ? 16.2 : d === 19 ? 44.5 : d === 20 ? 22.0 : 2.5;
      rain = pulse;
      p90 = Number((pulse * 1.3).toFixed(1));
      prob = pulse > 20 ? 74 : 22;
    }

    const tier: OutlookDayPoint['tier'] =
      d < 5 ? 'HIGH_PRECISION_5D' : d < 16 ? 'MEDIUM_RANGE_16D' : 'ENSEMBLE_30D';
    const wCode = rain > 40 ? 65 : rain > 15 ? 61 : rain > 3 ? 51 : 2;

    const monthYearLabel = dt.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Karachi',
      month: 'short',
      year: 'numeric',
    });
    out.push({
      dayOffset: d + 1,
      dateIso,
      dateLabel,
      monthYearLabel,
      isAvailable: monsoonStressMode,
      confidenceTier: monsoonStressMode ? 'EXPERIMENTAL' : 'UNAVAILABLE',
      confidenceLabel: monsoonStressMode ? 'Simulated stress test' : 'Unavailable',
      rainfallMm: rain,
      p90RainfallMm: p90,
      probabilityPct: prob,
      minTempC: 19,
      maxTempC: 29,
      weatherCode: wCode,
      conditionLabel: describeWmoWeatherCode(wCode),
      tier,
      riskLevel: classifyDailyRainRisk(rain),
    });
  }
  return out;
}

/**
 * Deterministic demonstration / stress-test weather bundle (tagged clearly).
 */
export function createDeterministicFallbackWeather(
  monsoonStressMode = false
): WeatherBundle {
  const now = new Date();
  const pastDailySums = monsoonStressMode
    ? [18.5, 29.0, 12.4, 34.2, 41.0, 16.5, 22.8]
    : [4.2, 11.8, 0.0, 18.4, 24.6, 8.1, 14.2];
  const past7DaysDaily = pastDailySums.map((val, idx) => {
    const d = new Date(now.getTime() - (7 - idx) * 86400_000);
    return {
      day: d.toLocaleDateString('en-GB', {
        timeZone: 'Asia/Karachi',
        weekday: 'short',
        day: '2-digit',
      }),
      rainfallMm: val,
    };
  });

  const hourlyForecast: HourlyWeatherPoint[] = [];
  let f24 = 0;
  let f48 = 0;
  let f72 = 0;
  let f120 = 0;
  let peakHourly24h = 0;
  let peakHourly = 0;
  let maxProb = 0;

  for (let h = 0; h < 120; h++) {
    const mult = monsoonStressMode ? 1.55 : 1.0;
    const pulse1 = 16.5 * mult * Math.exp(-Math.pow((h - 14) / 3.8, 2));
    const pulse2 = 9.2 * mult * Math.exp(-Math.pow((h - 39) / 4.5, 2));
    const pulse3 = 5.4 * mult * Math.exp(-Math.pow((h - 61) / 5.0, 2));
    const pulse4 = 7.8 * mult * Math.exp(-Math.pow((h - 92) / 4.2, 2));
    const precip = Number(Math.max(0, pulse1 + pulse2 + pulse3 + pulse4).toFixed(1));
    const prob = Math.min(92, Math.round(18 + precip * 4.1));
    const temp = Number(
      (21.5 + 4.8 * Math.sin(((h + 8) / 24) * Math.PI * 2) - precip * 0.14).toFixed(1)
    );
    const humidity = Math.min(
      95,
      Math.max(42, Math.round(58 + precip * 1.8 - 6 * Math.sin(((h + 8) / 24) * Math.PI * 2)))
    );
    const wind = Number((9.5 + 5.5 * Math.sin(h * 0.35) + precip * 0.7).toFixed(1));
    const weatherCode = precip > 10 ? 65 : precip > 3 ? 61 : precip > 0.5 ? 51 : 2;
    const smTop = Number((0.26 + Math.min(0.14, precip * 0.008)).toFixed(3));
    const smMid = Number((0.28 + Math.min(0.12, precip * 0.006)).toFixed(3));
    const smDeep = monsoonStressMode ? 0.365 : 0.305;

    if (h < 24) {
      f24 += precip;
      if (precip > peakHourly24h) peakHourly24h = precip;
    }
    if (h < 48) f48 += precip;
    if (h < 72) f72 += precip;
    f120 += precip;
    if (h < 72 && precip > peakHourly) peakHourly = precip;
    if (h < 72 && prob > maxProb) maxProb = prob;

    const dt = new Date(now.getTime() + (h + 1) * 3600_000);
    hourlyForecast.push({
      timestampIso: dt.toISOString(),
      label: dt.toLocaleString('en-GB', {
        timeZone: 'Asia/Karachi',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      hourOffset: h + 1,
      precipitationMm: precip,
      probabilityPct: prob,
      temperatureC: temp,
      humidityPct: humidity,
      windSpeedKmh: wind,
      weatherCode,
      soilMoistureTop: smTop,
      soilMoistureMid: smMid,
      soilMoistureDeep: smDeep,
      isHistorical: false,
    });
  }

  const outlook30d = buildOutlookFallback(hourlyForecast, monsoonStressMode);
  const first = hourlyForecast[0];
  return {
    source: 'SYNTHETIC_DEMO',
    forecastState: monsoonStressMode ? 'simulated' : 'unavailable',
    outlookSource: monsoonStressMode ? 'MONSOON_STRESS_TEST' : 'FALLBACK_DATA',
    isStale: !monsoonStressMode,
    cacheAgeHours: 0,
    coveragePct: monsoonStressMode ? 100 : 0,
    missingHoursCount: 0,
    fetchedAtIso: now.toISOString(),
    fetchedAtPkt: formatPktTime(now),
    lat: PILOT_CONFIG.weather.lat,
    lon: PILOT_CONFIG.weather.lon,
    timezone: 'Asia/Karachi',
    api7DayMm: computeApi7Day(pastDailySums),
    past7DayTotalMm: Number(pastDailySums.reduce((a, b) => a + b, 0).toFixed(1)),
    forecast24hMm: Number(f24.toFixed(1)),
    forecast48hMm: Number(f48.toFixed(1)),
    forecast72hMm: Number(f72.toFixed(1)),
    forecast120hMm: Number(f120.toFixed(1)),
    forecast16dMm: Number(outlook30d.slice(0, 16).reduce((s, d) => s + d.rainfallMm, 0).toFixed(1)),
    forecast30dMm: Number(outlook30d.reduce((s, d) => s + d.rainfallMm, 0).toFixed(1)),
    peakHourly24hMm: Number(peakHourly24h.toFixed(1)),
    peakHourlyMm: Number(peakHourly.toFixed(1)),
    maxProbabilityPct: maxProb,
    currentWeather: {
      temperatureC: first?.temperatureC ?? 22.4,
      humidityPct: first?.humidityPct ?? 64,
      windSpeedKmh: first?.windSpeedKmh ?? 11.2,
      precipitationMm: first?.precipitationMm ?? 0,
      weatherCode: first?.weatherCode ?? 2,
      conditionLabel: describeWmoWeatherCode(first?.weatherCode ?? 2),
    },
    currentSoilMoisture: {
      top0_1cm: monsoonStressMode ? 0.342 : 0.278,
      mid1_3cm: monsoonStressMode ? 0.354 : 0.292,
      deep3_9cm: monsoonStressMode ? 0.365 : 0.305,
    },
    hourlyForecast,
    dailyForecast5d: buildDaily5dSummary(hourlyForecast),
    outlook30d,
    earliestFloodAlert: computeEarliestFloodAlert(outlook30d),
    past7DaysDaily,
    validationStatus: 'FALLBACK_DATA',
  };
}

/**
 * Historical July 2001 Islamabad-Rawalpindi Cloudburst weather replay.
 * Covers 16 Jul 2001 (dayOffset=0) through 27 Jul 2001 (dayOffset=11),
 * defaulting to 23 Jul 2001 09:00 PKT (dayOffset=7, hourOfDay=9) at storm peak.
 */
const HISTORIC_2001_DAILY_TOTALS_MM: Record<number, number> = {
  // Preceding 7 days (09 Jul -> 15 Jul, indices -7..-1 relative to 16 Jul)
  [-7]: 0.0,
  [-6]: 2.4,
  [-5]: 0.0,
  [-4]: 6.0,
  [-3]: 4.5,
  [-2]: 11.2,
  [-1]: 8.5,
  // Interactive window: 16 Jul (0) -> 27 Jul (11)
  0: 0.0, // 16 Jul: Dry pre-monsoon day (zero flood risk)
  1: 2.0, // 17 Jul: Isolated light sprinkle (zero flood risk)
  2: 0.0, // 18 Jul: Clear break before monsoon trough (zero flood risk)
  3: 14.0, // 19 Jul: Initial light monsoon showers
  4: 28.0, // 20 Jul: Moderate showers building soil wetness
  5: 52.0, // 21 Jul: Steady monsoon inflow (Advisory / Watch threshold)
  6: 88.0, // 22 Jul: Heavy pre-cloudburst soaking (Watch / Warning)
  7: 620.0, // 23 Jul: Historic 620 mm / 10h Cloudburst (06:00-15:00 PKT)
  8: 24.0, // 24 Jul: Post-storm tapering showers
  9: 8.0, // 25 Jul: Light residual rain
  10: 0.0, // 26 Jul: Dry recovery day (zero flood risk)
  11: 0.0, // 27 Jul: Clear recovery day (zero flood risk)
};

const STORM_CORE_23_JUL_MM = [36, 54, 72, 88, 84, 76, 68, 58, 48, 36]; // sums to 620.0 mm (hours 06..15)

function getHistoric2001HourlyPrecip(relDay: number, hour: number): number {
  if (relDay === 7) {
    if (hour >= 6 && hour <= 15) {
      return STORM_CORE_23_JUL_MM[hour - 6];
    }
    return 0.0;
  }
  const dayTotal = HISTORIC_2001_DAILY_TOTALS_MM[relDay] ?? (relDay >= 12 && relDay <= 18 ? 4.0 : 0.0);
  if (dayTotal <= 0) return 0.0;
  // Distribute daily total realistically across afternoon/evening convective hours (12..21 PKT)
  const weights = Array.from({ length: 24 }, (_, h) => {
    if (relDay === 6 && h >= 18) return 2.2; // 22 Jul evening intensification into 23 Jul
    if (h >= 13 && h <= 20) return 1.6;
    if (h >= 6 && h <= 12) return 0.65;
    return 0.25;
  });
  const wSum = weights.reduce((a, b) => a + b, 0);
  return Number(((dayTotal * weights[hour]) / wSum).toFixed(1));
}

export function create2001CloudburstWeather(dayOffset = 7, hourOfDay = 9): WeatherBundle {
  const safeDay = Math.max(0, Math.min(11, Math.round(dayOffset)));
  const safeHour = Math.max(0, Math.min(23, Math.round(hourOfDay)));

  // Reference instant in UTC corresponding to Asia/Karachi (+05:00) on 16 Jul 2001 + safeDay + safeHour
  const jul16MidnightPktMs = Date.UTC(2001, 6, 16, 0, 0, 0) - 5 * 3600_000;
  const selectedMs = jul16MidnightPktMs + (safeDay * 24 + safeHour) * 3600_000;
  const selectedDateObj = new Date(selectedMs);

  // Past 7 calendar days preceding the selected day
  const pastDailySums: number[] = [];
  const past7DaysDaily: Array<{ day: string; rainfallMm: number }> = [];
  for (let d = 7; d >= 1; d--) {
    const targetRelDay = safeDay - d;
    let sum = 0;
    for (let h = 0; h < 24; h++) {
      sum += getHistoric2001HourlyPrecip(targetRelDay, h);
    }
    const rounded = Number(sum.toFixed(1));
    pastDailySums.push(rounded);
    const dt = new Date(jul16MidnightPktMs + targetRelDay * 86400_000);
    past7DaysDaily.push({
      day: dt.toLocaleDateString('en-GB', {
        timeZone: 'Asia/Karachi',
        weekday: 'short',
        day: '2-digit',
      }),
      rainfallMm: rounded,
    });
  }

  const api7 = computeApi7Day(pastDailySums);
  const currentPrecip = getHistoric2001HourlyPrecip(safeDay, safeHour);
  const dynamicDeepSm = Number(
    Math.min(
      0.44,
      Math.max(
        0.16,
        0.155 + (api7 / 180) * 0.16 + Math.min(0.14, currentPrecip * 0.004) + (safeDay === 7 && safeHour >= 6 && safeHour <= 20 ? 0.14 : 0)
      )
    ).toFixed(3)
  );
  const dynamicMidSm = Number(Math.min(0.445, dynamicDeepSm + (currentPrecip > 5 ? 0.008 : -0.005)).toFixed(3));
  const dynamicTopSm = Number(Math.min(0.45, dynamicMidSm + (currentPrecip > 10 ? 0.01 : -0.006)).toFixed(3));

  const hourlyForecast: HourlyWeatherPoint[] = [];
  let f24 = 0;
  let f48 = 0;
  let f72 = 0;
  let f120 = 0;
  let peakHourly24h = 0;
  let peakHourly = 0;
  let maxProb = 0;

  for (let h = 0; h < 120; h++) {
    const totalHoursFromJul16 = safeDay * 24 + safeHour + h;
    const rDay = Math.floor(totalHoursFromJul16 / 24);
    const rHour = totalHoursFromJul16 % 24;
    const precip = getHistoric2001HourlyPrecip(rDay, rHour);
    const prob = precip >= 25 ? 100 : precip >= 5 ? 82 : precip > 0.5 ? 55 : 15;
    const temp = Number(
      (28.5 + 4.2 * Math.sin(((rHour - 9) / 24) * Math.PI * 2) - Math.min(4.2, precip * 0.045)).toFixed(1)
    );
    const humidity = Math.min(96, Math.max(38, Math.round(46 + (dynamicDeepSm - 0.16) * 110 + Math.min(28, precip * 1.1))));
    const wind = precip >= 30 ? Number((26 + precip * 0.16).toFixed(1)) : Number((9.5 + precip * 0.6).toFixed(1));
    const weatherCode = precip >= 30 ? 95 : precip >= 4 ? 65 : precip >= 0.5 ? 61 : 1;

    if (h < 24) {
      f24 += precip;
      if (precip > peakHourly24h) peakHourly24h = precip;
    }
    if (h < 48) f48 += precip;
    if (h < 72) f72 += precip;
    f120 += precip;
    if (h < 72 && precip > peakHourly) peakHourly = precip;
    if (h < 72 && prob > maxProb) maxProb = prob;

    const dt = new Date(selectedMs + h * 3600_000);
    hourlyForecast.push({
      timestampIso: dt.toISOString(),
      label: dt.toLocaleString('en-GB', {
        timeZone: 'Asia/Karachi',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      hourOffset: h + 1,
      precipitationMm: precip,
      probabilityPct: prob,
      temperatureC: temp,
      humidityPct: humidity,
      windSpeedKmh: wind,
      weatherCode,
      soilMoistureTop: dynamicTopSm,
      soilMoistureMid: dynamicMidSm,
      soilMoistureDeep: dynamicDeepSm,
      isHistorical: true,
    });
  }

  const dailyForecast5d: DailyWeatherPoint[] = buildDaily5dSummary(hourlyForecast).map(
    (day) =>
      day.rainfallMm >= 200
        ? { ...day, weatherCode: 95, conditionLabel: 'Extreme Cloudburst' }
        : day
  );

  const outlook30d: OutlookDayPoint[] = Array.from({ length: 30 }, (_, d) => {
    const rDay = safeDay + d;
    const dt = new Date(jul16MidnightPktMs + rDay * 86400_000);
    let rain = 0;
    for (let h = 0; h < 24; h++) {
      rain += getHistoric2001HourlyPrecip(rDay, h);
    }
    rain = Number(rain.toFixed(1));
    const p90 = Number((rain * 1.15).toFixed(1));
    const wCode = rain >= 100 ? 95 : rain >= 15 ? 61 : rain > 1 ? 51 : 1;
    const monthYearLabel = dt.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Karachi',
      month: 'short',
      year: 'numeric',
    });
    return {
      dayOffset: d + 1,
      dateIso: dt.toISOString().slice(0, 10),
      dateLabel: dt.toLocaleDateString('en-GB', {
        timeZone: 'Asia/Karachi',
        day: '2-digit',
        month: 'short',
      }),
      monthYearLabel,
      isAvailable: true,
      confidenceTier: 'EXPERIMENTAL',
      confidenceLabel: 'Historical archive',
      rainfallMm: rain,
      p90RainfallMm: p90,
      probabilityPct: rain >= 100 ? 100 : rain >= 15 ? 78 : rain > 1 ? 45 : 15,
      minTempC: 24,
      maxTempC: rain >= 100 ? 29 : 34,
      weatherCode: wCode,
      conditionLabel: rain >= 100 ? 'Extreme Cloudburst' : describeWmoWeatherCode(wCode),
      tier: d < 5 ? 'HIGH_PRECISION_5D' : d < 16 ? 'MEDIUM_RANGE_16D' : 'ENSEMBLE_30D',
      riskLevel: classifyDailyRainRisk(rain),
    };
  });

  const cur = hourlyForecast[0];
  const pktFormatted = selectedDateObj.toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(',', '');

  return {
    source: 'SYNTHETIC_DEMO',
    forecastState: 'simulated',
    outlookSource: 'HISTORICAL_2001_CLOUDBURST',
    isStale: false,
    cacheAgeHours: 0,
    coveragePct: 100,
    missingHoursCount: 0,
    fetchedAtIso: selectedDateObj.toISOString(),
    fetchedAtPkt: `${pktFormatted} PKT`,
    lat: PILOT_CONFIG.weather.lat,
    lon: PILOT_CONFIG.weather.lon,
    timezone: 'Asia/Karachi',
    api7DayMm: api7,
    past7DayTotalMm: Number(pastDailySums.reduce((a, b) => a + b, 0).toFixed(1)),
    forecast24hMm: Number(f24.toFixed(1)),
    forecast48hMm: Number(f48.toFixed(1)),
    forecast72hMm: Number(f72.toFixed(1)),
    forecast120hMm: Number(f120.toFixed(1)),
    forecast16dMm: Number(outlook30d.slice(0, 16).reduce((s, d) => s + d.rainfallMm, 0).toFixed(1)),
    forecast30dMm: Number(outlook30d.reduce((s, d) => s + d.rainfallMm, 0).toFixed(1)),
    peakHourly24hMm: Number(peakHourly24h.toFixed(1)),
    peakHourlyMm: Number(peakHourly.toFixed(1)),
    maxProbabilityPct: maxProb,
    currentWeather: {
      temperatureC: cur?.temperatureC ?? 26.8,
      humidityPct: cur?.humidityPct ?? 65,
      windSpeedKmh: cur?.windSpeedKmh ?? 12.0,
      precipitationMm: cur?.precipitationMm ?? 0,
      weatherCode: cur?.weatherCode ?? 1,
      conditionLabel:
        (cur?.precipitationMm ?? 0) >= 30
          ? 'Extreme Cloudburst'
          : describeWmoWeatherCode(cur?.weatherCode ?? 1),
    },
    currentSoilMoisture: {
      top0_1cm: dynamicTopSm,
      mid1_3cm: dynamicMidSm,
      deep3_9cm: dynamicDeepSm,
    },
    hourlyForecast,
    dailyForecast5d,
    outlook30d,
    earliestFloodAlert: computeEarliestFloodAlert(outlook30d),
    past7DaysDaily,
    validationStatus: 'VALIDATED',
  };
}

let inflightWeatherPromise: Promise<WeatherBundle> | null = null;

function isCachedWeatherUsable(parsed: WeatherBundle, maxAgeHours: number, nowMs = Date.now()): boolean {
  if (!parsed || typeof parsed.fetchedAtIso !== 'string' || !Array.isArray(parsed.hourlyForecast)) {
    return false;
  }
  const ageHours = (nowMs - new Date(parsed.fetchedAtIso).getTime()) / 3600_000;
  if (!Number.isFinite(ageHours) || ageHours < 0 || ageHours > maxAgeHours) {
    return false;
  }
  const lastHour = parsed.hourlyForecast[parsed.hourlyForecast.length - 1];
  if (!lastHour || new Date(lastHour.timestampIso).getTime() <= nowMs) {
    return false;
  }
  return Array.isArray(parsed.outlook30d) && parsed.outlook30d.length >= 16;
}

export async function fetchNullahLaiWeather(
  forceRefresh = false,
  signal?: AbortSignal
): Promise<WeatherBundle> {
  if (!forceRefresh) {
    try {
      const rawCache = localStorage.getItem(CACHE_KEY);
      if (rawCache) {
        const parsed = JSON.parse(rawCache) as WeatherBundle;
        const ageHours = (Date.now() - new Date(parsed.fetchedAtIso).getTime()) / 3600_000;
        if (ageHours < 0.5 && parsed.source === 'OPEN_METEO_LIVE' && isCachedWeatherUsable(parsed, MAX_USABLE_CACHE_AGE_HOURS)) {
          return {
            ...parsed,
            forecastState: parsed.forecastState ?? 'verified',
            peakHourly24hMm: parsed.peakHourly24hMm ?? parsed.peakHourlyMm,
            coveragePct: parsed.coveragePct ?? 100,
            missingHoursCount: parsed.missingHoursCount ?? 0,
          };
        }
        if (!isCachedWeatherUsable(parsed, MAX_USABLE_CACHE_AGE_HOURS)) {
          localStorage.removeItem(CACHE_KEY);
        }
      }
    } catch {
      // ignore storage errors
    }
    if (inflightWeatherPromise) return inflightWeatherPromise;
  }

  const runFetch = async (): Promise<WeatherBundle> => {
    const forecastParams = new URLSearchParams({
      latitude: String(PILOT_CONFIG.weather.lat),
      longitude: String(PILOT_CONFIG.weather.lon),
      hourly:
        'precipitation,precipitation_probability,temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm',
      daily:
        'precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,weather_code',
      past_days: String(PILOT_CONFIG.weather.past_days),
      forecast_days: '16',
      timezone: PILOT_CONFIG.weather.timezone,
      timeformat: 'unixtime',
      cell_selection: 'land',
    });

    const ensembleParams = new URLSearchParams({
      latitude: String(PILOT_CONFIG.weather.lat),
      longitude: String(PILOT_CONFIG.weather.lon),
      models: 'gfs_seamless',
      daily: 'precipitation_sum',
      forecast_days: '35',
      timezone: PILOT_CONFIG.weather.timezone,
      timeformat: 'unixtime',
    });

    try {
      const controller = new AbortController();
      const onExtAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onExtAbort, { once: true });
      }
      const timer = setTimeout(() => controller.abort(), 7000);

      let forecastRes: Response;
      let ensembleRes: Response | null;
      try {
        [forecastRes, ensembleRes] = await Promise.all([
          fetch(`${OPEN_METEO_BASE}?${forecastParams.toString()}`, { signal: controller.signal }),
          fetch(`${OPEN_METEO_ENSEMBLE_URL}?${ensembleParams.toString()}`, {
            signal: controller.signal,
          }).catch(() => null),
        ]);
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onExtAbort);
      }

      if (!forecastRes.ok) throw new Error(`Open-Meteo HTTP ${forecastRes.status}`);

      const raw = (await forecastRes.json()) as OpenMeteoRawResponse;
      let ensembleJson: OpenMeteoEnsembleResponse | null = null;
      if (ensembleRes && ensembleRes.ok) {
        ensembleJson = (await ensembleRes.json().catch(() => null)) as OpenMeteoEnsembleResponse | null;
      }

      const bundle = parseOpenMeteoResponse(raw, ensembleJson);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
      } catch {
        // ignore storage quota
      }
      return bundle;
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        throw err;
      }
      try {
        const rawCache = localStorage.getItem(CACHE_KEY);
        if (rawCache) {
          const cached = JSON.parse(rawCache) as WeatherBundle;
          if (isCachedWeatherUsable(cached, MAX_USABLE_CACHE_AGE_HOURS)) {
            const ageHours = Number(
              ((Date.now() - new Date(cached.fetchedAtIso).getTime()) / 3600_000).toFixed(1)
            );
            return {
              ...cached,
              source: 'LOCAL_CACHE_FALLBACK',
              forecastState: 'stale',
              isStale: true,
              cacheAgeHours: ageHours,
              peakHourly24hMm: cached.peakHourly24hMm ?? cached.peakHourlyMm,
              coveragePct: cached.coveragePct ?? 100,
              missingHoursCount: cached.missingHoursCount ?? 0,
            };
          }
          // Purge expired cache so stale past weather never silently drives operational scenarios
          localStorage.removeItem(CACHE_KEY);
        }
      } catch {
        // ignore
      }
      return createDeterministicFallbackWeather(false);
    } finally {
      inflightWeatherPromise = null;
    }
  };

  inflightWeatherPromise = runFetch();
  return inflightWeatherPromise;
}

export function clearWeatherCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
