import { formatSoilMoistureStatus } from '../services/forecastService';
import { latLonToUtm43N } from './pilotConfig';
import type {
  MonitoringStation,
  Scenario,
  SimResult,
  StationRiskLevel,
  TwinGrid,
  WeatherBundle,
} from '../types/floodforge';

/**
 * Classifies a station's flood risk using the municipal 4-color scale
 * from modeled 30 m D8 accumulation (mm).
 */
export function classifyStationRisk(accumulationMm: number): StationRiskLevel {
  if (accumulationMm >= 85) return 'Critical';
  if (accumulationMm >= 50) return 'High';
  if (accumulationMm >= 25) return 'Moderate';
  return 'Low';
}

/**
 * Spatial convective rainfall factor aligned with mapService rainfall gradient.
 */
function spatialRainMultiplier(row: number, col: number, rows: number, cols: number): number {
  const rNorm = row / Math.max(1, rows - 1);
  const cNorm = col / Math.max(1, cols - 1);
  const core = Math.exp(-((rNorm - 0.55) ** 2 / 0.22 + (cNorm - 0.48) ** 2 / 0.25));
  return 0.78 + 0.36 * core;
}

/**
 * Builds monitoring station records directly from the twin's georeferenced
 * facility/monitoring nodes, simulation accumulation array, and Open-Meteo weather telemetry.
 * Missing physical measurements (such as river water temperature) remain null so the UI
 * displays "Data unavailable" rather than fabricating values.
 */
export function buildMonitoringStations(
  twin: TwinGrid,
  simResult: SimResult,
  weather: WeatherBundle,
  _scenario?: Scenario
): MonitoringStation[] {
  const baseRainMmHr = weather.currentWeather?.precipitationMm ?? null;
  const baseTempC = weather.currentWeather?.temperatureC ?? null;
  const baseWindKmh = weather.currentWeather?.windSpeedKmh ?? null;
  const baseHumPct = weather.currentWeather?.humidityPct ?? null;
  const isFallback = weather.source !== 'OPEN_METEO_LIVE';
  const soilMoisture = formatSoilMoistureStatus(weather);

  return twin.facility_records.map((fac, index) => {
    const idx = fac.row * twin.cols + fac.col;
    const acc = simResult.accumulation_mm[idx] ?? 0;
    const elev = twin.dem[idx] ?? 510;
    const isExposed = simResult.exposed_mask[idx] === 1;
    const riskLevel = classifyStationRisk(acc);
    const zone = twin.zone_meta.find((z) => z.id === fac.zoneId);

    const spatialMult = spatialRainMultiplier(fac.row, fac.col, twin.rows, twin.cols);
    const rainfallMmHr =
      baseRainMmHr !== null ? Number((baseRainMmHr * spatialMult).toFixed(1)) : null;

    // Subtle elevation-based lapse adjustment relative to reference 518m
    const temperatureC =
      baseTempC !== null ? Number((baseTempC - (elev - 518) * 0.0065).toFixed(1)) : null;

    // D8 screening runoff accumulation expressed in equivalent meters (50mm = 0.15m screening proxy)
    const waterLevelM = Number((acc * 0.003).toFixed(2));

    const operationalStatus: MonitoringStation['operationalStatus'] = isFallback
      ? 'Fallback Telemetry'
      : isExposed || riskLevel === 'Critical'
        ? 'Elevated Load'
        : 'Operational';

    return {
      id: fac.id,
      stationCode: `STN-${String(index + 1).padStart(2, '0')}`,
      name: fac.name,
      stationType: fac.type,
      location: fac.zoneName,
      sector: zone?.sector ?? 'Rawalpindi',
      lat: fac.lat,
      lon: fac.lon,
      utmCoords: latLonToUtm43N(fac.lat, fac.lon),
      row: fac.row,
      col: fac.col,
      elevationM: Number(elev.toFixed(1)),
      rainfallMmHr,
      waterLevelM,
      modeledAccumulationMm: Number(acc.toFixed(1)),
      soilMoistureLabel: soilMoisture.combinedLabel,
      temperatureC,
      windSpeedKmh: baseWindKmh,
      humidityPct: baseHumPct,
      riskLevel,
      operationalStatus,
      lastUpdated: weather.fetchedAtPkt,
      isExposed,
    };
  });
}

/**
 * Computes an overall municipal Flood Risk Index (0-100) from modeled exposed area,
 * peak runoff accumulation, and exposed population.
 */
