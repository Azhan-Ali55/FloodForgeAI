import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
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
import { RiskGauge } from '../components/ui/RiskGauge';
import { AlertTierBadge } from '../components/ui/Primitives';
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

/** Islamabad scenery top-right SVG (subtle decorative illustration) */
function LocationScenery() {
  return (
    <svg
      viewBox="0 0 320 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="w-full h-full"
      preserveAspectRatio="xMaxYMax meet"
    >
      <defs>
        <linearGradient id="sceneFade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F1F6FB" stopOpacity="1" />
          <stop offset="40%" stopColor="#F1F6FB" stopOpacity="0" />
          <stop offset="100%" stopColor="#F1F6FB" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="skyBlue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#DBEAFE" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#F1F6FB" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hillFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A7C5A0" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#6B9E6B" stopOpacity="0.3" />
        </linearGradient>
        <clipPath id="sceneClip">
          <rect x="0" y="0" width="320" height="90" />
        </clipPath>
      </defs>

      <g clipPath="url(#sceneClip)">
        {/* Sky */}
        <rect x="0" y="0" width="320" height="90" fill="url(#skyBlue)" />

        {/* Far hills */}
        <path d="M80 70 L120 30 L160 55 L200 20 L250 40 L300 15 L320 25 L320 90 L80 90Z"
          fill="#B8D4B0" opacity="0.4" />

        {/* Mid hills */}
        <path d="M140 75 L175 42 L210 60 L250 35 L290 50 L320 38 L320 90 L140 90Z"
          fill="#8FB88A" opacity="0.5" />

        {/* Foreground */}
        <path d="M200 85 L230 65 L260 75 L290 60 L320 68 L320 90 L200 90Z"
          fill="#6B9E6B" opacity="0.45" />

        {/* Nullah Lai water */}
        <path
          d="M140 82 Q180 78 220 82 Q260 86 300 82 Q310 81 320 82 L320 90 L140 90Z"
          fill="#93C5FD"
          opacity="0.35"
        />

        {/* Trees */}
        <g opacity="0.35">
          <rect x="195" y="68" width="2.5" height="12" fill="#2D5A1B" />
          <ellipse cx="196.3" cy="65" rx="6" ry="7" fill="#2D5A1B" />
          <rect x="210" y="70" width="2" height="10" fill="#2D5A1B" />
          <ellipse cx="211" cy="67" rx="5" ry="6" fill="#2D5A1B" />
          <rect x="285" y="62" width="2.5" height="13" fill="#2D5A1B" />
          <ellipse cx="286.3" cy="59" rx="6" ry="7" fill="#2D5A1B" />
          <rect x="300" y="64" width="2" height="11" fill="#2D5A1B" />
          <ellipse cx="301" cy="61" rx="5" ry="6" fill="#2D5A1B" />
        </g>

        {/* Left-to-right fade overlay */}
        <rect x="0" y="0" width="320" height="90" fill="url(#sceneFade)" />
      </g>
    </svg>
  );
}

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

  const hasValidRiskData =
    hasLoadedInitialWeather &&
    (operationalMode === 'demo_2001' || weather.forecastState !== 'unavailable');

  // Station status summary
  const stationSummary = useMemo(() => {
    const counts = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
    for (const s of monitoringStations) counts[s.riskLevel]++;
    return counts;
  }, [monitoringStations]);

  const alertCount = stationSummary.High + stationSummary.Critical;

  return (
    <div className="space-y-4">

      {/* ── LOCATION OVERVIEW HERO ── */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, #EEF4FB 100%)',
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 8px rgba(16,34,61,0.06)',
          minHeight: '120px',
        }}
      >
        {/* Scenery illustration (right side, soft opacity) */}
        <div className="hidden sm:block absolute inset-y-0 right-0 w-1/2 md:w-2/5 opacity-60 pointer-events-none">
          <LocationScenery />
        </div>

        <div className="relative z-10 p-4 sm:p-5 md:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* Left: location text + status */}
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0F766E] tracking-widest uppercase">
              <Waves className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Nullah Lai Flood Intelligence</span>
            </div>
            <h1
              className="font-heading font-bold text-[#10223D] leading-tight"
              style={{ fontSize: 'clamp(22px, 4vw, 34px)', letterSpacing: '-0.03em' }}
            >
              Nullah Lai Basin
            </h1>
            <p className="text-sm text-[#64748B] font-medium">
              Islamabad · Rawalpindi · 33.65°N, 73.06°E
            </p>

            {/* Status pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold',
                  isHistoric2001
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : hasLoadedInitialWeather
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    isHistoric2001 ? 'bg-red-500' : hasLoadedInitialWeather ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  )}
                />
                {isHistoric2001 ? '2001 Archive' : hasLoadedInitialWeather ? 'Live Data' : 'Loading…'}
              </span>

              <AlertTierBadge tier={activeBaselineResult.alert_tier} />

              <span className="text-[11px] text-[#64748B] font-mono">
                {monitoringStations.length} stations · {alertCount} alerts
              </span>
            </div>
          </div>

          {/* Right: Risk gauge + horizon selector inside clean translucent card so scenery never reduces contrast */}
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 self-stretch sm:self-auto bg-white/85 backdrop-blur-xs border border-[#E2E8F0] rounded-xl p-3.5 sm:px-5 shadow-2xs">
            <RiskGauge
              tier={activeBaselineResult.alert_tier}
              exposedKm2={baseMetrics.exposed_area_km2}
              hasValidData={hasValidRiskData}
              size={156}
            />

            <div className="w-full sm:w-px sm:h-24 h-px bg-[#E2E8F0]" aria-hidden="true" />

            {/* Forecast horizon */}
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="text-[11px] text-[#64748B] font-semibold uppercase tracking-wider">
                Horizon
              </div>
              <div
                role="group"
                aria-label="Forecast horizon"
                className="flex sm:flex-col gap-1.5"
              >
                {([24, 48, 72] as ForecastHorizon[]).map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={forecastHorizon === h}
                    onClick={() => setForecastHorizon(h)}
                    className={cn(
                      'min-w-[48px] min-h-[34px] px-3 py-1 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer',
                      forecastHorizon === h
                        ? 'bg-[#12345B] text-white shadow-sm'
                        : 'bg-[#F1F6FB] text-[#475569] hover:text-[#10223D] border border-[#E2E8F0]'
                    )}
                  >
                    {h}h
                  </button>
                ))}
              </div>
              <Link
                to="/monitoring"
                className="flex items-center gap-1 text-[11px] text-[#0F766E] hover:underline font-medium mt-0.5 whitespace-nowrap"
              >
                <Activity className="w-3 h-3" />
                Live Telemetry
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── FLOOD OUTLOOK (ABOVE SUMMARY METRIC CARDS) ── */}
      <ForecastCalendar
        weather={weather}
        operationalMode={operationalMode}
        monsoonStressMode={monsoonStressMode}
        selectedOutlookDay={selectedOutlookDay}
        onSelectOutlookDay={setSelectedOutlookDay}
      />

      {/* ── 4 SUMMARY METRIC CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Flood Risk */}
        <div className="ff-kpi">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Flood Risk</span>
            <Waves className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#10223D]">
            {baseMetrics.exposed_area_km2.toFixed(2)}{' '}
            <span className="text-xs font-normal text-[#94A3B8]">km²</span>
          </div>
          <div className="text-[11px] text-[#94A3B8] mt-1 truncate">
            {activeThresholdMm} mm threshold · {forecastHorizon}h outlook
          </div>
        </div>

        {/* Population */}
        <div className="ff-kpi">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Population</span>
            <Users className="w-4 h-4 text-[#38BDF8]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#10223D]">
            {formatNumber(baseMetrics.population_exposed)}
          </div>
          <div className="text-[11px] text-[#94A3B8] mt-1">
            {formatNumber(baseMetrics.buildings_exposed)} structures exposed
          </div>
        </div>

        {/* Priority Zone */}
        <div className="ff-kpi">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Priority Zone</span>
            <ShieldAlert className="w-4 h-4 text-[#EA580C]" />
          </div>
          <div className="text-base font-semibold text-[#10223D] truncate mt-1">
            {topHotspot ? topHotspot.name : 'None elevated'}
          </div>
          <div className="text-[11px] text-[#94A3B8] mt-1 flex items-center justify-between">
            <span>{areaSafetySummary.affectedStations.length} elevated points</span>
            {topHotspot && (
              <button
                type="button"
                onClick={() => setSelectedStationId(topHotspot.id)}
                className="flex items-center gap-0.5 text-[#0F766E] hover:underline font-medium cursor-pointer"
              >
                <MapPin className="w-3 h-3" />
                Focus
              </button>
            )}
          </div>
        </div>

        {/* Mitigation */}
        <div className="ff-kpi">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Mitigation</span>
            <Coins className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#0F766E]">
            {isOptStale
              ? '—'
              : optResult
                ? optResult.weightedReductionPct > 0
                  ? `-${optResult.weightedReductionPct.toFixed(1)}%`
                  : '0.0%'
                : 'N/A'}
          </div>
          <div className="text-[11px] text-[#94A3B8] mt-1 flex items-center justify-between">
            <span>
              {optResult && !isOptStale
                ? formatPKR(optResult.totalCostPkr)
                : 'Calculating…'}
            </span>
            <Link to="/mitigation" className="text-[#0F766E] hover:underline font-medium flex items-center gap-0.5">
              Explore <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── MAIN WORKSPACE: Map (lg:8) + Right Panel (lg:4) ── */}
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
