/**
 * Shared TypeScript contracts for FloodForgeAI — Municipal Flood & Environmental Portal.
 * Mirrors src/floodforge/schemas.py, configs/pilot.yaml, and operational extensions.
 * All spatial outputs are SCREENING-LEVEL (30 m D8), not hydraulic street-level depths.
 */

export type InterventionType = 'retention_pond' | 'permeable_surface' | 'drainage_upgrade';

export type LandCoverCode = 10 | 20 | 30 | 40 | 50 | 60 | 80;

export type ScenarioTag =
  | 'LIVE_FORECAST'
  | 'UNCERTAINTY_ENVELOPE'
  | 'HYPOTHETICAL_STRESS_TEST';

export type AlertTier = 'Normal' | 'Advisory' | 'Watch' | 'Warning' | 'Emergency';

export type MlMaturityTier =
  | 'TIER_1_SYNTHETIC'
  | 'TIER_2_CALIBRATED'
  | 'TIER_3_VALIDATED';

export type OperationalMode = 'live_ops' | 'demo_2001';

export type ForecastHorizon = 24 | 48 | 72;

export type StudyAreaId =
  | 'nullah_lai_basin'
  | 'katarian_gawalmandi'
  | 'upper_islamabad_tributaries';

export type AntecedentWetnessLevel = 'dry' | 'normal' | 'wet' | 'saturated';

export interface Scenario {
  rainfall_mm_per_hr: number;
  duration_hr: number;
  budget_pkr: number;
  threshold_mm?: number;
  antecedent_wetness?: AntecedentWetnessLevel;
  uncertainty_factor?: number;
  tag: ScenarioTag;
  label?: string;
}

export type ForecastState = 'verified' | 'stale' | 'simulated' | 'unavailable';

export interface BackendForecastSummary {
  source: string;
  forecast_status?: 'verified' | 'partial' | 'unavailable';
  provenance?: string;
  fetched_at_utc?: string;
  aligned_pkt_time?: string | null;
  coverage_pct?: number;
  missing_future_hours?: number;
  soil_moisture_0_to_1cm: number | null;
  antecedent_wetness: AntecedentWetnessLevel | 'unavailable';
  peak_6h_total_mm: number;
  peak_6h_rate_mm_per_hr: number;
  peak_6h_window_start: string | null;
  future_24h_total_mm?: number;
  future_48h_total_mm?: number;
  future_72h_total_mm?: number;
  total_72h_mm: number;
  peak_1h_mm_per_hr: number;
  hourly_time?: string[];
  hourly_precipitation_mm?: Array<number | null>;
  hourly_soil_moisture_0_to_1cm?: Array<number | null>;
}

export interface Intervention {
  id: string;
  type: InterventionType;
  row: number;
  col: number;
  lat: number;
  lon: number;
  zoneId: number;
  zoneName: string;
  size: number;
  unit: string;
  cost_pkr: number;
  expected_impact_pct: number;
  selected: boolean;
}

export interface Portfolio {
  interventions: Intervention[];
}

export interface ZoneMeta {
  id: number;
  name: string;
  sector: 'Islamabad' | 'Rawalpindi';
  bounds: { south: number; west: number; north: number; east: number };
  polygon: Array<[number, number]>; // [lat, lon]
  populationDensityLabel: string;
}

export interface FacilityRecord {
  id: string;
  name: string;
  type: 'hospital' | 'school' | 'rescue_1122' | 'substation' | 'wasa_station';
  row: number;
  col: number;
  lat: number;
  lon: number;
  zoneId: number;
  zoneName: string;
}

export interface RoadCorridor {
  id: string;
  name: string;
  classification: 'Primary Arterial' | 'Urban Corridor' | 'Bridge Crossing';
  coords: Array<[number, number]>; // [lat, lon]
  zoneNames: string[];
}

export interface TwinGrid {
  studyAreaId: StudyAreaId;
  rows: number;
  cols: number;
  bbox_wgs84: { west: number; south: number; east: number; north: number };
  dem: Float64Array;
  land_cover: Int32Array;
  f_imp: Float64Array;
  population: Float64Array;
  buildings: Int32Array;
  roads: Uint8Array;
  road_segments: Int32Array;
  zones: Int32Array;
  facilities: Record<string, Uint8Array>;
  zone_meta: ZoneMeta[];
  facility_records: FacilityRecord[];
  waterway_paths: Array<{ name: string; coords: Array<[number, number]> }>;
  road_corridors: RoadCorridor[];
  cell_size_m: number;
  crs: string;
  seed: number;
}

export interface ExposureMetrics {
  exposed_area_km2: number;
  buildings_exposed: number;
  population_exposed: number;
  road_cells_exposed: number;
  road_segments_exposed: number;
  facilities_exposed: Record<string, number>;
  total_facilities_exposed: number;
}

export interface RiskTransferReport {
  worse_mask: Uint8Array;
  buildings_worse: number;
  population_worse: number;
  flagged: boolean;
}