export function computeFloodRiskIndex(
  simResult: SimResult,
  stations: MonitoringStation[]
): {
  index: number;
  classification: StationRiskLevel;
  affectedZonesEstimate: number;
} {
  const areaScore = Math.min(45, (simResult.metrics.exposed_area_km2 / 3.0) * 45);
  const popScore = Math.min(30, (simResult.metrics.population_exposed / 8000) * 30);
  const criticalStations = stations.filter(
    (s) => s.riskLevel === 'Critical' || s.riskLevel === 'High'
  ).length;
  const stationScore = Math.min(25, (criticalStations / Math.max(1, stations.length)) * 35);

  const index = Math.min(100, Math.round(areaScore + popScore + stationScore));
  const classification: StationRiskLevel =
    index >= 75
      ? 'Critical'
      : index >= 50
        ? 'High'
        : index >= 25
          ? 'Moderate'
          : 'Low';

  const affectedZonesEstimate = new Set(
    stations
      .filter((s) => s.riskLevel === 'High' || s.riskLevel === 'Critical' || s.isExposed)
      .map((s) => s.location)
  ).size;

  return { index, classification, affectedZonesEstimate };
}

export interface PreparednessActionItem {
  agency: string;
  priority: 'HIGH' | 'MEDIUM' | 'ROUTINE';
  text: string;
}

/**
 * Generates actionable agency-level preparedness steps (Mode A / Predictions)
 * from the active simulation exposure mask, critical facilities, and road corridors.
 */
export function buildPreparednessActions(
  twin: TwinGrid,
  simResult: SimResult,
  totalRainMm: number,
  thresholdMm = 50
): PreparednessActionItem[] {
  const actions: PreparednessActionItem[] = [];
  const exposedFacilities = twin.facility_records.filter((f) => {
    const idx = f.row * twin.cols + f.col;
    return simResult.exposed_mask[idx] === 1;
  });

  if (simResult.metrics.exposed_area_km2 <= 0.1 && simResult.alert_tier === 'Normal') {
    actions.push({
      agency: 'WASA & Rescue 1122',
      priority: 'ROUTINE',
      text: `Drainage flows within baseline capacity (${totalRainMm} mm scenario). Maintain routine nullah channel patrol and pump readiness.`,
    });
    return actions;
  }

  const hospitals = exposedFacilities.filter((f) => f.type === 'hospital');
  const rescueNodes = exposedFacilities.filter((f) => f.type === 'rescue_1122');
  const wasaNodes = exposedFacilities.filter((f) => f.type === 'wasa_station');

  if (hospitals.length > 0) {
    actions.push({
      agency: 'Hospital Readiness',
      priority: 'HIGH',
      text: `Protect backup power & ground-floor triage at ${hospitals.map((h) => h.name).join(', ')} (within modeled >=${thresholdMm} mm risk mask).`,
    });
  }

  if (rescueNodes.length > 0 || wasaNodes.length > 0) {
    const names = [...wasaNodes, ...rescueNodes].map((n) => n.name).join(', ');
    actions.push({
      agency: 'Rescue 1122 & WASA',
      priority: 'HIGH',
      text: `Clear storm drains, verify dewatering pumps, and pre-position Rescue 1122 boats near ${names}.`,
    });
  } else {
    actions.push({
      agency: 'Rescue 1122 & WASA',
      priority: simResult.alert_tier === 'Watch' || simResult.alert_tier === 'Warning' || simResult.alert_tier === 'Emergency' ? 'HIGH' : 'MEDIUM',
      text: 'Pre-stage Rescue 1122 boats at Katarian Bridge and clear storm drains across Gawalmandi & Arya Mohallah.',
    });
  }

  if (simResult.metrics.road_segments_exposed > 0) {
    actions.push({
      agency: 'Traffic & Sector Police',
      priority: 'MEDIUM',
      text: `Issue pre-storm traffic diversion advisory for ${simResult.metrics.road_segments_exposed} modeled flood-exposed arterial corridors and low-lying crossings.`,
    });
  }

  actions.push({
    agency: 'PMD / NDMA Verification',
    priority: 'MEDIUM',
    text: `Screening scenario (${totalRainMm} mm total) estimates ${simResult.metrics.exposed_area_km2.toFixed(2)} km² exposed — cross-verify with official PMD & NDMA bulletins before public directives.`,
  });

  return actions;
}
