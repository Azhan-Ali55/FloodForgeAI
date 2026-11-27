import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle2,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Coins,
  Download,
  Droplets,
  FileBarChart2,
  Gauge,
  Loader2,
  MapPin,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Thermometer,
  TrendingDown,
  Users,
  Waves,
  Wind,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GeospatialMap } from '../components/maps/GeospatialMap';
import {
  MunicipalPanel,
  ScenarioTagBadge,
  StationRiskBadge,
} from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import {
  buildPreparednessActions,
  computeFloodRiskIndex,
} from '../engine/monitoringStations';
import {
  ALERT_TIER_META,
  PILOT_CONFIG,
  STATION_RISK_META,
} from '../engine/pilotConfig';
import { extractTopHotspots } from '../engine/simulator';
import { formatSoilMoistureStatus } from '../services/forecastService';
import type {
  AlertTier,
  ForecastHorizon,
  MapLayerVisibility,
  StationRiskLevel,
  StudyAreaId,
} from '../types/floodforge';
import { cn } from '../utils/cn';
import { formatNumber } from '../utils/formatters';
import { downloadMitigationReportCsv } from '../utils/reportExport';

function WeatherConditionIcon({ code }: { code: number | null }) {
  if (code === null) return <Cloud className="w-5 h-5 text-[#5A6A7E]" />;
  if (code === 0) return <Sun className="w-5 h-5 text-[#EF8735]" />;
  if (code <= 2) return <CloudSun className="w-5 h-5 text-[#EF8735]" />;
  if (code >= 95) return <CloudLightning className="w-5 h-5 text-[#D94343]" />;
  if (code >= 51) return <CloudRain className="w-5 h-5 text-[#244D8F]" />;
  return <Cloud className="w-5 h-5 text-[#5A6A7E]" />;
}

