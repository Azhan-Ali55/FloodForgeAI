import React from 'react';
import { Building2, MapPin, ShieldAlert, Users, Waves } from 'lucide-react';
import type {
  AreaSafetySummary,
  ForecastHorizon,
  OperationalMode,
  OptimizationResult,
  OutlookDayPoint,
  Scenario,
  SimResult,
  WeatherBundle,
} from '../../types/floodforge';
import { formatNumber } from '../../utils/formatters';
import { AlertTierBadge, MunicipalPanel, ScenarioTagBadge } from '../ui/Primitives';

interface RiskSummaryPanelProps {
  operationalMode: OperationalMode;
  monsoonStressMode: boolean;
  forecastHorizon: ForecastHorizon;
  selectedOutlookDay: number | null;
  selectedDayObj: OutlookDayPoint | null;
  weather: WeatherBundle;
  hasLoadedInitialWeather: boolean;
  scenario: Scenario;
  baselineResult: SimResult;
  optResult: OptimizationResult | null;
  areaSafetySummary: AreaSafetySummary;
  activeThresholdMm: number;
  onSelectStation: (stationId: string) => void;
}

export const RiskSummaryPanel = React.memo(function RiskSummaryPanel({
  operationalMode,
  monsoonStressMode,
  forecastHorizon,
  selectedOutlookDay,
  selectedDayObj,
  weather,
  hasLoadedInitialWeather,
  scenario,
  baselineResult,
  optResult,
  areaSafetySummary,
  activeThresholdMm,
  onSelectStation,
}: RiskSummaryPanelProps) {
  const m = baselineResult.metrics;
  const isLiveOperationalVerified =
    hasLoadedInitialWeather &&
    operationalMode === 'live_ops' &&
    !monsoonStressMode &&
    weather.source === 'OPEN_METEO_LIVE' &&
    weather.forecastState === 'verified' &&
    (weather.missingHoursCount ?? 0) === 0 &&
    (selectedDayObj ? selectedDayObj.isAvailable : true);

  const hasModelledFloodRisk = m.exposed_area_km2 > 0 || m.buildings_exposed > 0;
  const engineProvenance =
    optResult?.engineSource === 'python_api'
      ? 'Python Backend'
      : 'In-Browser D8';

  const statusTone = !isLiveOperationalVerified && operationalMode === 'live_ops'
    ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
    : hasModelledFloodRisk
      ? 'border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412]'
      : 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]';

  const statusHeading =
    !hasLoadedInitialWeather
      ? 'Pending Telemetry Verification'
      : operationalMode === 'demo_2001'
        ? 'Historical / Stress-Test Replay Active'
        : monsoonStressMode
          ? 'Simulated Monsoon Surge Active'
          : !isLiveOperationalVerified
            ? weather.forecastState === 'unavailable'
              ? 'Weather Forecast Unavailable'
              : 'Incomplete or Stale Forecast Coverage'
            : hasModelledFloodRisk
              ? `Flood Exposure Modeled (${forecastHorizon}h Horizon)`
              : `No Flood Exceedance Modeled (${forecastHorizon}h Verified)`;

  const statusSubtext =
    !hasLoadedInitialWeather
      ? 'Synchronizing initial Open-Meteo and basin forecast telemetry...'
      : !isLiveOperationalVerified && operationalMode === 'live_ops'
        ? `Forecast state: ${weather.forecastState} (${weather.coveragePct}% coverage, ${weather.missingHoursCount} missing hours). Do not treat incomplete data as an all-clear.`
        : selectedOutlookDay !== null && selectedDayObj
          ? `${selectedDayObj.dateLabel} (${selectedDayObj.monthYearLabel}) · ${selectedDayObj.isAvailable && selectedDayObj.rainfallMm !== null ? `${selectedDayObj.rainfallMm.toFixed(1)} mm/d` : 'Data unavailable'} · ${activeThresholdMm} mm threshold`
          : `${scenario.label ?? `${forecastHorizon}h Scenario`} · ${activeThresholdMm} mm cutoff`;

  return (
    <MunicipalPanel
      title="Flood Risk"
      subtitle={`Active Engine: ${engineProvenance}`}
      icon={<Waves className="w-4 h-4" />}
      rightSlot={
        <div className="flex items-center gap-1.5">
          <ScenarioTagBadge tag={scenario.tag} />
          <AlertTierBadge tier={baselineResult.alert_tier} />
        </div>
      }
      bodyClassName="p-3.5 space-y-3"
    >
      <div className={`px-3 py-2.5 rounded-md border text-xs ${statusTone}`}>
        <div className="font-semibold">{statusHeading}</div>
        <div className="text-[11px] opacity-90 mt-0.5">{statusSubtext}</div>
      </div>

      {/* 4 Core Quantitative Flood Risk Metrics */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-2.5 rounded-md border border-[#E2E8F0] bg-[#F1F6FB]">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#64748B]">
            <span>Flooded Area</span>
            <Waves className="w-3.5 h-3.5 text-[#0F766E]" />
          </div>
          <div className="text-lg font-semibold font-mono text-[#0F172A] mt-0.5">
            {m.exposed_area_km2.toFixed(2)} <span className="text-xs font-normal text-[#64748B]">km²</span>
          </div>
        </div>

        <div className="p-2.5 rounded-md border border-[#E2E8F0] bg-[#F1F6FB]">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#64748B]">
            <span>Est. Population</span>
            <Users className="w-3.5 h-3.5 text-[#1D4ED8]" />
          </div>
          <div className="text-lg font-semibold font-mono text-[#0F172A] mt-0.5">
            {formatNumber(m.population_exposed)}
          </div>
        </div>

        <div className="p-2.5 rounded-md border border-[#E2E8F0] bg-[#F1F6FB]">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#64748B]">
            <span>Structures</span>
            <Building2 className="w-3.5 h-3.5 text-[#EA580C]" />
          </div>
          <div className="text-lg font-semibold font-mono text-[#0F172A] mt-0.5">
            {formatNumber(m.buildings_exposed)}
          </div>
        </div>

        <div className="p-2.5 rounded-md border border-[#E2E8F0] bg-[#F1F6FB]">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#64748B]">
            <span>Critical Sites</span>
            <ShieldAlert className="w-3.5 h-3.5 text-[#DC2626]" />
          </div>
          <div className="text-lg font-semibold font-mono text-[#0F172A] mt-0.5">
            {m.total_facilities_exposed}
          </div>
        </div>
      </div>

      {/* High-Risk Priority Locations */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-[#475569]">
          <span>Priority Basin Monitoring Points</span>
          <span className="font-mono text-[#64748B]">
            {areaSafetySummary.affectedStations.length} elevated
          </span>
        </div>
        {areaSafetySummary.affectedStations.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {areaSafetySummary.affectedStations.slice(0, 4).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelectStation(st.id)}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] hover:bg-[#F1F6FB] text-left text-xs cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5 min-w-0 font-medium text-[#0F172A]">
                  <MapPin className="w-3.5 h-3.5 text-[#EA580C] flex-shrink-0" />
                  <span className="truncate">{st.name}</span>
                </span>
                <span className="font-mono text-[11px] text-[#9A3412] flex-shrink-0">
                  {st.modeledAccumulationMm.toFixed(0)} mm
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 py-2 rounded-md border border-[#E2E8F0] bg-[#F1F6FB] text-xs text-[#475569]">
            {isLiveOperationalVerified
              ? 'No basin monitoring stations exceed the modeled runoff warning threshold.'
              : 'Monitoring station exceedance requires a verified or simulated rainfall run.'}
          </div>
        )}
      </div>
    </MunicipalPanel>
  );
});
