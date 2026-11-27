import React from 'react';
import { AlertTriangle, Bell, CheckCircle2, Info } from 'lucide-react';
import type {
  AreaSafetySummary,
  OperationalMode,
  Scenario,
  SimResult,
  WeatherBundle,
} from '../../types/floodforge';
import { MunicipalPanel } from '../ui/Primitives';

interface RiskAlertsPanelProps {
  operationalMode: OperationalMode;
  monsoonStressMode: boolean;
  weather: WeatherBundle;
  hasLoadedInitialWeather: boolean;
  scenario: Scenario;
  baselineResult: SimResult;
  areaSafetySummary: AreaSafetySummary;
  browserAlertsEnabled: boolean;
  onEnableNotifications: () => Promise<void>;
}

export const RiskAlertsPanel = React.memo(function RiskAlertsPanel({
  operationalMode,
  monsoonStressMode,
  weather,
  hasLoadedInitialWeather,
  scenario,
  baselineResult,
  areaSafetySummary,
  browserAlertsEnabled,
  onEnableNotifications,
}: RiskAlertsPanelProps) {
  const isSimulatedOrHistorical =
    operationalMode === 'demo_2001' ||
    monsoonStressMode ||
    scenario.tag === 'HYPOTHETICAL_STRESS_TEST' ||
    weather.source === 'SYNTHETIC_DEMO';

  const isDataReliable =
    hasLoadedInitialWeather &&
    weather.forecastState === 'verified' &&
    (weather.missingHoursCount ?? 0) === 0;

  return (
    <MunicipalPanel
      title="Risk Alerts"
      icon={<AlertTriangle className="w-4 h-4" />}
      rightSlot={
        <button
          type="button"
          onClick={() => void onEnableNotifications()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[11px] font-medium text-[#0F172A] cursor-pointer"
        >
          <Bell className="w-3.5 h-3.5 text-[#0F766E]" />
          {browserAlertsEnabled ? 'Session Alerts On' : 'Enable Alerts'}
        </button>
      }
      bodyClassName="p-3.5 space-y-2.5"
    >
      {isSimulatedOrHistorical ? (
        <div className="p-2.5 rounded-md border border-[#BFDBFE] bg-[#EFF6FF] text-xs text-[#1E3A8A] flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#1D4ED8]" />
          <div>
            <div className="font-semibold">Demonstration Scenario Active</div>
            <p className="text-[11px] mt-0.5 text-[#1E40AF]">
              Historical or synthetic stress scenarios do not generate operational public flood advisories.
            </p>
          </div>
        </div>
      ) : !isDataReliable ? (
        <div className="p-2.5 rounded-md border border-[#FDE68A] bg-[#FFFBEB] text-xs text-[#92400E] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#D97706]" />
          <div>
            <div className="font-semibold">Awaiting Complete Verified Feed</div>
            <p className="text-[11px] mt-0.5">
              Telemetry is {hasLoadedInitialWeather ? weather.forecastState : 'loading'}. Operational flood alerts remain gated until full continuous coverage is verified.
            </p>
          </div>
        </div>
      ) : weather.earliestFloodAlert ? (
        <div className="p-2.5 rounded-md border border-[#FECACA] bg-[#FEF2F2] text-xs text-[#991B1B] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#DC2626]" />
          <div>
            <div className="font-semibold">Upcoming Heavy Rain Watch</div>
            <p className="text-[11px] mt-0.5">{weather.earliestFloodAlert.summary}</p>
          </div>
        </div>
      ) : (
        <div className="p-2.5 rounded-md border border-[#A7F3D0] bg-[#ECFDF5] text-xs text-[#065F46] flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#059669]" />
          <div>
            <div className="font-semibold">No Threshold Exceedance Forecasted</div>
            <p className="text-[11px] mt-0.5">
              Verified forecast window shows runoff below flood exceedance thresholds.
            </p>
          </div>
        </div>
      )}

      {baselineResult.metrics.total_facilities_exposed > 0 && (
        <div className="p-2.5 rounded-md border border-[#FED7AA] bg-[#FFF7ED] text-xs text-[#9A3412]">
          <span className="font-semibold">
            {baselineResult.metrics.total_facilities_exposed} critical facilities
          </span>{' '}
          fall inside the modeled inundation mask; review evacuation &amp; drainage priorities before intervention staging.
        </div>
      )}

      <div className="text-[11px] text-[#64748B] leading-snug pt-1 border-t border-[#F1F5F9]">
        Safe high-ground zones ({areaSafetySummary.safeZones.length} sectors, {areaSafetySummary.safeAreaKm2.toFixed(2)} km²) are terrain screening proxies — always cross-verify with official PMD &amp; NDMA advisories.
      </div>
    </MunicipalPanel>
  );
});