export function CommandCenter() {
  const navigate = useNavigate();
  const {
    studyAreaId,
    setStudyAreaId,
    operationalMode,
    setOperationalMode,
    activeThresholdMm,
    backendForecast,
    forecastHorizon,
    setForecastHorizon,
    twin,
    weather,
    selectedOutlookDay,
    setSelectedOutlookDay,
    demo2001DayOffset,
    demo2001Hour,
    setDemo2001DayOffset,
    setDemo2001Hour,
    monsoonStressMode,
    toggleMonsoonStressMode,
    browserAlertsEnabled,
    enableBrowserNotifications,
    areaSafetySummary,
    operationalScenario,
    operationalResult,
    highEnvelopeResult,
    monitoringStations,
    selectedStationId,
    setSelectedStationId,
    optConfig,
    setPitchBudgetPkr,
    optResult,
    isOptimizing,
    isAutoSyncingOpt,
    engineMode,
    apiHealthy,
    officialAgencyOverride,
    pushToast,
  } = useFloodForge();

  const soilMoisture = useMemo(
    () =>
      formatSoilMoistureStatus(
        weather,
        operationalMode === 'demo_2001' ? null : backendForecast
      ),
    [weather, operationalMode, backendForecast]
  );

  const preparednessActions = useMemo(() => {
    const totalRain = Number(
      (
        operationalScenario.rainfall_mm_per_hr *
        operationalScenario.duration_hr *
        (operationalScenario.uncertainty_factor ?? 1)
      ).toFixed(0)
    );
    return buildPreparednessActions(
      twin,
      operationalResult,
      totalRain,
      activeThresholdMm
    );
  }, [twin, operationalResult, operationalScenario, activeThresholdMm]);

  const operationalHotspots = useMemo(
    () => extractTopHotspots(twin, operationalResult, 6),
    [twin, operationalResult]
  );

  const [forecastDaysOption, setForecastDaysOption] = useState<3 | 5>(3);
  const [layers, setLayers] = useState<MapLayerVisibility>({
    flood_risk: true,
    rainfall: false,
    elevation: false,
    population: false,
    waterway: true,
    roads: true,
    buildings: false,
    facilities: false,
    stations: true,
    interventions: false,
    neighborhoods: true,
    safe_zones: false,
  });

  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
  } | null>(null);

  const toggleLayer = (key: keyof MapLayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Weather Forecast chart data (3-day = 72h or 5-day = 120h)
  const forecastHours = forecastDaysOption === 3 ? 72 : 120;
  const forecastChartSeries = useMemo(() => {
    const step = forecastDaysOption === 3 ? 3 : 6;
    return weather.hourlyForecast
      .slice(0, forecastHours)
      .filter((_, idx) => idx % step === 0)
      .map((h) => ({
        hour: `+${h.hourOffset}h`,
        label: h.label.replace(',', ''),
        temp: h.temperatureC,
        rain: h.precipitationMm,
        wind: h.windSpeedKmh,
      }));
  }, [weather.hourlyForecast, forecastHours, forecastDaysOption]);

  const dailySummaryCards = useMemo(
    () => weather.dailyForecast5d.slice(0, forecastDaysOption),
    [weather.dailyForecast5d, forecastDaysOption]
  );

  // Water-level / runoff trend across key monitoring stations (ordered North -> South)
  const stationWaterTrend = useMemo(() => {
    return [...monitoringStations]
      .sort((a, b) => a.row - b.row)
      .slice(0, 8)
      .map((s) => ({
        code: s.stationCode,
        name: s.name,
        levelM: s.waterLevelM ?? 0,
        risk: s.riskLevel,
      }));
  }, [monitoringStations]);

  const peakWaterLevelM = useMemo(() => {
    if (monitoringStations.length === 0) return 0;
    return Math.max(...monitoringStations.map((s) => s.waterLevelM ?? 0));
  }, [monitoringStations]);

  const avgWaterLevelM = useMemo(() => {
    if (monitoringStations.length === 0) return 0;
    return (
      monitoringStations.reduce((sum, s) => sum + (s.waterLevelM ?? 0), 0) /
      monitoringStations.length
    );
  }, [monitoringStations]);

  // Flood Risk Index & Classification
  const riskSummary = useMemo(
    () => computeFloodRiskIndex(operationalResult, monitoringStations),
    [operationalResult, monitoringStations]
  );

  // Envelope delta (uncertainty range upper bound vs operational baseline)
  const levelDeltaM = useMemo(() => {
    const baseArea = operationalResult.metrics.exposed_area_km2;
    const highArea = highEnvelopeResult.metrics.exposed_area_km2;
    const diffPct = baseArea > 0 ? ((highArea - baseArea) / baseArea) * 100 : 0;
    return Number(diffPct.toFixed(1));
  }, [operationalResult.metrics.exposed_area_km2, highEnvelopeResult.metrics.exposed_area_km2]);

  // Active alerts built directly from real hotspots + critical/high stations
  const activeAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      title: string;
      location: string;
      riskLevel: StationRiskLevel;
      timestamp: string;
      description: string;
      lat: number;
      lon: number;
      stationId?: string;
    }> = [];

    for (const st of monitoringStations) {
      if (st.riskLevel === 'Critical' || st.riskLevel === 'High') {
        alerts.push({
          id: `st-${st.id}`,
          title:
            st.riskLevel === 'Critical'
              ? `Critical Runoff Threshold — ${st.stationCode}`
              : `Elevated Water Level — ${st.stationCode}`,
          location: `${st.name} (${st.location})`,
          riskLevel: st.riskLevel,
          timestamp: st.lastUpdated.split(',').pop()?.trim() ?? st.lastUpdated,
          description: `Modeled D8 proxy ${st.waterLevelM?.toFixed(2)} m (${st.modeledAccumulationMm.toFixed(0)} mm) at ${st.elevationM} m elevation.`,
          lat: st.lat,
          lon: st.lon,
          stationId: st.id,
        });
      }
    }

    for (const hs of operationalHotspots) {
      if (hs.riskTier === 'Warning' || hs.riskTier === 'Watch' || hs.riskTier === 'Emergency') {
        alerts.push({
          id: `hs-${hs.zoneId}`,
          title: `Ward Flood Hotspot #${hs.rank}`,
          location: `${hs.zoneName} (${hs.sector})`,
          riskLevel: hs.riskTier === 'Watch' ? 'High' : 'Critical',
          timestamp: operationalResult.timestamp_pkt.split(',').pop()?.trim() ?? '',
          description: `Peak modeled accumulation ${hs.peakAccumulationMm} mm affecting ~${hs.exposedPopulation.toLocaleString()} residents.`,
          lat: hs.lat,
          lon: hs.lon,
        });
      }
    }

    if (alerts.length === 0) {
      alerts.push({
        id: 'baseline-clear',
        title: 'Basin Monitoring Normal',
        location: PILOT_CONFIG.studyAreas[studyAreaId].shortName,
        riskLevel: 'Low',
        timestamp: weather.fetchedAtPkt.split(',').pop()?.trim() ?? '',
        description: 'No monitoring stations exceed screening runoff alert thresholds.',
        lat: PILOT_CONFIG.studyAreas[studyAreaId].center[0],
        lon: PILOT_CONFIG.studyAreas[studyAreaId].center[1],
      });
    }

    const order: Record<StationRiskLevel, number> = {
      Critical: 0,
      High: 1,
      Moderate: 2,
      Low: 3,
    };
    return alerts.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]).slice(0, 6);
  }, [monitoringStations, operationalHotspots, operationalResult.timestamp_pkt, studyAreaId, weather.fetchedAtPkt]);

  const activeWarningCount = activeAlerts.filter(
    (a) => a.riskLevel === 'High' || a.riskLevel === 'Critical'
  ).length;

  const isLiveWeather = operationalMode === 'live_ops' && weather.source === 'OPEN_METEO_LIVE';

  const moneySlide = useMemo(() => {
    const base = optResult?.baselineResult.metrics;
    const mit = optResult?.optimizedResult.metrics;
    const baseArea = base?.exposed_area_km2 ?? 0;
    const mitArea = mit?.exposed_area_km2 ?? 0;
    const hasFloodRisk = baseArea > 0 || (base?.buildings_exposed ?? 0) > 0;
    const areaReductionPct =
      baseArea > 0 ? Number((((baseArea - mitArea) / baseArea) * 100).toFixed(1)) : 0;
    const baseBldg = base?.buildings_exposed ?? 0;
    const mitBldg = mit?.buildings_exposed ?? 0;
    const buildingsSaved = Math.max(0, baseBldg - mitBldg);
    const basePop = base?.population_exposed ?? 0;
    const mitPop = mit?.population_exposed ?? 0;
    const populationProtected = Math.max(0, basePop - mitPop);
    const baseRoads = base?.road_segments_exposed ?? 0;
    const mitRoads = mit?.road_segments_exposed ?? 0;
    const roadsSaved = Math.max(0, baseRoads - mitRoads);
    const baseFac = base?.total_facilities_exposed ?? 0;
    const mitFac = mit?.total_facilities_exposed ?? 0;
    const facilitiesSaved = Math.max(0, baseFac - mitFac);
    const equityFlagged =
      hasFloodRisk &&
      (Boolean(optResult?.optimizedResult.risk_transfer?.flagged) ||
        optResult?.equityStatus === 'RISK_TRANSFER_CONCERN');
    return {
      hasFloodRisk,
      baseArea,
      mitArea,
      areaReductionPct,
      baseBldg,
      mitBldg,
      buildingsSaved,
      basePop,
      mitPop,
      populationProtected,
      baseRoads,
      mitRoads,
      roadsSaved,
      baseFac,
      mitFac,
      facilitiesSaved,
      spentM: Number(((optResult?.totalCostPkr ?? 0) / 1_000_000).toFixed(2)),
      budgetM: Number((optConfig.budgetPkr / 1_000_000).toFixed(0)),
      sites: hasFloodRisk ? (optResult?.selectedPortfolio.length ?? 0) : 0,
      equityFlagged,
    };
  }, [optResult, optConfig.budgetPkr, operationalMode]);

  const handleStationJump = (stationId: string, lat: number, lon: number) => {
    setSelectedStationId(stationId);
    setFocusTarget({ lat, lon, zoom: 14 });
  };

  return (
    <div className="space-y-3">
      {/* Money Slide — Operational Mode Switch, Budget ROI Slider & Equity Verification */}
      <MunicipalPanel
        title="Mitigation ROI & Operational Mode Control"
        icon={<Coins className="w-4 h-4" />}
        rightSlot={
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'px-2 py-0.5 rounded-sm text-[10px] font-semibold border',
                apiHealthy && engineMode === 'api'
                  ? 'bg-[#55A85F] border-[#55A85F] text-white'
                  : 'bg-white/15 border-white/25 text-white'
              )}
            >
              {apiHealthy && engineMode === 'api'
                ? 'Live Simulation Engine Active'
                : 'Local Simulation Engine Active'}
            </span>
            <span className="px-2 py-0.5 rounded-sm bg-white/15 border border-white/25 text-white text-[10px] font-mono">
              {activeThresholdMm} mm {operationalMode === 'demo_2001' ? 'Severe Cutoff' : 'Flood Cutoff'}
            </span>
          </div>
        }
        bodyClassName="p-3.5 space-y-3"
      >
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Two-Mode Switch */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOperationalMode('live_ops')}
              className={cn(
                'px-3 py-1.5 rounded-sm border text-xs font-semibold transition-colors cursor-pointer',
                operationalMode === 'live_ops'
                  ? 'bg-[#173C79] border-[#173C79] text-white shadow-xs'
                  : 'bg-[#F5F6F7] border-[#D6DCE4] text-[#26364A] hover:border-[#173C79]'
              )}
            >
              Live Operations (Current Forecast)
            </button>
            <button
              type="button"
              onClick={() => setOperationalMode('demo_2001')}
              className={cn(
                'px-3 py-1.5 rounded-sm border text-xs font-semibold transition-colors cursor-pointer',
                operationalMode === 'demo_2001'
                  ? 'bg-[#D94343] border-[#D94343] text-white shadow-xs'
                  : 'bg-[#F5F6F7] border-[#D6DCE4] text-[#26364A] hover:border-[#D94343]'
              )}
            >
              2001 Cloudburst Demo (620 mm / 10h)
            </button>
            {operationalMode === 'demo_2001' ? (
              <span className="text-[11px] text-[#A12323] px-2 py-1 rounded-sm bg-[#FBEBEB] border border-[#D94343]/40">
                Soil state: <strong>{soilMoisture.wetnessLabel}</strong> · 24h Window:{' '}
                <strong className="font-mono">{weather.forecast24hMm.toFixed(0)} mm</strong> ·{' '}
                <strong className="font-mono">{weather.fetchedAtPkt}</strong>
              </span>
            ) : (
              backendForecast && (
                <span className="text-[11px] text-[#5A6A7E] px-2 py-1 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  Soil state: <strong className="capitalize text-[#26364A]">{backendForecast.antecedent_wetness}</strong> · 6h Peak: <strong className="font-mono text-[#173C79]">{backendForecast.peak_6h_total_mm} mm</strong>
                </span>
              )
            )}
          </div>

          {/* Dynamic Comparison Label */}
          <div className="px-3 py-1.5 rounded-sm bg-[#EEF3FA] border border-[#173C79]/25 text-xs font-medium text-[#173C79]">
            {PILOT_CONFIG.comparison_label}
          </div>
        </div>

        {/* 2001 Mode Interactive Date & Time Weather Replay Sliders */}
        {operationalMode === 'demo_2001' && (
          <div className="p-3 rounded-sm bg-[#FBEBEB]/55 border border-[#D94343]/35 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#A12323]">
                <CalendarDays className="w-4 h-4 text-[#D94343]" />
                <span>2001 Monsoon Weather Replay (Treated as Live Weather):</span>
                <span className="font-mono px-2 py-0.5 rounded-sm bg-white border border-[#D94343]/40 text-[#173C79]">
                  {weather.fetchedAtPkt}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: '16 Jul (Dry)', day: 0, hour: 9 },
                  { label: '22 Jul (Pre-Storm)', day: 6, hour: 18 },
                  { label: '23 Jul (620mm Peak)', day: 7, hour: 9 },
                  { label: '27 Jul (Clear)', day: 11, hour: 15 },
                ].map((preset) => {
                  const active =
                    demo2001DayOffset === preset.day && demo2001Hour === preset.hour;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setDemo2001DayOffset(preset.day);
                        setDemo2001Hour(preset.hour);
                      }}
                      className={cn(
                        'px-2 py-0.5 rounded-xs text-[10px] font-semibold border transition-colors cursor-pointer',
                        active
                          ? 'bg-[#D94343] border-[#D94343] text-white'
                          : 'bg-white border-[#D6DCE4] text-[#26364A] hover:border-[#D94343]'
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <label htmlFor="demo-2001-date" className="font-semibold text-[#26364A]">
                    Date Slider (16 Jul → 27 Jul 2001)
                  </label>
                  <span className="font-mono font-bold text-[#173C79]">
                    {16 + demo2001DayOffset} Jul 2001
                  </span>
                </div>
                <input
                  id="demo-2001-date"
                  aria-label="2001 Date Slider"
                  type="range"
                  min={0}
                  max={11}
                  step={1}
                  value={demo2001DayOffset}
                  onChange={(e) => setDemo2001DayOffset(Number(e.target.value))}
                  className="w-full accent-[#D94343]"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <label htmlFor="demo-2001-time" className="font-semibold text-[#26364A]">
                    Time Slider (00:00 → 23:00 PKT)
                  </label>
                  <span className="font-mono font-bold text-[#173C79]">
                    {String(demo2001Hour).padStart(2, '0')}:00 PKT ·{' '}
                    {(weather.currentWeather.precipitationMm ?? 0).toFixed(1)} mm/h
                  </span>
                </div>
                <input
                  id="demo-2001-time"
                  aria-label="2001 Time Slider"
                  type="range"
                  min={0}
                  max={23}
                  step={1}
                  value={demo2001Hour}
                  onChange={(e) => setDemo2001Hour(Number(e.target.value))}
                  className="w-full accent-[#D94343]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Budget Slider + Dynamic ROI & Population Impact Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center pt-1">
          <div className="lg:col-span-4 p-3 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="money-slide-budget" className="font-semibold text-[#173C79]">
                Budget Slider (PKR 50M → 300M)
              </label>
              <span className="font-mono font-bold text-[#173C79]">
                PKR {moneySlide.spentM}M / {moneySlide.budgetM}M
              </span>
            </div>
            <input
              id="money-slide-budget"
              aria-label="Dashboard Budget Slider"
              type="range"
              min={50_000_000}
              max={300_000_000}
              step={5_000_000}
              value={Math.min(300_000_000, Math.max(50_000_000, optConfig.budgetPkr))}
              onChange={(e) => setPitchBudgetPkr(Number(e.target.value))}
              className="w-full accent-[#173C79]"
            />
            <div className="flex items-center justify-between gap-1.5">
              {[50_000_000, 150_000_000, 200_000_000, 300_000_000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPitchBudgetPkr(preset)}
                  className={cn(
                    'flex-1 py-1 rounded-xs text-[10px] font-mono font-semibold border transition-colors cursor-pointer',
                    optConfig.budgetPkr === preset
                      ? 'bg-[#173C79] border-[#173C79] text-white'
                      : 'bg-white border-[#D6DCE4] text-[#5A6A7E] hover:border-[#173C79]'
                  )}
                >
                  {preset / 1_000_000}M
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-sm bg-[#EDF7EE] border border-[#55A85F]/50">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#2F6F37]">
                <span>Area Reduction %</span>
                <TrendingDown className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-bold font-mono text-[#2F6F37] mt-0.5 flex items-center gap-2">
                <span>-{moneySlide.areaReductionPct}%</span>
                {(isOptimizing || isAutoSyncingOpt) && (
                  <Loader2 className="w-4 h-4 animate-spin text-[#55A85F]" />
                )}
              </div>
              <div className="text-[11px] font-mono text-[#26364A] mt-0.5">
                {moneySlide.baseArea.toFixed(2)} → {moneySlide.mitArea.toFixed(2)} km²
              </div>
            </div>

            <div className="p-3 rounded-sm bg-[#EEF3FA] border border-[#173C79]/35">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#173C79]">
                <span>Population Protected</span>
                <Users className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-bold font-mono text-[#173C79] mt-0.5">
                {formatNumber(moneySlide.populationProtected)}
              </div>
              <div className="text-[11px] font-mono text-[#5A6A7E] mt-0.5 truncate">
                Exposed: {formatNumber(moneySlide.basePop)} → {formatNumber(moneySlide.mitPop)}
              </div>
            </div>

            <div className="p-3 rounded-sm bg-[#EEF3FA] border border-[#173C79]/35">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#173C79]">
                <span>Buildings Saved</span>
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-bold font-mono text-[#173C79] mt-0.5">
                {moneySlide.buildingsSaved}
              </div>
              <div className="text-[11px] font-mono text-[#5A6A7E] mt-0.5">
                Exposed: {moneySlide.baseBldg} → {moneySlide.mitBldg}
              </div>
            </div>

            <div className="p-3 rounded-sm bg-white border border-[#D6DCE4]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A7E]">
                Interventions &amp; Frontier
              </div>
              <div className="text-2xl font-bold font-mono text-[#26364A] mt-0.5">
                {moneySlide.sites} Sites
              </div>
              <div className="text-[11px] font-mono text-[#5A6A7E] mt-0.5">
                {!moneySlide.hasFloodRisk
                  ? 'No flood risk — no solution needed'
                  : moneySlide.sites >= 40
                    ? 'Pareto optimum (~230M)'
                    : `Budget cap: ${moneySlide.budgetM}M PKR`}
              </div>
            </div>
          </div>
        </div>

        {/* Roads, Facilities & Report Actions Strip */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 px-3 py-2 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] text-[11px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#26364A]">
            <span>
              <strong>Road Corridors Protected:</strong>{' '}
              <span className="font-mono font-semibold text-[#173C79]">
                {moneySlide.roadsSaved}
              </span>{' '}
              <span className="font-mono text-[#5A6A7E]">
                ({moneySlide.baseRoads} → {moneySlide.mitRoads})
              </span>
            </span>
            <span>
              <strong>Critical Facilities Protected:</strong>{' '}
              <span className="font-mono font-semibold text-[#173C79]">
                {moneySlide.facilitiesSaved}
              </span>{' '}
              <span className="font-mono text-[#5A6A7E]">
                ({moneySlide.baseFac} → {moneySlide.mitFac})
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[#173C79] hover:bg-[#244D8F] text-white font-semibold text-[11px] cursor-pointer transition-colors"
            >
              <FileBarChart2 className="w-3.5 h-3.5" />
              Open Full Report
            </button>
            {optResult && (
              <button
                type="button"
                onClick={() => {
                  downloadMitigationReportCsv({
                    modeLabel:
                      operationalMode === 'demo_2001'
                        ? '2001 Cloudburst Weather Replay'
                        : 'Live Operations Forecast',
                    timestampPkt: weather.fetchedAtPkt,
                    thresholdMm: activeThresholdMm,
                    soilMoistureLabel: soilMoisture.combinedLabel,
                    optResult,
                    weather,
                  });
                  pushToast(
                    'Report Downloaded',
                    'Saved municipal budget, population impact & equity CSV report.',
                    'success'
                  );
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-white hover:bg-[#EEF3FA] border border-[#173C79]/40 text-[#173C79] font-semibold text-[11px] cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download Report (CSV)
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-white hover:bg-[#EEF3FA] border border-[#CBD5E1] text-[#26364A] font-semibold text-[11px] cursor-pointer transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Brief
            </button>
          </div>
        </div>

        {/* Equity Banner */}
        <div
          role="status"
          className={cn(
            'px-3.5 py-2 rounded-sm border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold',
            moneySlide.equityFlagged
              ? 'bg-[#FBEBEB] border-[#D94343] text-[#A12323]'
              : 'bg-[#EDF7EE] border-[#55A85F] text-[#2F6F37]'
          )}
        >
          <span>
            {!moneySlide.hasFloodRisk
              ? '✅ No Flood Risk Modeled: Mitigation solutions are not required under current conditions.'
              : moneySlide.equityFlagged
                ? '⚠️ Risk Transfer Warning: Downstream Rawalpindi building exposure rose >2%.'
                : PILOT_CONFIG.equity_pass_banner}
          </span>
          <span className="font-mono text-[11px]">
            {operationalMode === 'demo_2001'
              ? `2001 Weather Replay (${weather.fetchedAtPkt})`
              : 'Live Weather Operations'}
          </span>
        </div>
      </MunicipalPanel>

      {/* 30-Day Advance Flood Watch & Notification Bar */}
      <MunicipalPanel
        title="30-Day Advance Flood Watch & Future Outlook"
        icon={<CalendarDays className="w-4 h-4" />}
        rightSlot={
          <div className="flex flex-wrap items-center gap-1.5">
            {(operationalMode === 'demo_2001' || monsoonStressMode) && (
              <button
                type="button"
                onClick={toggleMonsoonStressMode}
                className={cn(
                  'px-2.5 py-0.5 rounded-sm text-[10px] font-semibold border transition-colors cursor-pointer',
                  monsoonStressMode
                    ? 'bg-[#EF8735] border-[#EF8735] text-white'
                    : 'bg-white/10 border-white/25 text-white hover:bg-white/20'
                )}
              >
                {monsoonStressMode ? 'Exit Monsoon Test' : 'Simulate 30-Day Monsoon Surge'}
              </button>
            )}
            <button
              type="button"
              onClick={enableBrowserNotifications}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-[10px] font-semibold border transition-colors cursor-pointer',
                browserAlertsEnabled
                  ? 'bg-[#55A85F] border-[#55A85F] text-white'
                  : 'bg-white text-[#173C79] border-white hover:bg-[#F5F6F7]'
              )}
            >
              <BellRing className="w-3 h-3" />
              <span>{browserAlertsEnabled ? 'Alerts Enabled' : 'Enable 30-Day Alerts'}</span>
            </button>
          </div>
        }
        bodyClassName="p-3 space-y-2.5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          {weather.earliestFloodAlert ? (
            <div className="flex items-start sm:items-center gap-2 text-xs text-[#A12323] bg-[#FBEBEB]/70 border border-[#D94343]/40 rounded-sm px-3 py-1.5">
              <AlertTriangle className="w-4 h-4 text-[#D94343] flex-shrink-0" />
              <span>
                <strong>Advance Flood Watch:</strong> {weather.earliestFloodAlert.summary}{' '}
                <span className="text-[#5A6A7E]">Click any day bar below to inspect affected vs. safe areas.</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-[#2F6F37] bg-[#EDF7EE] border border-[#55A85F]/40 rounded-sm px-3 py-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#55A85F] flex-shrink-0" />
              <span>
                <strong>30-Day Status Clear:</strong> No heavy flood-producing rainfall (&gt;35 mm/day) detected across the 16-day forecast or 30-day ensemble outlook ({weather.forecast30dMm} mm total).
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] font-mono text-[#5A6A7E] flex-shrink-0">
            {selectedOutlookDay !== null ? (
              <button
                type="button"
                onClick={() => setSelectedOutlookDay(null)}
                className="px-2 py-1 rounded-sm bg-[#173C79] text-white font-sans text-[11px] font-semibold cursor-pointer"
              >
                Viewing Day +{selectedOutlookDay} · Reset to Today
              </button>
            ) : (
              <span>
                16d: <strong className="text-[#173C79]">{weather.forecast16dMm} mm</strong> · 30d:{' '}
                <strong className="text-[#173C79]">{weather.forecast30dMm} mm</strong>
              </span>
            )}
          </div>
        </div>

        {/* Clickable 30-Day Daily Precipitation & Flood Risk Strip */}
        <div className="grid grid-cols-10 sm:grid-cols-[repeat(15,minmax(0,1fr))] xl:grid-cols-[repeat(30,minmax(0,1fr))] gap-1 pt-0.5">
          {weather.outlook30d.map((day) => {
            const active = selectedOutlookDay === day.dayOffset;
            const meta = STATION_RISK_META[day.riskLevel];
            const barPct = Math.min(100, Math.max(8, Math.round((day.rainfallMm / 120) * 100)));
            return (
              <button
                key={day.dayOffset}
                type="button"
                onClick={() =>
                  setSelectedOutlookDay(active ? null : day.dayOffset)
                }
                title={`Day +${day.dayOffset} (${day.dateLabel}): ${day.rainfallMm} mm (p90: ${day.p90RainfallMm} mm, ${day.probabilityPct}% prob) · ${day.tier.replace(/_/g, ' ')}`}
                className={cn(
                  'group flex flex-col items-center justify-end h-11 rounded-xs border p-0.5 transition-all cursor-pointer',
                  active
                    ? 'ring-2 ring-[#173C79] bg-[#E8EEF7] border-[#173C79]'
                    : 'bg-[#F8F9FA] border-[#E2E6EC] hover:border-[#173C79]'
                )}
              >
                <div className="w-full flex-1 flex items-end justify-center">
                  <div
                    className="w-full rounded-t-[1px]"
                    style={{
                      height: `${barPct}%`,
                      backgroundColor: day.rainfallMm < 2 ? '#CBD5E1' : meta.hex,
                    }}
                  />
                </div>
                <span className="text-[8px] font-mono text-[#5A6A7E] leading-none mt-0.5">
                  {day.dayOffset}
                </span>
              </button>
            );
          })}
        </div>
      </MunicipalPanel>

      {/* Three-Column Municipal Monitoring Grid:
          Desktop (xl): 3-col (Left 3 / Center 6 / Right 3)
          Tablet (md): 2-col (Center Map 7 / Right Risk 5, Left Weather full below)
          Mobile: 1-col vertical stack */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
        {/* LEFT COLUMN — Weather & Environmental Monitoring */}
        <div className="md:col-span-12 lg:col-span-3 space-y-3.5 order-3 lg:order-1">
          {/* Weather Forecast Panel */}
          <MunicipalPanel
            title="Weather Forecast"
            icon={<CloudSun className="w-4 h-4" />}
            rightSlot={
              <div className="flex items-center rounded-sm bg-[#244D8F] p-0.5 text-[10px] font-semibold">
                {([3, 5] as const).map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setForecastDaysOption(days)}
                    className={cn(
                      'px-2 py-0.5 rounded-sm transition-colors cursor-pointer',
                      forecastDaysOption === days
                        ? 'bg-white text-[#173C79]'
                        : 'text-white/85 hover:text-white'
                    )}
                  >
                    {days}-Day
                  </button>
                ))}
              </div>
            }
          >
            <div className="space-y-3">
              {/* Weather condition indicator strip */}
              <div
                className={cn(
                  'grid gap-1.5',
                  forecastDaysOption === 5
                    ? 'grid-cols-2 sm:grid-cols-5 xl:grid-cols-2'
                    : 'grid-cols-3 sm:grid-cols-3 xl:grid-cols-3'
                )}
              >
                {dailySummaryCards.map((d) => (
                  <div
                    key={d.dateLabel}
                    className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC] text-center space-y-1"
                  >
                    <div className="text-[10px] font-semibold text-[#173C79] truncate">
                      {d.dateLabel}
                    </div>
                    <div className="flex justify-center">
                      <WeatherConditionIcon code={d.weatherCode} />
                    </div>
                    <div className="text-[11px] font-mono font-bold text-[#26364A]">
                      {d.maxTempC !== null ? `${d.maxTempC.toFixed(0)}°` : '—'}
                      <span className="text-[#5A6A7E] font-normal">
                        /{d.minTempC !== null ? `${d.minTempC.toFixed(0)}°` : '—'}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#244D8F]">
                      {d.rainfallMm} mm
                    </div>
                  </div>
                ))}
              </div>

              {/* Temperature Forecast Chart */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#26364A] mb-1">
                  <span className="flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5 text-[#EF8735]" />
                    Temperature Forecast (°C)
                  </span>
                  <span className="font-mono text-[10px] text-[#5A6A7E]">
                    {forecastDaysOption}d horizon
                  </span>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecastChartSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: '#5A6A7E', fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={26} />
                      <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                      <Area
                        type="monotone"
                        dataKey="temp"
                        name="Temp (°C)"
                        stroke="#EF8735"
                        fill="#EF8735"
                        fillOpacity={0.18}
                        strokeWidth={1.8}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Rainfall Forecast Chart */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#26364A] mb-1">
                  <span className="flex items-center gap-1">
                    <CloudRain className="w-3.5 h-3.5 text-[#244D8F]" />
                    Rainfall Forecast (mm/h)
                  </span>
                  <span className="font-mono text-[10px] text-[#244D8F]">
                    {forecastDaysOption === 3
                      ? `${weather.forecast72hMm.toFixed(1)} mm`
                      : `${weather.forecast120hMm.toFixed(1)} mm`}
                  </span>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={forecastChartSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: '#5A6A7E', fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={26} />
                      <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                      <Bar dataKey="rain" name="Rainfall (mm)" fill="#244D8F" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Wind-Speed Chart */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#26364A] mb-1">
                  <span className="flex items-center gap-1">
                    <Wind className="w-3.5 h-3.5 text-[#55A85F]" />
                    Wind Speed Forecast (km/h)
                  </span>
                </div>
                <div className="h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecastChartSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: '#5A6A7E', fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={26} />
                      <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                      <Line
                        type="monotone"
                        dataKey="wind"
                        name="Wind (km/h)"
                        stroke="#55A85F"
                        strokeWidth={1.8}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </MunicipalPanel>

          {/* Environmental Conditions Panel */}
          <MunicipalPanel
            title="Environmental Conditions"
            icon={<Thermometer className="w-4 h-4" />}
            rightSlot={
              <span className="text-[10px] font-mono text-white/85">
                {weather.currentWeather.conditionLabel}
              </span>
            }
          >
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[10px] text-[#5A6A7E]">Current Rainfall</div>
                  <div className="text-sm font-bold font-mono text-[#173C79]">
                    {weather.currentWeather.precipitationMm !== null
                      ? `${weather.currentWeather.precipitationMm.toFixed(1)} mm/h`
                      : 'Data unavailable'}
                  </div>
                </div>
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[10px] text-[#5A6A7E]">Air Temperature</div>
                  <div className="text-sm font-bold font-mono text-[#26364A]">
                    {weather.currentWeather.temperatureC !== null
                      ? `${weather.currentWeather.temperatureC.toFixed(1)} °C`
                      : 'Data unavailable'}
                  </div>
                </div>
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[10px] text-[#5A6A7E]">Relative Humidity</div>
                  <div className="text-sm font-bold font-mono text-[#26364A]">
                    {weather.currentWeather.humidityPct !== null
                      ? `${weather.currentWeather.humidityPct}%`
                      : 'Data unavailable'}
                  </div>
                </div>
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[10px] text-[#5A6A7E]">Wind Speed</div>
                  <div className="text-sm font-bold font-mono text-[#26364A]">
                    {weather.currentWeather.windSpeedKmh !== null
                      ? `${weather.currentWeather.windSpeedKmh.toFixed(1)} km/h`
                      : 'Data unavailable'}
                  </div>
                </div>
              </div>

              {/* Historical 7-day Rainfall */}
              <div className="pt-2 border-t border-[#E6EAEF]">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-[#26364A]">
                    Historical Rainfall (7-Day)
                  </span>
                  <span className="font-mono text-[10px] text-[#173C79]">
                    Total: {weather.past7DayTotalMm} mm · API₇ {weather.api7DayMm} mm
                  </span>
                </div>
                <div className="h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weather.past7DaysDaily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: '#5A6A7E', fontSize: 9 }} />
                      <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={24} />
                      <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                      <Bar dataKey="rainfallMm" name="Past Rain (mm)" fill="#55A85F" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </MunicipalPanel>

          {/* Water Monitoring Panel */}
          <MunicipalPanel
            title="Water Monitoring"
            icon={<Waves className="w-4 h-4" />}
            rightSlot={
              <span className="text-[10px] font-mono text-white/85">
                {monitoringStations.length} Stations
              </span>
            }
          >
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
                    <Droplets className="w-3 h-3 text-[#244D8F]" />
                    Soil Moisture (0–9 cm)
                  </div>
                  <div className="text-xs font-mono font-semibold text-[#173C79] mt-0.5">
                    {soilMoisture.combinedLabel}
                  </div>
                </div>
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
                    <Waves className="w-3 h-3 text-[#173C79]" />
                    Estimated Drainage Level
                  </div>
                  <div className="text-xs font-mono font-bold text-[#173C79] mt-0.5">
                    Peak {peakWaterLevelM.toFixed(2)} m · Avg {avgWaterLevelM.toFixed(2)} m
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-[#26364A]">
                    Station Corridor Profile (N → S)
                  </span>
                  <span className="text-[10px] font-mono text-[#5A6A7E]">m (proxy)</span>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stationWaterTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                      <XAxis dataKey="code" tick={{ fill: '#5A6A7E', fontSize: 9 }} />
                      <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={26} />
                      <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                      <Bar dataKey="levelM" name="Runoff Level Proxy (m)" radius={[2, 2, 0, 0]}>
                        {stationWaterTrend.map((entry) => (
                          <Cell
                            key={entry.code}
                            fill={STATION_RISK_META[entry.risk].hex}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </MunicipalPanel>
        </div>

        {/* CENTER COLUMN — Main Interactive Geographical Map */}
        <div className="md:col-span-7 lg:col-span-6 space-y-2.5 order-1 lg:order-2">
          <MunicipalPanel
            title="Nullah Lai Basin — Environmental & Flood Risk Map"
            icon={<MapPin className="w-4 h-4" />}
            bodyClassName="p-2.5 space-y-2.5"
            rightSlot={<ScenarioTagBadge tag={operationalScenario.tag} />}
          >
            {/* Compact Map Toolbar: Study Area + Forecast Horizon */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E6EAEF]">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Study area selector"
                  value={studyAreaId}
                  onChange={(e) => {
                    setSelectedStationId(null);
                    setStudyAreaId(e.target.value as StudyAreaId);
                  }}
                  className="px-2.5 py-1 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] text-xs font-semibold text-[#173C79] focus:outline-none focus:border-[#173C79]"
                >
                  {Object.values(PILOT_CONFIG.studyAreas).map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>

                <div className="flex items-center rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] p-0.5">
                  {([24, 48, 72] as ForecastHorizon[]).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setForecastHorizon(h)}
                      className={cn(
                        'px-2 py-0.5 rounded-sm text-[11px] font-mono font-semibold transition-colors cursor-pointer',
                        forecastHorizon === h
                          ? 'bg-[#173C79] text-white'
                          : 'text-[#5A6A7E] hover:text-[#173C79]'
                      )}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-[11px] text-[#5A6A7E] font-medium">
                Click any circular station marker for live telemetry popup
              </span>
            </div>

            {/* Central Interactive Green Municipal Map */}
            <GeospatialMap
              twin={twin}
              simResult={operationalResult}
              scenario={operationalScenario}
              stations={monitoringStations}
              selectedStationId={selectedStationId}
              onSelectStation={setSelectedStationId}
              interventions={optResult?.selectedPortfolio ?? []}
              layers={layers}
              onToggleLayer={toggleLayer}
              focusTarget={focusTarget}
              heightClass="h-[460px] sm:h-[540px] xl:h-[670px]"
            />

            {/* Quick Station Selector Strip below Map */}
            <div className="pt-1">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E] mb-1.5">
                <span>Monitoring Stations ({monitoringStations.length})</span>
                <span className="font-mono">
                  {operationalMode === 'demo_2001'
                    ? '23 Jul 2001 Archive'
                    : isLiveWeather
                      ? 'Open-Meteo Synced'
                      : 'Offline Fallback'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {monitoringStations.map((st) => {
                  const meta = STATION_RISK_META[st.riskLevel];
                  const active = st.id === selectedStationId;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleStationJump(st.id, st.lat, st.lon)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border text-[11px] transition-colors cursor-pointer',
                        active
                          ? 'bg-[#173C79] text-white border-[#173C79] font-semibold'
                          : 'bg-[#F5F6F7] text-[#26364A] border-[#D6DCE4] hover:border-[#173C79]'
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: meta.hex }}
                      />
                      <span>{st.stationCode}</span>
                      <span className="hidden sm:inline truncate max-w-[115px]">
                        {st.name.split(' ')[0]} {st.name.split(' ')[1] ?? ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </MunicipalPanel>

          {/* Most Affected Areas vs. Safe High-Ground Zones */}
          <MunicipalPanel
            title="Most Affected Areas vs. Safe Zones"
            icon={<ShieldCheck className="w-4 h-4" />}
            rightSlot={
              <button
                type="button"
                onClick={() => toggleLayer('safe_zones')}
                className={cn(
                  'px-2 py-0.5 rounded-sm text-[10px] font-semibold border transition-colors cursor-pointer',
                  layers.safe_zones
                    ? 'bg-[#55A85F] border-[#55A85F] text-white'
                    : 'bg-white/10 border-white/25 text-white hover:bg-white/20'
                )}
              >
                {layers.safe_zones ? 'Safe Zones: ON' : 'Show Safe Zones on Map'}
              </button>
            }
            bodyClassName="p-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Most Affected */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#A12323]">
                  <span>Most Affected Corridors</span>
                  <span className="font-mono">{areaSafetySummary.exposedAreaKm2} km² flooded</span>
                </div>
                {areaSafetySummary.mostAffectedZones.slice(0, 2).map((z) => (
                  <div
                    key={z.zoneId}
                    className="p-2 rounded-sm bg-[#FBEBEB]/55 border border-[#D94343]/35 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#26364A] truncate">{z.zoneName}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-[#D94343] text-white">
                        Peak {z.peakAccumulationMm} mm
                      </span>
                    </div>
                    <div className="text-[11px] text-[#5A6A7E] font-mono">
                      {z.exposedBuildings.toLocaleString()} buildings · {z.exposedPopulation.toLocaleString()} residents · {z.exposedAreaKm2} km²
                    </div>
                  </div>
                ))}
                {areaSafetySummary.affectedStations.length > 0 && (
                  <div className="text-[11px] text-[#A12323] font-medium">
                    Exposed Stations: {areaSafetySummary.affectedStations.slice(0, 3).map((s) => s.stationCode).join(', ')}
                  </div>
                )}
              </div>

              {/* Safe High-Ground Zones */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#2F6F37]">
                  <span>Safe &amp; Low-Risk Zones (&lt;25 mm)</span>
                  <span className="font-mono">{areaSafetySummary.safeAreaKm2} km² safe</span>
                </div>
                {areaSafetySummary.safeZones.slice(0, 2).map((z) => (
                  <div
                    key={z.zoneId}
                    className="p-2 rounded-sm bg-[#EDF7EE]/75 border border-[#55A85F]/40 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#26364A] truncate">{z.zoneName}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-[#55A85F] text-white">
                        {z.safeAreaKm2} km² safe
                      </span>
                    </div>
                    <div className="text-[11px] text-[#5A6A7E] font-mono">
                      Mean elev {z.meanElevationM} m · {z.status === 'SAFE' ? 'Low flood risk' : 'Higher-ground pockets available'}
                    </div>
                  </div>
                ))}
                <div className="text-[11px] text-[#2F6F37] font-medium">
                  Safe Staging Sites:{' '}
                  {areaSafetySummary.safeStations.length > 0
                    ? areaSafetySummary.safeStations
                        .slice(0, 3)
                        .map((s) => `${s.stationCode} (${s.elevationM}m)`)
                        .join(', ')
                    : 'Use upper Islamabad sectors (>520 m)'}
                </div>
              </div>
            </div>
          </MunicipalPanel>
        </div>

        {/* RIGHT COLUMN — Flood Risk & Alert Monitoring */}
        <div className="md:col-span-5 lg:col-span-3 space-y-3.5 order-2 lg:order-3">
          {/* Current Flood Risk Panel */}
          <MunicipalPanel
            title="Current Flood Risk"
            icon={<Gauge className="w-4 h-4" />}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 p-2.5 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                    Flood Risk Index
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-3xl font-bold font-mono text-[#173C79]">
                      {riskSummary.index}
                    </span>
                    <span className="text-xs font-mono text-[#5A6A7E]">/ 100</span>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <StationRiskBadge level={riskSummary.classification} size="md" />
                  <div className="text-[10px] text-[#5A6A7E]">
                    Tier: {operationalResult.alert_tier}
                  </div>
                </div>
              </div>

              {/* 5-Tier Operational Alert Framework */}
              <div>
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E] mb-1.5">
                  <span>5-Tier Alert Framework</span>
                  <span className="font-mono text-[9px]">
                    {officialAgencyOverride ? 'PMD/NDMA Override ON' : 'Agency Gate Active'}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {(['Normal', 'Advisory', 'Watch', 'Warning', 'Emergency'] as AlertTier[]).map(
                    (tier) => {
                      const meta = ALERT_TIER_META[tier];
                      const active = operationalResult.alert_tier === tier;
                      const lockedEmergency = tier === 'Emergency' && !officialAgencyOverride;
                      return (
                        <div
                          key={tier}
                          title={
                            lockedEmergency
                              ? 'Emergency tier requires official PMD/NDMA authorization in Settings'
                              : meta.summary
                          }
                          className={cn(
                            'px-1 py-1 rounded-sm border text-center text-[9.5px] font-semibold transition-all truncate',
                            active ? 'ring-2 ring-[#173C79] shadow-xs' : lockedEmergency ? 'opacity-50' : 'opacity-80'
                          )}
                          style={{
                            backgroundColor: meta.bg,
                            borderColor: meta.border,
                            color: meta.color,
                          }}
                        >
                          {tier}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Actionable Mode A Preparedness Plan */}
              <div className="p-2.5 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#173C79]">
                    Preparedness Action Plan
                  </span>
                  <span
                    className={cn(
                      'text-[9px] font-mono px-1.5 py-0.5 rounded-sm font-semibold',
                      operationalResult.alert_tier === 'Normal'
                        ? 'bg-[#EDF7EE] text-[#2F6F37]'
                        : 'bg-[#FDF1E7] text-[#A64D0B]'
                    )}
                  >
                    {operationalResult.alert_tier === 'Normal' ? 'Standby' : 'Action Required'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {preparednessActions.slice(0, 3).map((act, idx) => (
                    <div
                      key={`${act.agency}-${idx}`}
                      className="text-[11px] leading-snug bg-white p-1.5 rounded-xs border border-[#E2E6EC]"
                    >
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-semibold text-[#173C79] text-[10px]">
                          {act.agency}
                        </span>
                        <span
                          className={cn(
                            'text-[9px] font-mono font-bold px-1 rounded-xs',
                            act.priority === 'HIGH'
                              ? 'bg-[#FBEBEB] text-[#D94343]'
                              : act.priority === 'MEDIUM'
                                ? 'bg-[#FDF1E7] text-[#EF8735]'
                                : 'bg-[#EDF7EE] text-[#2F6F37]'
                          )}
                        >
                          {act.priority}
                        </span>
                      </div>
                      <p className="text-[#26364A]">{act.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-[#E6EAEF] text-xs pt-1">
                <div className="py-1.5 flex items-center justify-between">
                  <span className="text-[#5A6A7E]">Affected Monitoring Zones</span>
                  <span className="font-mono font-bold text-[#26364A]">
                    {riskSummary.affectedZonesEstimate} / {twin.zone_meta.length}
                  </span>
                </div>
                <div className="py-1.5 flex items-center justify-between">
                  <span className="text-[#5A6A7E]">Active Flood Warnings</span>
                  <span className="font-mono font-bold text-[#D94343]">
                    {activeWarningCount}
                  </span>
                </div>
                <div className="py-1.5 flex items-center justify-between">
                  <span className="text-[#5A6A7E]">Last Data Update</span>
                  <span className="font-mono text-[11px] text-[#26364A]">
                    {weather.fetchedAtPkt}
                  </span>
                </div>
              </div>
            </div>
          </MunicipalPanel>

          {/* Monitoring Statistics Compact Cards */}
          <MunicipalPanel
            title="Monitoring Statistics"
            icon={<Activity className="w-4 h-4" />}
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">Current Rainfall</div>
                <div className="text-sm font-bold font-mono text-[#173C79] mt-0.5">
                  {weather.currentWeather.precipitationMm !== null
                    ? `${weather.currentWeather.precipitationMm.toFixed(1)} mm/h`
                    : 'Data unavailable'}
                </div>
              </div>
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">Peak Water Depth</div>
                <div className="text-sm font-bold font-mono text-[#26364A] mt-0.5">
                  {peakWaterLevelM.toFixed(2)} m
                </div>
              </div>
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">Envelope Area Delta</div>
                <div className="text-sm font-bold font-mono text-[#EF8735] mt-0.5">
                  +{levelDeltaM}%
                </div>
              </div>
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">24h Peak Intensity</div>
                <div className="text-sm font-bold font-mono text-[#244D8F] mt-0.5">
                  {weather.peakHourlyMm.toFixed(1)} mm/h
                </div>
              </div>
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">Rain / Flood Prob.</div>
                <div className="text-sm font-bold font-mono text-[#26364A] mt-0.5">
                  {weather.maxProbabilityPct}%
                </div>
              </div>
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">Active Alerts</div>
                <div className="text-sm font-bold font-mono text-[#D94343] mt-0.5">
                  {activeAlerts.length}
                </div>
              </div>
            </div>
          </MunicipalPanel>

          {/* Active Alerts Panel */}
          <MunicipalPanel
            title="Active Flood & Station Alerts"
            icon={<ShieldAlert className="w-4 h-4" />}
            rightSlot={
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-white/15 text-white">
                {activeAlerts.length} Active
              </span>
            }
          >
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-0.5">
              {activeAlerts.map((al) => {
                const meta = STATION_RISK_META[al.riskLevel];
                return (
                  <button
                    key={al.id}
                    type="button"
                    onClick={() => {
                      if (al.stationId) {
                        handleStationJump(al.stationId, al.lat, al.lon);
                      } else {
                        setFocusTarget({ lat: al.lat, lon: al.lon, zoom: 15 });
                      }
                    }}
                    className="w-full text-left p-2.5 rounded-sm bg-[#FFFFFF] hover:bg-[#F5F6F7] border border-[#D6DCE4] transition-colors space-y-1 cursor-pointer"
                    style={{ borderLeftWidth: '4px', borderLeftColor: meta.hex }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-[#173C79] leading-snug">
                        {al.title}
                      </span>
                      <StationRiskBadge level={al.riskLevel} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-[#5A6A7E]">
                      <span className="font-medium truncate">{al.location}</span>
                      <span className="font-mono flex-shrink-0">{al.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-[#26364A] leading-snug">
                      {al.description}
                    </p>
                  </button>
                );
              })}

              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC] flex items-start gap-1.5 text-[10px] text-[#5A6A7E]">
                <AlertTriangle className="w-3.5 h-3.5 text-[#EF8735] flex-shrink-0 mt-0.5" />
                <span>
                  Click any alert to center the map. Screening-level 30 m D8 outputs are for municipal planning support only.
                </span>
              </div>
            </div>
          </MunicipalPanel>
        </div>
      </div>
    </div>
  );
}
