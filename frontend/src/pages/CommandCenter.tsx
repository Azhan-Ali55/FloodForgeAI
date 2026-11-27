import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Building2,
  Coins,
  MapPin,
  ShieldAlert,
  Users,
  Waves,
} from 'lucide-react';
import { FloodRiskMapPanel } from '../components/dashboard/FloodRiskMapPanel';
import { ForecastCalendar } from '../components/dashboard/ForecastCalendar';
import {
  MitigationComparisonPanel,
  type MapComparisonMode,
} from '../components/dashboard/MitigationComparisonPanel';
import { RiskAlertsPanel } from '../components/dashboard/RiskAlertsPanel';
import { RiskSummaryPanel } from '../components/dashboard/RiskSummaryPanel';
import { AlertTierBadge, PageHeader } from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import type {
  BasemapStyle,
  ForecastHorizon,
  MapLayerVisibility,
  MapRasterLayer,
  SelectedMapFeature,
} from '../types/floodforge';
import { cn } from '../utils/cn';
import { formatNumber, formatPKR } from '../utils/formatters';

export function CommandCenter() {
  const {
    operationalMode,
    activeThresholdMm,
    forecastHorizon,
    setForecastHorizon,
    twin,
    weather,
    hasLoadedInitialWeather,
    selectedOutlookDay,
    setSelectedOutlookDay,
    demo2001DayOffset,
    demo2001Hour,
    setDemo2001DayOffset,
    setDemo2001Hour,
    monsoonStressMode,
    browserAlertsEnabled,
    enableBrowserNotifications,
    areaSafetySummary,
    operationalScenario,
    operationalResult,
    optConfig,
    setPitchBudgetPkr,
    optResult,
    isOptimizing,
    isAutoSyncingOpt,
    isOptStale,
    optError,
    runOptimization,
    monitoringStations,
    selectedStationId,
    setSelectedStationId,
  } = useFloodForge();

  const [layers, setLayers] = useState<MapLayerVisibility>({
    flood_risk: true,
    rainfall: false,
    elevation: false,
    population: false,
    waterway: true,
    roads: false,
    buildings: false,
    facilities: false,
    stations: true,
    safe_zones: true,
    neighborhoods: true,
    interventions: true,
  });
  const [activeRaster, setActiveRaster] = useState<MapRasterLayer>('flood_risk');
  const [basemap, setBasemap] = useState<BasemapStyle>('municipal_green');
  const [mapViewMode, setMapViewMode] = useState<MapComparisonMode>('compare');
  const [compareSplitPct, setCompareSplitPct] = useState<number>(50);
  const [selectedFeature, setSelectedFeature] = useState<SelectedMapFeature | null>(null);

  const toggleLayer = useCallback((key: keyof MapLayerVisibility) => {
    const rasterKeys: MapRasterLayer[] = ['flood_risk', 'rainfall', 'elevation', 'population'];
    if (rasterKeys.includes(key as MapRasterLayer)) {
      const rKey = key as MapRasterLayer;
      setActiveRaster(rKey);
      setLayers((prev) => ({
        ...prev,
        flood_risk: rKey === 'flood_risk',
        rainfall: rKey === 'rainfall',
        elevation: rKey === 'elevation',
        population: rKey === 'population',
      }));
      return;
    }
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const selectedDayObj = useMemo(() => {
    if (selectedOutlookDay === null) return null;
    return weather.outlook30d.find((d) => d.dayOffset === selectedOutlookDay) ?? null;
  }, [weather.outlook30d, selectedOutlookDay]);

  const activeBaselineResult = operationalResult;
  const activeMitigatedResult = optResult?.optimizedResult ?? operationalResult;
  const baseMetrics = activeBaselineResult.metrics;
  const topHotspot = areaSafetySummary.affectedStations[0] ?? null;

  const isHistoric2001 = operationalMode === 'demo_2001' && !monsoonStressMode;

  return (
    <div className="space-y-4">
      {/* 1. Top Header */}
      <PageHeader
        title="Nullah Lai Flood Intelligence"
        subtitle={`Islamabad–Rawalpindi Basin (33.65°N, 73.06°E) · Data synced: ${weather.fetchedAtPkt}${isHistoric2001 ? ' · Historical 2001 Cloudburst Replay' : ''}`}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Forecast horizon selector"
              className="flex items-center rounded-md bg-[#F1F5F9] border border-[#E2E8F0] p-0.5 text-xs"
            >
              {([24, 48, 72] as ForecastHorizon[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={forecastHorizon === h}
                  onClick={() => setForecastHorizon(h)}
                  className={cn(
                    'px-2.5 py-1 rounded font-mono font-medium transition-colors cursor-pointer',
                    forecastHorizon === h
                      ? 'bg-[#FFFFFF] text-[#0F172A] font-semibold shadow-2xs border border-[#CBD5E1]'
                      : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>

            <Link
              to="/monitoring"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] hover:bg-[#F8FAFC] text-xs font-medium text-[#334155]"
            >
              <Activity className="w-3.5 h-3.5 text-[#0F766E]" />
              Live Telemetry
            </Link>
          </div>
        }
      />

      {/* 2. Forecast Calendar (Full-Width Immediately Below Header) */}
      <ForecastCalendar
        weather={weather}
        operationalMode={operationalMode}
        monsoonStressMode={monsoonStressMode}
        selectedOutlookDay={selectedOutlookDay}
        onSelectOutlookDay={setSelectedOutlookDay}
        demo2001DayOffset={demo2001DayOffset}
        demo2001Hour={demo2001Hour}
        onDemo2001DayChange={setDemo2001DayOffset}
        onDemo2001HourChange={setDemo2001Hour}
      />

      {/* 3. Key Insights Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-[#64748B]">
            <span>Estimated Flood Risk</span>
            <Waves className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <div className="text-2xl font-semibold font-mono text-[#0F172A]">
              {baseMetrics.exposed_area_km2.toFixed(2)}{' '}
              <span className="text-xs font-normal text-[#64748B]">km²</span>
            </div>
            <AlertTierBadge tier={activeBaselineResult.alert_tier} />
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 truncate">
            {activeThresholdMm} mm threshold · {operationalScenario.label ?? `${forecastHorizon}h outlook`}
          </div>
        </div>

        <div className="p-3.5 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-[#64748B]">
            <span>Population Exposure</span>
            <Users className="w-4 h-4 text-[#1D4ED8]" />
          </div>
          <div className="mt-1.5 text-2xl font-semibold font-mono text-[#0F172A]">
            {formatNumber(baseMetrics.population_exposed)}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            <span>{formatNumber(baseMetrics.buildings_exposed)} structures · {baseMetrics.total_facilities_exposed} facilities</span>
          </div>
        </div>

        <div className="p-3.5 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-[#64748B]">
            <span>Priority Risk Area</span>
            <ShieldAlert className="w-4 h-4 text-[#EA580C]" />
          </div>
          <div className="mt-1.5 text-lg font-semibold text-[#0F172A] truncate">
            {topHotspot ? topHotspot.name : 'No elevated station'}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 flex items-center justify-between gap-2">
            <span>
              {areaSafetySummary.affectedStations.length} elevated points
            </span>
            {topHotspot && (
              <button
                type="button"
                onClick={() => setSelectedStationId(topHotspot.id)}
                className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline font-medium cursor-pointer"
              >
                <MapPin className="w-3 h-3" />
                Focus
              </button>
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-[#64748B]">
            <span>Mitigation Potential</span>
            <Coins className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <div className="text-2xl font-semibold font-mono text-[#0F766E]">
              {isOptStale
                ? 'Updating...'
                : optResult
                  ? optResult.weightedReductionPct > 0
                    ? `-${optResult.weightedReductionPct.toFixed(1)}%`
                    : '0.0%'
                  : 'N/A'}
            </div>
            {optResult && !isOptStale && (
              <span className="text-xs font-mono text-[#334155]">
                {formatPKR(optResult.totalCostPkr)}
              </span>
            )}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 flex items-center justify-between gap-2">
            <span>
              {optResult && !isOptStale
                ? `${optResult.selectedPortfolio.length} interventions modeled`
                : 'Awaiting portfolio calculation'}
            </span>
            <Link to="/mitigation" className="text-[#1D4ED8] hover:underline font-medium">
              Explore
            </Link>
          </div>
        </div>
      </div>

      {/* 4. Main Workspace: Dominant Flood-Risk Map + Contextual Risk & Mitigation Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8 space-y-4 min-w-0">
          <FloodRiskMapPanel
            twin={twin}
            simResult={activeMitigatedResult}
            baselineResult={activeBaselineResult}
            scenario={operationalScenario}
            stations={monitoringStations}
            selectedStationId={selectedStationId}
            onSelectStation={setSelectedStationId}
            interventions={optResult?.selectedPortfolio ?? []}
            layers={layers}
            onToggleLayer={toggleLayer}
            activeRaster={activeRaster}
            onActiveRasterChange={setActiveRaster}
            basemap={basemap}
            onBasemapChange={setBasemap}
            mapViewMode={mapViewMode}
            onMapViewModeChange={setMapViewMode}
            compareSplitPct={compareSplitPct}
            onCompareSplitChange={setCompareSplitPct}
            selectedFeature={selectedFeature}
            onSelectFeature={setSelectedFeature}
          />

          <RiskAlertsPanel
            operationalMode={operationalMode}
            monsoonStressMode={monsoonStressMode}
            weather={weather}
            hasLoadedInitialWeather={hasLoadedInitialWeather}
            scenario={operationalScenario}
            baselineResult={activeBaselineResult}
            areaSafetySummary={areaSafetySummary}
            browserAlertsEnabled={browserAlertsEnabled}
            onEnableNotifications={enableBrowserNotifications}
          />
        </div>

        <div className="lg:col-span-4 space-y-4 min-w-0">
          <RiskSummaryPanel
            operationalMode={operationalMode}
            monsoonStressMode={monsoonStressMode}
            forecastHorizon={forecastHorizon}
            selectedOutlookDay={selectedOutlookDay}
            selectedDayObj={selectedDayObj}
            weather={weather}
            hasLoadedInitialWeather={hasLoadedInitialWeather}
            scenario={operationalScenario}
            baselineResult={activeBaselineResult}
            optResult={optResult}
            areaSafetySummary={areaSafetySummary}
            activeThresholdMm={activeThresholdMm}
            onSelectStation={setSelectedStationId}
          />

          <MitigationComparisonPanel
            optConfig={optConfig}
            onBudgetChange={setPitchBudgetPkr}
            optResult={optResult}
            isOptimizing={isOptimizing}
            isAutoSyncingOpt={isAutoSyncingOpt}
            isOptStale={isOptStale}
            optError={optError}
            onRunOptimization={runOptimization}
            mapViewMode={mapViewMode}
            onMapViewModeChange={setMapViewMode}
            compareSplitPct={compareSplitPct}
            onCompareSplitChange={setCompareSplitPct}
          />
        </div>
      </div>
    </div>
  );
}