export interface SimResult {
  accumulation_mm: Float64Array;
  exposed_mask: Uint8Array;
  metrics: ExposureMetrics;
  risk_transfer: RiskTransferReport | null;
  uncertainty: Record<string, [number, number]>;
  assumptions: string[];
  screening_level: boolean;
  engineSource?: 'python_api' | 'local_d8';
  scenario_tag: ScenarioTag;
  alert_tier: AlertTier;
  runtime_ms: number;
  timestamp_pkt: string;
}

export interface HourlyWeatherPoint {
  timestampIso: string;
  label: string;
  hourOffset: number;
  precipitationMm: number;
  probabilityPct: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  weatherCode: number | null;
  soilMoistureTop: number; // 0-1 cm (m³/m³)
  soilMoistureMid: number; // 1-3 cm
  soilMoistureDeep: number; // 3-9 cm
  isHistorical: boolean;
}

export interface DailyWeatherPoint {
  dateLabel: string;
  minTempC: number | null;
  maxTempC: number | null;
  avgTempC: number | null;
  rainfallMm: number;
  maxWindKmh: number | null;
  maxProbabilityPct: number;
  weatherCode: number | null;
  conditionLabel: string;
}

export type ForecastConfidenceTier = 'HIGHER' | 'LOWER' | 'EXPERIMENTAL' | 'UNAVAILABLE';

export interface OutlookDayPoint {
  dayOffset: number; // 1..N (16d NWP or up to 35d ensemble)
  dateIso: string;
  dateLabel: string;
  monthYearLabel: string;
  isAvailable: boolean;
  confidenceTier: ForecastConfidenceTier;
  confidenceLabel: string;
  rainfallMm: number;
  p90RainfallMm: number;
  probabilityPct: number;
  minTempC: number | null;
  maxTempC: number | null;
  weatherCode: number | null;
  conditionLabel: string;
  tier: 'HIGH_PRECISION_5D' | 'MEDIUM_RANGE_16D' | 'ENSEMBLE_30D';
  riskLevel: StationRiskLevel;
}

export interface EarliestFloodAlert {
  dayOffset: number;
  dateLabel: string;
  rainfallMm: number;
  probabilityPct: number;
  riskLevel: StationRiskLevel;
  summary: string;
}

export interface WeatherBundle {
  source: 'OPEN_METEO_LIVE' | 'LOCAL_CACHE_FALLBACK' | 'SYNTHETIC_DEMO';
  forecastState: ForecastState;
  outlookSource:
    | 'OPEN_METEO_16D_ENSEMBLE'
    | 'OPEN_METEO_16D_ONLY'
    | 'MONSOON_STRESS_TEST'
    | 'HISTORICAL_2001_CLOUDBURST'
    | 'FALLBACK_DATA';
  isStale: boolean;
  cacheAgeHours: number;
  coveragePct: number;
  missingHoursCount: number;
  fetchedAtIso: string;
  fetchedAtPkt: string;
  lat: number;
  lon: number;
  timezone: string;
  api7DayMm: number; // Antecedent Precipitation Index
  past7DayTotalMm: number;
  forecast24hMm: number;
  forecast48hMm: number;
  forecast72hMm: number;
  forecast120hMm: number;
  forecast16dMm: number;
  forecast30dMm: number;
  peakHourly24hMm: number;
  peakHourlyMm: number;
  maxProbabilityPct: number;
  currentWeather: {
    temperatureC: number | null;
    humidityPct: number | null;
    windSpeedKmh: number | null;
    precipitationMm: number | null;
    weatherCode: number | null;
    conditionLabel: string;
  };
  currentSoilMoisture: {
    top0_1cm: number;
    mid1_3cm: number;
    deep3_9cm: number;
  };
  hourlyForecast: HourlyWeatherPoint[];
  dailyForecast5d: DailyWeatherPoint[];
  outlook30d: OutlookDayPoint[];
  earliestFloodAlert: EarliestFloodAlert | null;
  past7DaysDaily: Array<{ day: string; rainfallMm: number }>;
  validationStatus: 'VALIDATED' | 'INTERPOLATED_GAPS' | 'FALLBACK_DATA';
}

export interface OptimizationWeights {
  population: number;
  buildings: number;
  roads: number;
  facilities: number;
  area: number;
}

export interface OptimizationConfig {
  budgetPkr: number;
  enabledTypes: InterventionType[];
  weights: OptimizationWeights;
}

export interface ParetoPoint {
  budgetPkr: number;
  costPkr: number;
  exposureReductionPct: number;
  score: number;
  selectedCount: number;
  isKneePoint?: boolean;
  isCurrentSelection?: boolean;
  label: string;
}

export interface RandomBaselineSample {
  id: number;
  costPkr: number;
  exposureReductionPct: number;
  score: number;
}

export interface ZoneEquityRow {
  zoneId: number;
  zoneName: string;
  sector: 'Islamabad' | 'Rawalpindi';
  baselineAreaKm2: number;
  postAreaKm2: number;
  deltaAreaKm2: number;
  pctChange: number;
  baselinePop: number;
  postPop: number;
  status: 'REDUCTION' | 'NO_SIGNIFICANT_CHANGE' | 'RISK_INCREASED';
}

