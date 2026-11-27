import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Coins,
  Droplets,
  Gauge,
  Loader2,
  MapPin,
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
import { BudgetControlCard } from '../components/ui/BudgetControlCard';
import {
  EquityStatusBanner,
  MunicipalPanel,
  ScenarioTagBadge,
  StatCard,
  StationRiskBadge,
} from '../components/ui/Primitives';
import { ReportActionButtons } from '../components/ui/ReportActionButtons';
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

function WeatherConditionIcon({ code }: { code: number | null }) {
  if (code === null) return <Cloud className="w-4 h-4 text-[#5A6A7E]" />;
  if (code === 0) return <Sun className="w-4 h-4 text-[#EF8735]" />;
  if (code <= 2) return <CloudSun className="w-4 h-4 text-[#EF8735]" />;
  if (code >= 95) return <CloudLightning className="w-4 h-4 text-[#D94343]" />;
  if (code >= 51) return <CloudRain className="w-4 h-4 text-[#244D8F]" />;
  return <Cloud className="w-4 h-4 text-[#5A6A7E]" />;
}

export function CommandCenter() {
  const navigate = useNavigate();
  const {
    studyAreaId,
    setStudyAreaId,
    operationalMode,
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
  } = useFloodForge();

  const [weatherExpanded, setWeatherExpanded] = useState(false);
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

  const toggleLayer = (key: keyof MapLayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Detailed Weather Charts series (rendered only when expanded)
  const forecastHours = forecastDaysOption === 3 ? 72 : 120;
  const forecastChartSeries = useMemo(() => {
    const step = forecastDaysOption === 3 ? 3 : 6;
    return weather.hourlyForecast
      .slice(0, forecastHours)
      .filter((_, idx) => idx % step === 0)
      .map((h) => ({
        hour: `+${h.hourOffset}h`,
        temp: h.temperatureC,
        rain: h.precipitationMm,
        wind: h.windSpeedKmh,
      }));
  }, [weather.hourlyForecast, forecastHours, forecastDaysOption]);

  const dailySummaryCards = useMemo(
    () => weather.dailyForecast5d.slice(0, forecastDaysOption),
    [weather.dailyForecast5d, forecastDaysOption]
  );

  const stationWaterTrend = useMemo(() => {
    return [...monitoringStations]
      .sort((a, b) => a.row - b.row)
      .slice(0, 8)
      .map((s) => ({
        code: s.stationCode,
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

  const riskSummary = useMemo(
    () => computeFloodRiskIndex(operationalResult, monitoringStations),
    [operationalResult, monitoringStations]
  );

  const levelDeltaM = useMemo(() => {
    const baseArea = operationalResult.metrics.exposed_area_km2;
    const highArea = highEnvelopeResult.metrics.exposed_area_km2;
    const diffPct = baseArea > 0 ? ((highArea - baseArea) / baseArea) * 100 : 0;
    return Number(diffPct.toFixed(1));
  }, [operationalResult.metrics.exposed_area_km2, highEnvelopeResult.metrics.exposed_area_km2]);

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
      budgetM: Number((optConfig.budgetPkr / 1_000_000).toFixed(0)),
      sites: hasFloodRisk ? (optResult?.selectedPortfolio.length ?? 0) : 0,
      equityFlagged,
    };
  }, [optResult, optConfig.budgetPkr]);

  const outlookRangeLabel = useMemo(() => {
    const pts = weather.outlook30d;
    if (!pts.length) return '';
    const first = pts[0]?.monthYearLabel ?? '';
    const last = pts[pts.length - 1]?.monthYearLabel ?? '';
    return first === last ? first : `${first} → ${last}`;
  }, [weather.outlook30d]);

  const selectedDayPoint = useMemo(
    () =>
      selectedOutlookDay !== null
        ? weather.outlook30d.find((d) => d.dayOffset === selectedOutlookDay) ?? null
        : null,
    [selectedOutlookDay, weather.outlook30d]
  );

  const handleStationJump = (stationId: string, lat: number, lon: number) => {
    setSelectedStationId(stationId);
    setFocusTarget({ lat, lon, zoom: 14 });
  };

  return (
    <div className="space-y-3.5">
      {/* PRIORITY 1 & 2 ABOVE THE FOLD: DOMINANT MAP (8 cols) + RISK & ALERTS (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* PRIORITY 1: INTERACTIVE FLOOD-RISK MAP */}
        <div className="lg:col-span-8 space-y-3">
          <MunicipalPanel
            title="Nullah Lai Basin — Environmental & Flood Risk Map"
            icon={<MapPin className="w-4 h-4" />}
            bodyClassName="p-2.5 space-y-2.5"
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
                <ScenarioTagBadge tag={operationalScenario.tag} />
              </div>
            }
          >
            {/* Compact Map Toolbar */}
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

                <div
                  role="group"
                  aria-label="Forecast horizon"
                  className="flex items-center rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] p-0.5"
                >
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

              <span className="text-[11px] text-[#5A6A7E]">
                Select any station marker for telemetry
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
              heightClass="h-[430px] sm:h-[520px] xl:h-[580px]"
            />

            {/* Quick Station Selector Strip */}
            <div className="pt-0.5">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E] mb-1.5">
                <span>Monitoring Stations ({monitoringStations.length})</span>
                <span className="font-mono">
                  {operationalMode === 'demo_2001' && !monsoonStressMode
                    ? `2001 Archive · ${weather.fetchedAtPkt}`
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
                      <span className="hidden sm:inline truncate max-w-[110px]">
                        {st.name.split(' ')[0]} {st.name.split(' ')[1] ?? ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </MunicipalPanel>

          {/* PRIORITY 2B: MOST AFFECTED VS SAFE ZONES */}
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
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#2F6F37]">
                  <span>Lower-Runoff Terrain (&lt;25 mm proxy)</span>
                  <span className="font-mono">{areaSafetySummary.safeAreaKm2} km² modeled</span>
                </div>
                {areaSafetySummary.safeZones.slice(0, 2).map((z) => (
                  <div
                    key={z.zoneId}
                    className="p-2 rounded-sm bg-[#EDF7EE]/75 border border-[#55A85F]/40 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#26364A] truncate">{z.zoneName}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-[#55A85F] text-white">
                        {z.safeAreaKm2} km² low runoff
                      </span>
                    </div>
                    <div className="text-[11px] text-[#5A6A7E] font-mono">
                      Mean elev {z.meanElevationM} m · {z.status === 'SAFE' ? 'Lower modeled runoff' : 'Higher-ground pockets'}
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-[#5A6A7E] leading-snug">
                  <strong>Screening Disclaimer:</strong> Derived from 30 m D8 runoff &amp; elevation — not independently surveyed or official civil-defense evacuation shelter/route guidance.
                </p>
              </div>
            </div>
          </MunicipalPanel>
        </div>

        {/* PRIORITY 2A: RISK ASSESSMENT, ACTIONABLE INSIGHTS & ALERTS */}
        <div className="lg:col-span-4 space-y-3.5">
          <MunicipalPanel title="Current Flood Risk" icon={<Gauge className="w-4 h-4" />}>
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

              <div>
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E] mb-1.5">
                  <span>5-Tier Alert Framework</span>
                  <span className="font-mono text-[9px]">
                    {officialAgencyOverride ? 'Demo Emergency Toggle ON' : 'Screening Mode'}
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
                              ? 'Demo Emergency tier locked by default (enable local demo toggle in Settings)'
                              : meta.summary
                          }
                          className={cn(
                            'px-1 py-1 rounded-sm border text-center text-[9.5px] font-semibold truncate',
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

              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="p-1.5 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[9px] uppercase text-[#5A6A7E]">Affected Zones</div>
                  <div className="text-xs font-bold font-mono text-[#26364A]">
                    {riskSummary.affectedZonesEstimate} / {twin.zone_meta.length}
                  </div>
                </div>
                <div className="p-1.5 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[9px] uppercase text-[#5A6A7E]">Warnings</div>
                  <div className="text-xs font-bold font-mono text-[#D94343]">
                    {activeWarningCount}
                  </div>
                </div>
                <div className="p-1.5 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[9px] uppercase text-[#5A6A7E]">Env. Delta</div>
                  <div className="text-xs font-bold font-mono text-[#EF8735]">
                    {levelDeltaM > 0 ? `+${levelDeltaM}` : levelDeltaM}%
                  </div>
                </div>
              </div>
            </div>
          </MunicipalPanel>

          <MunicipalPanel
            title="Active Flood & Station Alerts"
            icon={<ShieldAlert className="w-4 h-4" />}
            rightSlot={
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-white/15 text-white">
                {activeAlerts.length} Active
              </span>
            }
          >
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
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
                    className="w-full text-left p-2.5 rounded-sm bg-white hover:bg-[#F5F6F7] border border-[#D6DCE4] transition-colors space-y-1 cursor-pointer"
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
            </div>
          </MunicipalPanel>
        </div>
      </div>

      {/* PRIORITY 3: FLOOD SIMULATION & MITIGATION EFFECTIVENESS (Single mode control stays in Header) */}
      <MunicipalPanel
        title="Mitigation Simulation & Investment Effectiveness"
        icon={<Coins className="w-4 h-4" />}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-white/90">
            <span>{PILOT_CONFIG.comparison_label}</span>
          </div>
        }
        bodyClassName="p-3.5 space-y-3"
      >
        {/* Condition/Mode Summary Bar (no duplicate mode buttons) */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          {operationalMode === 'demo_2001' ? (
            <span className="text-[#A12323] px-2.5 py-1 rounded-sm bg-[#FBEBEB] border border-[#D94343]/40">
              Soil state: <strong>{soilMoisture.wetnessLabel}</strong> · 24h Window:{' '}
              <strong className="font-mono">{weather.forecast24hMm.toFixed(0)} mm</strong> ·{' '}
              <strong className="font-mono">{weather.fetchedAtPkt}</strong>
            </span>
          ) : backendForecast ? (
            <span className="text-[#5A6A7E] px-2.5 py-1 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
              Soil state: <strong className="capitalize text-[#26364A]">{backendForecast.antecedent_wetness}</strong> · 6h Peak:{' '}
              <strong className="font-mono text-[#173C79]">{backendForecast.peak_6h_total_mm} mm</strong>
            </span>
          ) : (
            <span className="text-[#5A6A7E]">
              Screening scenario: <strong className="text-[#173C79]">{operationalScenario.label}</strong>
            </span>
          )}
          <span className="text-[#5A6A7E] font-mono">
            Mode switched from top navigation bar
          </span>
        </div>

        {/* 2001 Mode Interactive Date & Time Weather Replay Sliders */}
        {operationalMode === 'demo_2001' && (
          <div className="p-3 rounded-sm bg-[#FBEBEB]/55 border border-[#D94343]/35 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#A12323]">
                <CalendarDays className="w-4 h-4 text-[#D94343]" />
                <span>2001 Monsoon Weather Replay (Simulated Archive):</span>
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

        {/* Budget Slider + 4 Impact Stat Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          <BudgetControlCard
            className="lg:col-span-4"
            budgetPkr={optConfig.budgetPkr}
            spentPkr={optResult?.totalCostPkr ?? 0}
            onBudgetChange={setPitchBudgetPkr}
          />

          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            <StatCard
              tone="success"
              label="Area Reduction %"
              icon={<TrendingDown className="w-3.5 h-3.5" />}
              value={
                <>
                  <span>
                    {moneySlide.areaReductionPct > 0
                      ? `-${moneySlide.areaReductionPct}%`
                      : '0%'}
                  </span>
                  {(isOptimizing || isAutoSyncingOpt) && (
                    <Loader2 className="w-4 h-4 animate-spin text-[#55A85F]" />
                  )}
                </>
              }
              subtext={`${moneySlide.baseArea.toFixed(2)} → ${moneySlide.mitArea.toFixed(2)} km²`}
            />

            <StatCard
              tone="primary"
              label="Population Protected"
              icon={<Users className="w-3.5 h-3.5" />}
              value={formatNumber(moneySlide.populationProtected)}
              subtext={`Exposed: ${formatNumber(moneySlide.basePop)} → ${formatNumber(moneySlide.mitPop)}`}
            />

            <StatCard
              tone="primary"
              label="Buildings Saved"
              icon={<Building2 className="w-3.5 h-3.5" />}
              value={moneySlide.buildingsSaved}
              subtext={`Exposed: ${moneySlide.baseBldg} → ${moneySlide.mitBldg}`}
            />

            <StatCard
              tone="neutral"
              label="Interventions & Frontier"
              value={`${moneySlide.sites} Sites`}
              subtext={
                !moneySlide.hasFloodRisk
                  ? 'No flood risk — no solution needed'
                  : moneySlide.sites >= 40
                    ? 'Pareto optimum (~230M)'
                    : `Budget cap: ${moneySlide.budgetM}M PKR`
              }
            />
          </div>
        </div>

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

          <ReportActionButtons onOpenFullReport={() => navigate('/reports')} compact />
        </div>

        <EquityStatusBanner
          hasFloodRisk={moneySlide.hasFloodRisk}
          equityFlagged={moneySlide.equityFlagged}
          rightSlot={
            operationalMode === 'demo_2001'
              ? `2001 Weather Replay (${weather.fetchedAtPkt})`
              : 'Live Weather Operations'
          }
        />
      </MunicipalPanel>

      {/* PRIORITY 4: CALENDAR-BASED FORECAST TIMELINE WITH SCIENTIFIC CONFIDENCE REGIMES */}
      <MunicipalPanel
        title={`Calendar Flood Outlook (${weather.outlook30d.length}-Day Available Horizon)`}
        icon={<CalendarDays className="w-4 h-4" />}
        rightSlot={
          <div className="flex flex-wrap items-center gap-1.5">
            {outlookRangeLabel && (
              <span className="px-2 py-0.5 rounded-sm bg-white/15 border border-white/25 text-white text-[10px] font-mono">
                {outlookRangeLabel}
              </span>
            )}
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
              <span>{browserAlertsEnabled ? 'Session Alerts Enabled' : 'Enable 30-Day Alerts'}</span>
            </button>
          </div>
        }
        bodyClassName="p-3 space-y-2.5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          {weather.forecastState === 'unavailable' ? (
            <div className="flex items-start sm:items-center gap-2 text-xs text-[#8A6700] bg-[#FEF9E7] border border-[#E0B422]/60 rounded-sm px-3 py-1.5">
              <AlertTriangle className="w-4 h-4 text-[#EF8735] flex-shrink-0" />
              <span>
                <strong>Live Forecast Unavailable (Fallback Screening Active):</strong> External weather feed unreachable; cannot verify an all-clear outlook.
              </span>
            </div>
          ) : weather.earliestFloodAlert ? (
            <div className="flex items-start sm:items-center gap-2 text-xs text-[#A12323] bg-[#FBEBEB]/70 border border-[#D94343]/40 rounded-sm px-3 py-1.5">
              <AlertTriangle className="w-4 h-4 text-[#D94343] flex-shrink-0" />
              <span>
                <strong>Advance Flood Watch:</strong> {weather.earliestFloodAlert.summary}{' '}
                <span className="text-[#5A6A7E]">Select any date card to inspect modeled flood impact.</span>
              </span>
            </div>
          ) : weather.outlookSource === 'OPEN_METEO_16D_ONLY' || weather.isStale ? (
            <div className="flex items-start sm:items-center gap-2 text-xs text-[#8A6700] bg-[#FEF9E7] border border-[#E0B422]/60 rounded-sm px-3 py-1.5">
              <AlertTriangle className="w-4 h-4 text-[#EF8735] flex-shrink-0" />
              <span>
                <strong>Incomplete 30-Day Coverage:</strong> Short/medium-range forecast shows no heavy rain, while extended ensemble data is unavailable ({weather.coveragePct}% hourly verified).
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-[#2F6F37] bg-[#EDF7EE] border border-[#55A85F]/40 rounded-sm px-3 py-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#55A85F] flex-shrink-0" />
              <span>
                <strong>Outlook Clear:</strong> No heavy flood-producing rainfall (&gt;35 mm/day) detected across available forecast days ({weather.forecast30dMm} mm cumulative).
              </span>
            </div>
          )}

          {/* Calendar Date Jump + Horizon Confidence Disclosure */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] flex-shrink-0">
            <select
              aria-label="Calendar forecast date selector"
              value={selectedOutlookDay ?? ''}
              onChange={(e) =>
                setSelectedOutlookDay(e.target.value ? Number(e.target.value) : null)
              }
              className="px-2 py-1 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] text-[11px] font-medium text-[#173C79]"
            >
              <option value="">Jump to calendar date...</option>
              {weather.outlook30d
                .filter((d) => d.isAvailable)
                .map((d) => (
                  <option key={d.dayOffset} value={d.dayOffset}>
                    {d.dateLabel} ({d.monthYearLabel}) · {d.rainfallMm} mm
                  </option>
                ))}
            </select>

            {selectedDayPoint ? (
              <button
                type="button"
                onClick={() => setSelectedOutlookDay(null)}
                className="px-2 py-1 rounded-sm bg-[#173C79] text-white text-[11px] font-semibold cursor-pointer"
              >
                Viewing Day +{selectedDayPoint.dayOffset} ({selectedDayPoint.dateLabel}) · Reset
              </button>
            ) : (
              <span className="font-mono text-[#5A6A7E]">
                Confidence unavailable (skill decreases past 5d)
              </span>
            )}
          </div>
        </div>

        {/* Confidence / Availability Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#5A6A7E]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs border-2 border-[#173C79] bg-[#EEF3FA]" />
            Short-Range (Days 1–5)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs border border-[#9AA7B8] bg-[#F8FAFC]" />
            Medium-Range (Days 6–16, Lower Skill)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-[#7C3AED] bg-[#F5F3FF]" />
            Experimental Ensemble (Days 17+)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-[#CBD5E1] bg-[#F1F5F9] opacity-60" />
            Unavailable
          </span>
        </div>

        {/* Calendar Strip with Actual Dates & Month Transitions */}
        <div className="overflow-x-auto pb-1">
          <div className="flex items-stretch gap-1.5 min-w-max">
            {weather.outlook30d.map((day, idx) => {
              const prev = idx > 0 ? weather.outlook30d[idx - 1] : null;
              const isNewMonth = idx === 0 || prev?.monthYearLabel !== day.monthYearLabel;
              const active = selectedOutlookDay === day.dayOffset;
              const meta = STATION_RISK_META[day.riskLevel];
              const barPct = day.isAvailable
                ? Math.min(100, Math.max(10, Math.round((day.rainfallMm / 120) * 100)))
                : 0;

              const tierCardCls = !day.isAvailable
                ? 'border-dashed border-[#CBD5E1] bg-[#F1F5F9]/70 opacity-65 cursor-not-allowed'
                : day.confidenceTier === 'HIGHER'
                  ? 'border-[#173C79]/55 bg-[#EEF3FA]/50 hover:border-[#173C79]'
                  : day.confidenceTier === 'LOWER'
                    ? 'border-[#CBD5E1] bg-white hover:border-[#173C79]'
                    : 'border-dashed border-[#7C3AED]/55 bg-[#F5F3FF]/50 hover:border-[#7C3AED]';

              return (
                <div key={day.dayOffset} className="flex flex-col">
                  <div className="h-4 flex items-center">
                    {isNewMonth && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#173C79] whitespace-nowrap">
                        {day.monthYearLabel}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!day.isAvailable}
                    onClick={() =>
                      day.isAvailable && setSelectedOutlookDay(active ? null : day.dayOffset)
                    }
                    title={
                      day.isAvailable
                        ? `${day.dateLabel} (${day.monthYearLabel}): ${day.rainfallMm} mm (P90: ${day.p90RainfallMm} mm, ${day.probabilityPct}% prob) · ${day.confidenceLabel}`
                        : `${day.dateLabel} (${day.monthYearLabel}): Forecast data unavailable`
                    }
                    className={cn(
                      'w-[58px] flex flex-col items-center justify-between rounded-sm border p-1 transition-all',
                      day.isAvailable && 'cursor-pointer',
                      active ? 'ring-2 ring-[#173C79] bg-[#E8EEF7] border-[#173C79]' : tierCardCls
                    )}
                  >
                    <span className="text-[9.5px] font-semibold text-[#26364A] whitespace-nowrap">
                      {day.dateLabel}
                    </span>
                    <div className="w-full h-7 flex items-end justify-center my-0.5 px-1">
                      {day.isAvailable ? (
                        <div
                          className="w-full rounded-t-[2px]"
                          style={{
                            height: `${barPct}%`,
                            backgroundColor: day.rainfallMm < 2 ? '#94A3B8' : meta.hex,
                          }}
                        />
                      ) : (
                        <span className="text-[8px] font-mono text-[#94A3B8]">—</span>
                      )}
                    </div>
                    <span className="text-[9px] font-mono text-[#5A6A7E] whitespace-nowrap">
                      {day.isAvailable ? `${day.rainfallMm.toFixed(0)} mm` : 'N/A'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </MunicipalPanel>

      {/* PRIORITY 5: COMPACT SUPPORTING WEATHER & ENVIRONMENTAL INPUTS (~15% footprint, expandable) */}
      <MunicipalPanel
        title="Supporting Weather & Environmental Inputs"
        icon={<CloudSun className="w-4 h-4" />}
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeatherExpanded((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-white/15 hover:bg-white/25 border border-white/25 text-white text-[10px] font-semibold cursor-pointer"
            >
              {weatherExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Hide Detailed Weather Charts
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Expand Weather Details
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/prediction')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-white text-[#173C79] text-[10px] font-semibold cursor-pointer hover:bg-[#F5F6F7]"
            >
              <span>Full Forecast</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        }
        bodyClassName="p-3 space-y-3"
      >
        {/* Single Compact Indicator Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
            <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
              <CloudRain className="w-3 h-3 text-[#244D8F]" />
              24h Rain / Peak
            </div>
            <div className="font-mono font-bold text-[#173C79] mt-0.5">
              {weather.forecast24hMm.toFixed(1)} mm · {(weather.peakHourly24hMm ?? weather.peakHourlyMm).toFixed(1)}/h
            </div>
          </div>

          <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
            <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
              <Thermometer className="w-3 h-3 text-[#EF8735]" />
              Temp / Humidity
            </div>
            <div className="font-mono font-bold text-[#26364A] mt-0.5">
              {weather.currentWeather.temperatureC !== null
                ? `${weather.currentWeather.temperatureC.toFixed(1)}°C`
                : 'N/A'}{' '}
              · {weather.currentWeather.humidityPct !== null ? `${weather.currentWeather.humidityPct}%` : 'N/A'}
            </div>
          </div>

          <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
            <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
              <Wind className="w-3 h-3 text-[#55A85F]" />
              Wind / Prob.
            </div>
            <div className="font-mono font-bold text-[#26364A] mt-0.5">
              {weather.currentWeather.windSpeedKmh !== null
                ? `${weather.currentWeather.windSpeedKmh.toFixed(1)} km/h`
                : 'N/A'}{' '}
              · {weather.maxProbabilityPct}%
            </div>
          </div>

          <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
            <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
              <Droplets className="w-3 h-3 text-[#244D8F]" />
              Soil Moisture (0–9 cm)
            </div>
            <div className="font-mono font-semibold text-[#173C79] mt-0.5 truncate">
              {soilMoisture.combinedLabel}
            </div>
          </div>

          <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
            <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
              <Waves className="w-3 h-3 text-[#173C79]" />
              Drainage Level (Proxy)
            </div>
            <div className="font-mono font-bold text-[#173C79] mt-0.5">
              Peak {peakWaterLevelM.toFixed(2)} m · Avg {avgWaterLevelM.toFixed(2)} m
            </div>
          </div>

          <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
            <div className="text-[10px] text-[#5A6A7E]">Past 7d / API₇</div>
            <div className="font-mono font-bold text-[#26364A] mt-0.5">
              {weather.past7DayTotalMm} mm · API {weather.api7DayMm}
            </div>
          </div>
        </div>

        {/* Expandable Detailed Weather Charts (hidden by default so map stays dominant) */}
        {weatherExpanded && (
          <div className="pt-3 border-t border-[#E6EAEF] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#173C79]">
                <span>Detailed {forecastDaysOption}-Day Meteorological Breakdown</span>
                <span className="font-mono text-[10px] text-[#5A6A7E]">({forecastDaysOption}d horizon)</span>
              </div>
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
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
                  <div className="text-[10px] font-mono text-[#244D8F]">{d.rainfallMm} mm</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] font-semibold text-[#26364A] mb-1">
                  Hourly Rainfall (mm/h)
                </div>
                <div className="h-28">
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

              <div>
                <div className="text-[11px] font-semibold text-[#26364A] mb-1">
                  Temperature Forecast (°C)
                </div>
                <div className="h-28">
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

              <div>
                <div className="text-[11px] font-semibold text-[#26364A] mb-1">
                  Station Runoff Profile (m proxy) &amp; Wind
                </div>
                <div className="h-28">
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
        )}
      </MunicipalPanel>
    </div>
  );
}
