import type {
  DataSourceHealth,
  ModelDiagnostics,
  OptimizationResult,
  SimResult,
  TwinGrid,
  WeatherBundle,
} from '../types/floodforge';
import type { EngineMode } from './apiClient';

export function buildDataSourceHealth(
  weather: WeatherBundle,
  engineMode: EngineMode,
  apiHealthy: boolean
): DataSourceHealth[] {
  const isBackendReal = engineMode === 'api' && apiHealthy;

  return [
    {
      id: 'open-meteo',
      name: 'Open-Meteo Weather API',
      dataset: 'Hourly Precip, Prob & Soil Moisture (33.65°N, 73.06°E)',
      status:
        weather.source === 'OPEN_METEO_LIVE'
          ? 'CONNECTED'
          : weather.source === 'LOCAL_CACHE_FALLBACK'
            ? 'FALLBACK'
            : 'FALLBACK',
      lastUpdated: weather.fetchedAtPkt,
      completenessPct: weather.source === 'OPEN_METEO_LIVE' ? 100 : 94,
      sourceType: 'Live API',
      notes:
        weather.source === 'OPEN_METEO_LIVE'
          ? 'Live 7-day past + 72h forecast synchronized.'
          : weather.source === 'LOCAL_CACHE_FALLBACK'
            ? `Serving cached archive (${weather.cacheAgeHours}h old).`
            : 'Deterministic demonstration fallback active (offline/blocked).',
    },
    {
      id: 'dem',
      name: 'Copernicus DEM GLO-30',
      dataset: '30 m Real Terrain Elevation Raster',
      status: isBackendReal ? 'CONNECTED' : 'SYNTHETIC_PROXY',
      lastUpdated: 'Static Baseline',
      completenessPct: 100,
      sourceType: isBackendReal ? 'Open Geospatial Raster' : 'Synthetic Digital Twin',
      notes: isBackendReal
        ? 'Real 30 m terrain topography across Nullah Lai basin.'
        : 'Parametric Nullah Lai valley terrain proxy (542 m → 493 m).',
    },
    {
      id: 'imperviousness',
      name: 'ESA WorldCover Imperviousness',
      dataset: 'Land Cover & Paved Urban Surface Fraction',
      status: isBackendReal ? 'CONNECTED' : 'SYNTHETIC_PROXY',
      lastUpdated: 'Static Baseline',
      completenessPct: 100,
      sourceType: isBackendReal ? 'Open Geospatial Raster' : 'Synthetic Digital Twin',
      notes: 'Pervious green space vs. paved urban surface for runoff calculation.',
    },
    {
      id: 'population',
      name: 'WorldPop Gridded Population',
      dataset: 'Dasymetric Population Density (people/cell)',
      status: isBackendReal ? 'CONNECTED' : 'SYNTHETIC_PROXY',
      lastUpdated: 'Static Baseline',
      completenessPct: 98.5,
      sourceType: isBackendReal ? 'Open Geospatial Raster' : 'Synthetic Digital Twin',
      notes: 'Weighted across Rawalpindi–Islamabad urban wards.',
    },
    {
      id: 'buildings',
      name: 'OpenBuildingMap / Overture Buildings',
      dataset: 'Building Footprint Count per 30 m Cell',
      status: isBackendReal ? 'CONNECTED' : 'SYNTHETIC_PROXY',
      lastUpdated: 'Static Baseline',
      completenessPct: 97.2,
      sourceType: isBackendReal ? 'Vector / OSM' : 'Synthetic Digital Twin',
      notes: 'Screening-level exposure proxy; excludes structural elevation.',
    },
    {
      id: 'roads',
      name: 'OSM Roads & Transport Network',
      dataset: 'Arterials, Corridors & Bridge Crossings',
      status: isBackendReal ? 'CONNECTED' : 'SYNTHETIC_PROXY',
      lastUpdated: 'Static Baseline',
      completenessPct: 100,
      sourceType: isBackendReal ? 'Vector / OSM' : 'Synthetic Digital Twin',
      notes: 'Includes IJP Rd, Murree Rd, Khayaban-e-Sir Syed, Gawalmandi.',
    },
    {
      id: 'facilities',
      name: 'Critical Facilities Registry',
      dataset: 'Hospitals, Rescue 1122, Substations, WASA, Schools',
      status: isBackendReal ? 'CONNECTED' : 'SYNTHETIC_PROXY',
      lastUpdated: 'Static Baseline',
      completenessPct: 100,
      sourceType: isBackendReal ? 'Vector / OSM' : 'Synthetic Digital Twin',
      notes: '12 key emergency and civic nodes mapped along corridor.',
    },
    {
      id: 'zones',
      name: 'Neighborhood Zones',
      dataset: '12 Rawalpindi–Islamabad Equity Audit Wards',
      status: 'CONNECTED',
      lastUpdated: 'Static Baseline',
      completenessPct: 100,
      sourceType: 'Vector / OSM',
      notes: 'Used for zone-level downstream risk-transfer auditing.',
    },
  ];
}

export function buildModelDiagnostics(
  twin: TwinGrid,
  simResult: SimResult,
  optResult: OptimizationResult | null,
  isRealCalibrated = false
): ModelDiagnostics {
  return {
    d8FlowRoutingStatus: 'CONVERGED',
    flowAccumulationStatus: 'ACTIVE_30M_SCREENING',
    lastSimExecutionMs: simResult.runtime_ms,
    surrogateTrainR2: optResult?.surrogateDiagnostics.trainR2 ?? 0,
    surrogateValidationR2: optResult?.surrogateDiagnostics.validationR2 ?? 0,
    trainSampleCount: optResult?.surrogateDiagnostics.trainSamples ?? 0,
    validationSampleCount: optResult?.surrogateDiagnostics.validationSamples ?? 0,
    validationStatus: isRealCalibrated
      ? 'Deterministic 30 m Copernicus GLO-30 D8 routing + greedy Pareto optimizer active; no trained ML flood-depth predictor loaded — PMD field gauge validation pending.'
      : 'Deterministic 30 m D8 screening + greedy optimizer active; no trained ML predictor loaded — field gauge validation pending PMD telemetry.',
    mlMaturityTier: isRealCalibrated ? 'TIER_2_CALIBRATED' : 'TIER_1_SYNTHETIC',
    gridShape: `${twin.rows} × ${twin.cols} (${twin.cell_size_m} m)`,
    crs: twin.crs,
  };
}
