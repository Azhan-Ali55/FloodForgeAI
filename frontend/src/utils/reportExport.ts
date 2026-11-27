import { PILOT_CONFIG } from '../engine/pilotConfig';
import type { OptimizationResult, SimResult, WeatherBundle } from '../types/floodforge';
import type { PreparednessActionItem } from '../engine/monitoringStations';

function escapeCsvCell(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function triggerCsvDownload(filename: string, rows: Array<Array<string | number>>): void {
  const csvContent = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeTimestampSlug(timestampPkt: string): string {
  return timestampPkt
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

export function downloadMitigationReportCsv(params: {
  modeLabel: string;
  timestampPkt: string;
  thresholdMm: number;
  soilMoistureLabel: string;
  optResult: OptimizationResult;
  weather: WeatherBundle;
}): void {
  const { modeLabel, timestampPkt, thresholdMm, soilMoistureLabel, optResult, weather } = params;
  const b = optResult.baselineResult.metrics;
  const o = optResult.optimizedResult.metrics;
  const hasRisk = b.exposed_area_km2 > 0 || b.buildings_exposed > 0;

  const rows: Array<Array<string | number>> = [
    ['FloodForgeAI - Municipal Flood Mitigation & Budget Impact Report'],
    ['Generated Mode', modeLabel],
    ['Weather Reference Time (PKT)', timestampPkt],
    ['Flood Cutoff Threshold (mm)', thresholdMm],
    ['Soil Moisture (0-9 cm)', soilMoistureLabel],
    ['24h Forecast Window (mm)', weather.forecast24hMm],
    ['Budget Allocated (PKR)', optResult.totalBudgetPkr],
    ['Budget Utilized (PKR)', optResult.totalCostPkr],
    ['Budget Utilization (%)', optResult.utilizationPct],
    ['Selected Mitigation Sites', hasRisk ? optResult.selectedPortfolio.length : 0],
    ['Equity Audit Status', hasRisk ? optResult.equityStatus.replace(/_/g, ' ') : 'NO FLOOD RISK'],
    [],
    ['IMPACT COMPARISON SUMMARY', 'Unit', 'Without Prevention', 'With Mitigation Portfolio', 'Saved / Reduction'],
    [
      'Flooded Area',
      'km2',
      b.exposed_area_km2.toFixed(2),
      o.exposed_area_km2.toFixed(2),
      Math.max(0, b.exposed_area_km2 - o.exposed_area_km2).toFixed(2),
    ],
    [
      'Population Exposed',
      'people',
      b.population_exposed,
      o.population_exposed,
      Math.max(0, b.population_exposed - o.population_exposed),
    ],
    [
      'Buildings Exposed',
      'structures',
      b.buildings_exposed,
      o.buildings_exposed,
      Math.max(0, b.buildings_exposed - o.buildings_exposed),
    ],
    [
      'Road Corridors Exposed',
      'segments',
      b.road_segments_exposed,
      o.road_segments_exposed,
      Math.max(0, b.road_segments_exposed - o.road_segments_exposed),
    ],
    [
      'Critical Facilities Exposed',
      'facilities',
      b.total_facilities_exposed,
      o.total_facilities_exposed,
      Math.max(0, b.total_facilities_exposed - o.total_facilities_exposed),
    ],
    [],
    ['ZONE EQUITY AUDIT', 'Jurisdiction', 'Baseline Area (km2)', 'Post-Mitigation Area (km2)', 'Delta (%)', 'Status'],
    ...optResult.zoneEquityRows.map((z) => [
      z.zoneName,
      z.sector,
      z.baselineAreaKm2.toFixed(4),
      z.postAreaKm2.toFixed(4),
      `${z.pctChange}%`,
      z.status.replace(/_/g, ' '),
    ]),
    [],
    ['SELECTED MITIGATION PORTFOLIO', 'Intervention Type', 'Zone', 'Latitude', 'Longitude', 'Cost (PKR)', 'Expected Impact (%)'],
    ...(hasRisk && optResult.selectedPortfolio.length > 0
      ? optResult.selectedPortfolio.map((iv) => [
          iv.id,
          PILOT_CONFIG.interventions[iv.type].label,
          iv.zoneName,
          iv.lat.toFixed(5),
          iv.lon.toFixed(5),
          iv.cost_pkr,
          iv.expected_impact_pct.toFixed(2),
        ])
      : [['None', 'No flood risk modeled - no interventions required', '-', '-', '-', 0, '0.00']]),
  ];

  triggerCsvDownload(
    `FloodForgeAI_Budget_Impact_Report_${safeTimestampSlug(timestampPkt) || 'current'}.csv`,
    rows
  );
}

export function downloadSimulationReportCsv(params: {
  scenarioLabel: string;
  timestampPkt: string;
  thresholdMm: number;
  baseline: SimResult;
  simulated: SimResult;
  actions: PreparednessActionItem[];
}): void {
  const { scenarioLabel, timestampPkt, thresholdMm, baseline, simulated, actions } = params;
  const b = baseline.metrics;
  const s = simulated.metrics;

  const rows: Array<Array<string | number>> = [
    ['FloodForgeAI - Flood Scenario Simulation Report'],
    ['Scenario', scenarioLabel],
    ['Timestamp (PKT)', timestampPkt],
    ['Flood Cutoff Threshold (mm)', thresholdMm],
    ['Alert Tier', simulated.alert_tier],
    [],
    ['EXPOSURE INDICATOR', 'Unit', 'Operational Baseline', 'Simulated Scenario', 'Difference'],
    ['Affected Area', 'km2', b.exposed_area_km2.toFixed(2), s.exposed_area_km2.toFixed(2), (s.exposed_area_km2 - b.exposed_area_km2).toFixed(2)],
    ['Exposed Population', 'people', b.population_exposed, s.population_exposed, s.population_exposed - b.population_exposed],
    ['Affected Buildings', 'structures', b.buildings_exposed, s.buildings_exposed, s.buildings_exposed - b.buildings_exposed],
    ['Exposed Arterial Roads', 'corridors', b.road_segments_exposed, s.road_segments_exposed, s.road_segments_exposed - b.road_segments_exposed],
    ['Critical Facilities Impacted', 'facilities', b.total_facilities_exposed, s.total_facilities_exposed, s.total_facilities_exposed - b.total_facilities_exposed],
    [],
    ['PREPAREDNESS ACTION PLAN', 'Priority', 'Recommended Action'],
    ...actions.map((a) => [a.agency, a.priority, a.text]),
  ];

  triggerCsvDownload(
    `FloodForgeAI_Simulation_Report_${safeTimestampSlug(timestampPkt) || 'scenario'}.csv`,
    rows
  );
}
