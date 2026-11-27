import { beforeEach, describe, expect, it, vi } from 'vitest';
import mapSrc from '../components/maps/GeospatialMap.tsx?raw';
import realTwinJsonText from '../../public/real_twin_200x200.json?raw';
import { buildNullahLaiTwin } from '../engine/nullahLaiTwin';
import { runPortfolioOptimizationLocal } from '../engine/optimizer';
import { cellToLatLon, PILOT_CONFIG } from '../engine/pilotConfig';
import { runScenarioLocal } from '../engine/simulator';
import {
  buildForecastScenario,
  buildScenarioFromBackendForecast,
  validateBackendForecastResponse,
} from '../services/forecastService';
import { validateOptimizeResponse } from '../services/optimizerService';
import { validateSimulateResponse } from '../services/simulationService';
import {
  fetchNullahLaiWeather,
  MAX_USABLE_CACHE_AGE_HOURS,
  parseOpenMeteoResponse,
} from '../services/weatherService';
import type { Scenario, TwinGrid } from '../types/floodforge';

function buildMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe('FloodForgeAI Frontend Regression Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: buildMemoryStorage(),
      configurable: true,
    });
  });

  it('TEST A (Frontend): excludes elapsed hours and prevents missing/expired data from becoming 0 mm', () => {
    const fixedNowMs = Date.UTC(2026, 6, 23, 13, 15, 0); // 18:15 PKT
    const floorHourSec = Math.floor(fixedNowMs / 3600_000) * 3600;
    const times: number[] = [];
    const precip: number[] = [];

    // 18 elapsed hours totaling 300 mm before 18:00 PKT
    for (let i = -18; i < 0; i++) {
      times.push(floorHourSec + i * 3600);
      precip.push(i === -1 ? 28.0 : 16.0);
    }
    // 48 future hours all 0.0 mm
    for (let i = 0; i < 48; i++) {
      times.push(floorHourSec + i * 3600);
      precip.push(0.0);
    }

    const bundle = parseOpenMeteoResponse(
      {
        latitude: 33.64,
        longitude: 73.06,
        timezone: 'Asia/Karachi',
        hourly: { time: times, precipitation: precip },
      },
      null,
      fixedNowMs
    );

    expect(bundle.forecast24hMm).toBe(0);
    expect(bundle.peakHourly24hMm).toBe(0);
    expect(bundle.forecastState).toBe('verified');
    expect(bundle.outlookSource).toBe('OPEN_METEO_16D_ONLY');
    // Without daily data, calendar outlook days remain marked Unavailable rather than faked
    expect(bundle.outlook30d.length).toBe(16);
    expect(bundle.outlook30d[0].isAvailable).toBe(false);
    expect(bundle.outlook30d[0].confidenceLabel).toBe('Unavailable');

    // With 16d daily + 35d ensemble, calendar dates cross month boundaries without a 30d artificial cap
    const dailyTimes = Array.from({ length: 16 }, (_, d) => floorHourSec + d * 86400);
    const ensTimes = Array.from({ length: 35 }, (_, d) => floorHourSec + d * 86400);
    const fullBundle = parseOpenMeteoResponse(
      {
        latitude: 33.64,
        longitude: 73.06,
        timezone: 'Asia/Karachi',
        hourly: { time: times, precipitation: precip },
        daily: {
          time: dailyTimes,
          precipitation_sum: new Array(16).fill(0),
          precipitation_probability_max: new Array(16).fill(10),
        },
      },
      {
        daily: {
          time: ensTimes,
          precipitation_sum_member01: new Array(35).fill(2.0),
          precipitation_sum_member02: new Array(35).fill(6.0),
        },
      },
      fixedNowMs
    );
    expect(fullBundle.outlook30d.length).toBe(35);
    expect(fullBundle.outlook30d[0].dateLabel).toMatch(/^\d{2} [A-Z][a-z]{2}$/);
    expect(fullBundle.outlook30d[0].monthYearLabel).toBe('Jul 2026');
    expect(fullBundle.outlook30d[15].monthYearLabel).toBe('Aug 2026');
    expect(fullBundle.outlook30d[0].confidenceLabel).toBe('Confidence unavailable');
    expect(fullBundle.outlook30d[0].confidenceTier).toBe('HIGHER');
    expect(fullBundle.outlook30d[6].confidenceTier).toBe('LOWER');
    expect(fullBundle.outlook30d[20].confidenceTier).toBe('EXPERIMENTAL');

    const scenario = buildForecastScenario(bundle, 24, 50_000_000, 'LIVE_FORECAST');
    expect(scenario.rainfall_mm_per_hr).toBe(0);
    expect(scenario.duration_hr).toBe(1);

    // Expired forecast must throw rather than reusing elapsed hours
    expect(() =>
      parseOpenMeteoResponse(
        {
          latitude: 33.64,
          longitude: 73.06,
          timezone: 'Asia/Karachi',
          hourly: {
            time: times.slice(0, 12),
            precipitation: new Array(12).fill(25),
          },
        },
        null,
        fixedNowMs
      )
    ).toThrow(/Expired/i);

    // All-null future precipitation must throw rather than substituting zeros
    expect(() =>
      parseOpenMeteoResponse(
        {
          latitude: 33.64,
          longitude: 73.06,
          timezone: 'Asia/Karachi',
          hourly: {
            time: times.slice(18),
            precipitation: new Array(48).fill(null),
          },
        },
        null,
        fixedNowMs
      )
    ).toThrow(/no valid values/i);

    // Partial missing precipitation reports degraded coverage & stale state
    const partialPrecip: Array<number | null> = [...precip.slice(18)];
    partialPrecip[1] = null;
    partialPrecip[2] = null;
    const partial = parseOpenMeteoResponse(
      {
        latitude: 33.64,
        longitude: 73.06,
        timezone: 'Asia/Karachi',
        hourly: { time: times.slice(18), precipitation: partialPrecip },
      },
      null,
      fixedNowMs
    );
    expect(partial.missingHoursCount).toBe(2);
    expect(partial.forecastState).toBe('stale');
    expect(partial.coveragePct).toBeLessThan(100);
  });

  it('purges expired cached forecasts (> MAX_USABLE_CACHE_AGE_HOURS) on network failure', async () => {
    const expiredIso = new Date(
      Date.now() - (MAX_USABLE_CACHE_AGE_HOURS + 4) * 3600_000
    ).toISOString();
    localStorage.setItem(
      'floodforge_weather_cache_v3',
      JSON.stringify({
        source: 'OPEN_METEO_LIVE',
        fetchedAtIso: expiredIso,
        hourlyForecast: [
          {
            timestampIso: new Date(Date.now() + 3600_000).toISOString(),
            precipitationMm: 95,
          },
        ],
        outlook30d: new Array(30).fill({}),
      })
    );

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));
    const fallback = await fetchNullahLaiWeather(true);

    expect(fallback.forecastState).toBe('unavailable');
    expect(fallback.source).toBe('SYNTHETIC_DEMO');
    expect(localStorage.getItem('floodforge_weather_cache_v3')).toBeNull();
  });

  it('rejects invalid /api/simulate, /api/optimize, and /api/forecast payloads instead of coercing to zero', () => {
    // Reject NaN accumulation
    expect(() =>
      validateSimulateResponse(
        {
          accumulation_mm: [[10, Number.NaN], [5, 2]],
          exposed_mask: [[false, false], [false, false]],
          metrics: {
            exposed_area_km2: 0.1,
            buildings_exposed: 1,
            population_exposed: 5,
            road_cells_exposed: 0,
            facilities_exposed: {},
          },
        },
        2,
        2
      )
    ).toThrow(/Invalid accumulation_mm/);

    // Reject negative accumulation
    expect(() =>
      validateSimulateResponse(
        {
          accumulation_mm: [[10, -2], [5, 2]],
          exposed_mask: [[false, false], [false, false]],
          metrics: {
            exposed_area_km2: 0.1,
            buildings_exposed: 1,
            population_exposed: 5,
            road_cells_exposed: 0,
            facilities_exposed: {},
          },
        },
        2,
        2
      )
    ).toThrow(/Invalid accumulation_mm/);

    // Reject invalid intervention type / budget overrun / invalid pareto
    expect(() =>
      validateOptimizeResponse(
        {
          interventions: [
            {
              id: 'bad',
              type: 'unknown_type' as unknown as 'storage',
              row: 5,
              col: 5,
              size: 1000,
              cost_pkr: 1000,
            },
          ],
        },
        200,
        200,
        50_000_000
      )
    ).toThrow(/Invalid intervention/);

    expect(() =>
      validateOptimizeResponse(
        {
          interventions: [
            { id: 'ok-1', type: 'storage', row: 5, col: 5, size: 1000, cost_pkr: 60_000_000 },
          ],
        },
        200,
        200,
        50_000_000
      )
    ).toThrow(/exceeds budget/);

    expect(() =>
      validateOptimizeResponse(
        {
          interventions: [],
          pareto_frontier: [
            { budget_pkr: 50_000_000, cost_pkr: 80_000_000, exposure_reduction_pct: 10, selected_count: 1 },
          ],
        },
        200,
        200,
        50_000_000
      )
    ).toThrow(/Invalid Pareto/);

    // Reject unavailable backend forecast
    expect(() =>
      validateBackendForecastResponse({ source: 'unavailable', antecedent_wetness: 'unavailable' })
    ).toThrow(/unavailable/i);
  });

  it('applies forecast horizons (24h/48h/72h) consistently to backend and local scenarios', () => {
    const hourly = Array.from({ length: 72 }, (_, i) => (i >= 30 && i < 36 ? 12.0 : 0.0));
    const backendSummary = {
      source: 'open-meteo-live',
      antecedent_wetness: 'normal' as const,
      peak_6h_total_mm: 72.0,
      peak_6h_rate_mm_per_hr: 12.0,
      peak_6h_window_start: null,
      total_72h_mm: 72.0,
      peak_1h_mm_per_hr: 12.0,
      soil_moisture_0_to_1cm: 0.24,
      hourly_precipitation_mm: hourly,
    };

    const s24 = buildScenarioFromBackendForecast(backendSummary, 50_000_000, 24);
    const s48 = buildScenarioFromBackendForecast(backendSummary, 50_000_000, 48);
    expect(s24.rainfall_mm_per_hr).toBe(0);
    expect(s48.rainfall_mm_per_hr).toBe(12);
  });

  it('optimizes budgets independently, steers sites via weights, and preserves budget constraints', () => {
    const twin = buildNullahLaiTwin('nullah_lai_basin', 42);
    const storm: Scenario = {
      rainfall_mm_per_hr: 62,
      duration_hr: 10,
      budget_pkr: 50_000_000,
      threshold_mm: 150,
      antecedent_wetness: 'saturated',
      tag: 'HYPOTHETICAL_STRESS_TEST',
    };

    const resPop = runPortfolioOptimizationLocal(twin, storm, {
      budgetPkr: 50_000_000,
      enabledTypes: ['retention_pond', 'permeable_surface'],
      weights: { population: 90, buildings: 0, roads: 0, facilities: 10, area: 0 },
    });
    const resArea = runPortfolioOptimizationLocal(twin, storm, {
      budgetPkr: 50_000_000,
      enabledTypes: ['retention_pond', 'permeable_surface'],
      weights: { population: 0, buildings: 0, roads: 0, facilities: 0, area: 100 },
    });

    expect(resPop.totalCostPkr).toBeLessThanOrEqual(50_000_000);
    expect(resPop.engineSource).toBe('local_d8');
    expect(resPop.provenance).toBe('SIMULATED');

    const pareto50 = resPop.paretoFrontier.find((p) => p.budgetPkr === 50_000_000);
    expect(pareto50?.selectedCount).toBe(resPop.selectedPortfolio.length);
    expect(pareto50?.costPkr).toBe(resPop.totalCostPkr);

    // Changing weights alters spatial ordering/selection or weighted objective score
    const coordsPop = resPop.selectedPortfolio.map((i) => `${i.row},${i.col}`).join(';');
    const coordsArea = resArea.selectedPortfolio.map((i) => `${i.row},${i.col}`).join(';');
    expect(coordsPop !== coordsArea || resPop.weightedReductionPct !== resArea.weightedReductionPct).toBe(true);
  });

  it('verifies Esri Satellite {z}/{y}/{x} order and spatial alignment with Python D8 simulator', () => {
    expect(mapSrc).toContain(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    );
    expect(mapSrc).not.toContain('World_Imagery/MapServer/tile/{z}/{x}/{y}');

    // Alignment check for cellToLatLon bounds
    const bbox = PILOT_CONFIG.studyAreas.nullah_lai_basin.bbox_wgs84;
    const nw = cellToLatLon(0, 0, 200, 200, bbox);
    const se = cellToLatLon(199, 199, 200, 200, bbox);
    expect(nw.lat).toBeGreaterThan(se.lat);
    expect(se.lon).toBeGreaterThan(nw.lon);
    expect(nw.lat).toBeLessThanOrEqual(bbox.north);
    expect(se.lat).toBeGreaterThanOrEqual(bbox.south);

    // Load exact 200x200 twin used by Python backend and verify simulation output parity
    const raw = JSON.parse(realTwinJsonText) as {
      rows: number;
      cols: number;
      cell_size_m: number;
      crs: string;
      dem: number[];
      f_imp: number[];
      land_cover: number[];
      population: number[];
      buildings: number[];
      roads: number[];
      zones: number[];
      facilities: Record<string, number[]>;
    };
    const total = raw.rows * raw.cols;
    const roadSeg = new Int32Array(total);
    const synth = buildNullahLaiTwin('nullah_lai_basin', 42);
    const twin: TwinGrid = {
      ...synth,
      rows: raw.rows,
      cols: raw.cols,
      dem: Float64Array.from(raw.dem),
      f_imp: Float64Array.from(raw.f_imp),
      land_cover: Int32Array.from(raw.land_cover),
      population: Float64Array.from(raw.population),
      buildings: Int32Array.from(raw.buildings),
      roads: Uint8Array.from(raw.roads),
      road_segments: roadSeg,
      zones: Int32Array.from(raw.zones),
      facilities: {
        hospital: Uint8Array.from(raw.facilities.hospital ?? new Array(total).fill(0)),
        school: Uint8Array.from(raw.facilities.school ?? new Array(total).fill(0)),
      },
      cell_size_m: raw.cell_size_m,
      crs: raw.crs,
    };

    const storm: Scenario = {
      rainfall_mm_per_hr: 62,
      duration_hr: 10,
      budget_pkr: 200_000_000,
      threshold_mm: 150,
      antecedent_wetness: 'saturated',
      tag: 'HYPOTHETICAL_STRESS_TEST',
    };
    const tsRes = runScenarioLocal(twin, storm, { interventions: [] });
    // Compare against Python D8Simulator reference output (area=5.09 km2, buildings=237, pop=64653, roadCells=3001)
    expect(Math.abs(tsRes.metrics.exposed_area_km2 - 5.09)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(tsRes.metrics.buildings_exposed - 237)).toBeLessThanOrEqual(2);
    expect(Math.abs(tsRes.metrics.population_exposed - 64653)).toBeLessThanOrEqual(300);
    expect(Math.abs(tsRes.metrics.road_cells_exposed - 3001)).toBeLessThanOrEqual(30);

    // Dry parity: 0 rainfall produces zero exposure
    const dryRes = runScenarioLocal(twin, { ...storm, rainfall_mm_per_hr: 0, duration_hr: 1 }, { interventions: [] });
    expect(dryRes.metrics.exposed_area_km2).toBe(0);
    expect(dryRes.metrics.buildings_exposed).toBe(0);
  });
});