export type EquityStatusSummary =
  | 'NO_RISK_TRANSFER'
  | 'RISK_TRANSFER_CONCERN'
  | 'ADDITIONAL_ANALYSIS_REQUIRED';

export interface OptimizationResult {
  config: OptimizationConfig;
  selectedPortfolio: Intervention[];
  allCandidates: Intervention[];
  totalBudgetPkr: number;
  totalCostPkr: number;
  remainingBudgetPkr: number;
  utilizationPct: number;
  baselineResult: SimResult;
  optimizedResult: SimResult;
  weightedReductionPct: number;
  avgRandomReductionPct: number;
  improvementOverRandomPct: number;
  paretoFrontier: ParetoPoint[];
  randomBaselines: RandomBaselineSample[];
  zoneEquityRows: ZoneEquityRow[];
  equityStatus: EquityStatusSummary;
  surrogateDiagnostics: {
    trainR2: number;
    validationR2: number;
    trainSamples: number;
    validationSamples: number;
  };
  engineSource?: 'python_api' | 'local_d8';
  provenance?: 'SIMULATED' | 'FALLBACK';
  runtimeMs: number;
}

export type MapRasterLayer =
  | 'flood_risk'
  | 'rainfall'
  | 'elevation'
  | 'population';

export interface MapLayerVisibility {
  flood_risk: boolean;
  rainfall: boolean;
  elevation: boolean;
  population: boolean;
  waterway: boolean;
  roads: boolean;
  buildings: boolean;
  facilities: boolean;
  stations: boolean;
  interventions: boolean;
  neighborhoods: boolean;
  safe_zones?: boolean;
}

export interface ZoneSafetyItem {
  zoneId: number;
  zoneName: string;
  sector: 'Islamabad' | 'Rawalpindi';
  exposedAreaKm2: number;
  safeAreaKm2: number;
  exposedBuildings: number;
  exposedPopulation: number;
  peakAccumulationMm: number;
  meanElevationM: number;
  status: 'SAFE' | 'MODERATE' | 'HIGH_RISK' | 'CRITICAL';
}

export interface AreaSafetySummary {
  safeAreaKm2: number;
  exposedAreaKm2: number;
  mostAffectedZones: ZoneSafetyItem[];
  safeZones: ZoneSafetyItem[];
  affectedStations: MonitoringStation[];
  safeStations: MonitoringStation[];
}

export type BasemapStyle = 'municipal_green' | 'osm' | 'satellite' | 'tactical_grid';

export type StationRiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical';

export interface MonitoringStation {
  id: string;
  stationCode: string;
  name: string;
  stationType: FacilityRecord['type'];
  location: string;
  sector: 'Islamabad' | 'Rawalpindi';
  lat: number;
  lon: number;
  utmCoords: string;
  row: number;
  col: number;
  elevationM: number;
  rainfallMmHr: number | null;
  waterLevelM: number | null;
  modeledAccumulationMm: number;
  soilMoistureLabel: string;
  temperatureC: number | null;
  windSpeedKmh: number | null;
  humidityPct: number | null;
  riskLevel: StationRiskLevel;
  operationalStatus: 'Operational' | 'Elevated Load' | 'Fallback Telemetry';
  lastUpdated: string;
  isExposed: boolean;
}

export interface SelectedMapFeature {
  kind: 'cell' | 'facility' | 'zone' | 'intervention' | 'road' | 'station';
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
  utmCoords: string;
  zoneName: string;
  riskCategory: AlertTier;
  details: Array<{ label: string; value: string; accent?: 'cyan' | 'emerald' | 'amber' | 'red' }>;
}

export interface DataSourceHealth {
  id: string;
  name: string;
  dataset: string;
  status: 'CONNECTED' | 'SYNTHETIC_PROXY' | 'FALLBACK' | 'DISCONNECTED';
  lastUpdated: string;
  completenessPct: number;
  sourceType: 'Live API' | 'Open Geospatial Raster' | 'Vector / OSM' | 'Synthetic Digital Twin';
  notes: string;
}

export interface ModelDiagnostics {
  d8FlowRoutingStatus: 'CONVERGED' | 'ACTIVE' | 'ERROR';
  flowAccumulationStatus: 'ACTIVE_30M_SCREENING' | 'DEGRADED';
  lastSimExecutionMs: number;
  surrogateTrainR2: number;
  surrogateValidationR2: number;
  trainSampleCount: number;
  validationSampleCount: number;
  validationStatus: string;
  mlMaturityTier: MlMaturityTier;
  gridShape: string;
  crs: string;
}

export interface SystemEvent {
  id: string;
  timestamp: string;
  category: 'WEATHER' | 'SIMULATION' | 'OPTIMIZER' | 'EQUITY' | 'SYSTEM';
  severity: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  detail: string;
}

export interface HotspotItem {
  rank: number;
  zoneId: number;
  zoneName: string;
  sector: string;
  lat: number;
  lon: number;
  row: number;
  col: number;
  peakAccumulationMm: number;
  exposedPopulation: number;
  exposedBuildings: number;
  riskTier: AlertTier;
}
