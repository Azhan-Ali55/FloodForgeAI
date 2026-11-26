import { PILOT_CONFIG } from '../engine/pilotConfig';
import type {
  DailyWeatherPoint,
  HourlyWeatherPoint,
  WeatherBundle,
} from '../types/floodforge';
import { formatPktTime } from '../utils/formatters';

const CACHE_KEY = 'floodforge_weather_cache_v2';
const OPEN_METEO_BASE =
  import.meta.env.VITE_OPEN_METEO_URL || 'https://api.open-meteo.com/v1/forecast';

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
}

export function describeWmoWeatherCode(code: number | null): string {
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

function parseOpenMeteoResponse(raw: OpenMeteoRawResponse): WeatherBundle {
  const { hourly } = raw;
  const nowSec = Math.floor(Date.now() / 1000);
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

  let currentIdx = times.findIndex((t) => t >= nowSec);
  if (currentIdx === -1) currentIdx = Math.max(0, times.length - 120);

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

  const hourlyForecast: HourlyWeatherPoint[] = [];
  let f24 = 0;
  let f48 = 0;
  let f72 = 0;
  let f120 = 0;
  let peakHourly = 0;
  let maxProb = 0;

  for (let h = 0; h < 120; h++) {
    const idx = Math.min(times.length - 1, currentIdx + h);
    const precip = Number((cleanNum(hourly.precipitation, idx, 0) ?? 0).toFixed(2));
    const prob = Math.min(
      100,
      Math.round(cleanNum(hourly.precipitation_probability, idx, 15) ?? 15)
    );
    const tempRaw = cleanNum(hourly.temperature_2m, idx, null, false);
    const humRaw = cleanNum(hourly.relative_humidity_2m, idx, null, true);
    const windRaw = cleanNum(hourly.wind_speed_10m, idx, null, true);
    const codeRaw = cleanNum(hourly.weather_code, idx, null, true);

    const smTop = Number(
      (cleanNum(hourly.soil_moisture_0_to_1cm, idx, 0.24) ?? 0.24).toFixed(3)
    );
    const smMid = Number(
      (cleanNum(hourly.soil_moisture_1_to_3cm, idx, 0.26) ?? 0.26).toFixed(3)
    );
    const smDeep = Number(
      (cleanNum(hourly.soil_moisture_3_to_9cm, idx, 0.28) ?? 0.28).toFixed(3)
    );

    if (h < 24) f24 += precip;
    if (h < 48) f48 += precip;
    if (h < 72) f72 += precip;
    f120 += precip;
    if (h < 72 && precip > peakHourly) peakHourly = precip;
    if (h < 72 && prob > maxProb) maxProb = prob;

    const dt = new Date(times[idx] * 1000);
    const label = dt.toLocaleString('en-GB', {
      timeZone: 'Asia/Karachi',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
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
  const curPrecip = cleanNum(hourly.precipitation, currentIdx, 0);
  const curCode = cleanNum(hourly.weather_code, currentIdx, null, true);
  const curCodeInt = curCode !== null ? Math.round(curCode) : null;

  const now = new Date();
  return {
    source: 'OPEN_METEO_LIVE',
    isStale: false,
    cacheAgeHours: 0,
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
    peakHourlyMm: Number(peakHourly.toFixed(1)),
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
    past7DaysDaily,
    validationStatus: interpolatedCount > 0 ? 'INTERPOLATED_GAPS' : 'VALIDATED',
  };
}

/**
 * Deterministic demonstration fallback when Open-Meteo cannot be reached.
 * Clearly tagged SYNTHETIC_DEMO so live telemetry and demonstration curves are never confused.
 */
export function createDeterministicFallbackWeather(): WeatherBundle {
  const now = new Date();
  const pastDailySums = [4.2, 11.8, 0.0, 18.4, 24.6, 8.1, 14.2];
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
  let peakHourly = 0;
  let maxProb = 0;

  for (let h = 0; h < 120; h++) {
    const pulse1 = 16.5 * Math.exp(-Math.pow((h - 14) / 3.8, 2));
    const pulse2 = 9.2 * Math.exp(-Math.pow((h - 39) / 4.5, 2));
    const pulse3 = 5.4 * Math.exp(-Math.pow((h - 61) / 5.0, 2));
    const pulse4 = 7.8 * Math.exp(-Math.pow((h - 92) / 4.2, 2));
    const precip = Number(Math.max(0, pulse1 + pulse2 + pulse3 + pulse4).toFixed(1));
    const prob = Math.min(92, Math.round(18 + precip * 4.1));
    const temp = Number((21.5 + 4.8 * Math.sin(((h + 8) / 24) * Math.PI * 2) - precip * 0.14).toFixed(1));
    const humidity = Math.min(95, Math.max(42, Math.round(58 + precip * 1.8 - 6 * Math.sin(((h + 8) / 24) * Math.PI * 2))));
    const wind = Number((9.5 + 5.5 * Math.sin(h * 0.35) + precip * 0.7).toFixed(1));
    const weatherCode = precip > 10 ? 65 : precip > 3 ? 61 : precip > 0.5 ? 51 : 2;
    const smTop = Number((0.26 + Math.min(0.14, precip * 0.008)).toFixed(3));
    const smMid = Number((0.28 + Math.min(0.12, precip * 0.006)).toFixed(3));
    const smDeep = 0.305;

    if (h < 24) f24 += precip;
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
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
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

  const first = hourlyForecast[0];
  return {
    source: 'SYNTHETIC_DEMO',
    isStale: true,
    cacheAgeHours: 0,
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
      top0_1cm: 0.278,
      mid1_3cm: 0.292,
      deep3_9cm: 0.305,
    },
    hourlyForecast,
    dailyForecast5d: buildDaily5dSummary(hourlyForecast),
    past7DaysDaily,
    validationStatus: 'FALLBACK_DATA',
  };
}

export async function fetchNullahLaiWeather(forceRefresh = false): Promise<WeatherBundle> {
  if (!forceRefresh) {
    try {
      const rawCache = localStorage.getItem(CACHE_KEY);
      if (rawCache) {
        const parsed = JSON.parse(rawCache) as WeatherBundle;
        const ageHours = (Date.now() - new Date(parsed.fetchedAtIso).getTime()) / 3600_000;
        if (ageHours < 0.5 && parsed.source === 'OPEN_METEO_LIVE') {
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  const params = new URLSearchParams({
    latitude: String(PILOT_CONFIG.weather.lat),
    longitude: String(PILOT_CONFIG.weather.lon),
    hourly:
      'precipitation,precipitation_probability,temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm',
    past_days: String(PILOT_CONFIG.weather.past_days),
    forecast_days: '5',
    timezone: PILOT_CONFIG.weather.timezone,
    timeformat: 'unixtime',
    cell_selection: 'land',
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const res = await fetch(`${OPEN_METEO_BASE}?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

    const raw = (await res.json()) as OpenMeteoRawResponse;
    const bundle = parseOpenMeteoResponse(raw);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
    } catch {
      // ignore storage quota
    }
    return bundle;
  } catch {
    try {
      const rawCache = localStorage.getItem(CACHE_KEY);
      if (rawCache) {
        const cached = JSON.parse(rawCache) as WeatherBundle;
        const ageHours = Number(
          ((Date.now() - new Date(cached.fetchedAtIso).getTime()) / 3600_000).toFixed(1)
        );
        return {
          ...cached,
          source: 'LOCAL_CACHE_FALLBACK',
          isStale: true,
          cacheAgeHours: ageHours,
        };
      }
    } catch {
      // ignore
    }
    return createDeterministicFallbackWeather();
  }
}

export function clearWeatherCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
