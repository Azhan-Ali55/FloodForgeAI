import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CloudLightning,
  Droplets,
  History,
  Loader2,
  Map as MapIcon,
  Play,
  Route,
  ShieldAlert,
  ShieldCheck,
  Users,
  Waves,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTierBadge,
  MunicipalPanel,
  ScenarioTagBadge,
} from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { runPortfolioOptimizationLocal } from '../engine/optimizer';
import { PILOT_CONFIG } from '../engine/pilotConfig';
import type {
  AntecedentWetnessLevel,
  ForecastHorizon,
  OptimizationResult,
  Scenario,
  ScenarioTag,
} from '../types/floodforge';
import { cn } from '../utils/cn';
import { formatNumber, formatPKR } from '../utils/formatters';

const STORM_PRESETS: Array<{
  name: string;
  intensity: number;
  duration: number;
  wetness: AntecedentWetnessLevel;
  tag: ScenarioTag;
}> = [
  {
    name: 'Moderate Monsoon',
    intensity: 38,
    duration: 2.5,
    wetness: 'normal',
    tag: 'HYPOTHETICAL_STRESS_TEST',
  },
  {
    name: 'Severe Cloudburst',
    intensity: 76,
    duration: 3,
    wetness: 'wet',
    tag: 'HYPOTHETICAL_STRESS_TEST',
  },
  {
    name: '2001 Cloudburst (620 mm / 10h)',
    intensity: 62,
    duration: 10,
    wetness: 'saturated',
    tag: 'HYPOTHETICAL_STRESS_TEST',
  },
];

interface HistoricalEventSpec {
  id: '2001_cloudburst' | '2021_monsoon';
  title: string;
  dateLabel: string;
  summary: string;
  rainfallMmHr: number;
  durationHr: number;
  wetness: AntecedentWetnessLevel;
}

const HISTORICAL_EVENTS: HistoricalEventSpec[] = [
  {
    id: '2001_cloudburst',
    title: 'July 23, 2001 Islamabad–Rawalpindi Cloudburst',
    dateLabel: '620 mm over 10 hr · Saturated Basin',
    summary:
      'Historic extreme cloudburst along Nullah Lai. Replays unmitigated inundation vs. counterfactual loss prevented by AI-sited retention ponds, permeable zones, and drainage upgrades.',
    rainfallMmHr: 62,
    durationHr: 10,
    wetness: 'saturated',
  },
  {
    id: '2021_monsoon',
    title: 'July 28, 2021 Nullah Lai Monsoon Surge',
    dateLabel: '330 mm over 6 hr · Wet Basin',
    summary:
      'Major urban flash-flooding surge impacting Katarian, Gawalmandi, and Sector E-11/I-10 tributaries. Evaluates preventative loss reduction under municipal budget limits.',
    rainfallMmHr: 55,
    durationHr: 6,
    wetness: 'wet',
  },
];

const HINDCAST_BUDGETS = [50_000_000, 100_000_000, 150_000_000, 250_000_000];
const hindcastCache = new Map<string, OptimizationResult>();

export function FloodPrediction() {
  const navigate = useNavigate();
  const {
    weather,
    forecastHorizon,
    setForecastHorizon,
    twin,
    simScenario,
    setSimScenario,
    simBaselineResult,
    simActiveResult,
    isSimulating,
    runCloudburstSimulation,
    optConfig,
    setOptConfig,
    runOptimization,
  } = useFloodForge();

  const [validationError, setValidationError] = useState<string | null>(null);
  const [hindcastEventId, setHindcastEventId] =
    useState<HistoricalEventSpec['id']>('2001_cloudburst');
  const [hindcastBudget, setHindcastBudget] = useState<number>(100_000_000);
  const [hindcastResult, setHindcastResult] = useState<OptimizationResult | null>(null);
  const [isRunningHindcast, setIsRunningHindcast] = useState(false);

  const activeHistoricalEvent = useMemo(
    () => HISTORICAL_EVENTS.find((e) => e.id === hindcastEventId) ?? HISTORICAL_EVENTS[0],
    [hindcastEventId]
  );

  useEffect(() => {
    const cacheKey = `${twin.studyAreaId}:${hindcastEventId}:${hindcastBudget}`;
    const cached = hindcastCache.get(cacheKey);
    if (cached) {
      setHindcastResult(cached);
      return;
    }
    let active = true;
    setIsRunningHindcast(true);
    const timer = setTimeout(() => {
      const scenario: Scenario = {
        rainfall_mm_per_hr: activeHistoricalEvent.rainfallMmHr,
        duration_hr: activeHistoricalEvent.durationHr,
        budget_pkr: hindcastBudget,
        antecedent_wetness: activeHistoricalEvent.wetness,
        uncertainty_factor: 1.0,
        tag: 'HYPOTHETICAL_STRESS_TEST',
        label: activeHistoricalEvent.title,
      };
      const res = runPortfolioOptimizationLocal(
        twin,
        scenario,
        {
          ...optConfig,
          budgetPkr: hindcastBudget,
          enabledTypes: ['retention_pond', 'permeable_surface', 'drainage_upgrade'],
        },
        false
      );
      if (!active) return;
      hindcastCache.set(cacheKey, res);
      setHindcastResult(res);
      setIsRunningHindcast(false);
    }, 60);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [twin, hindcastEventId, hindcastBudget, activeHistoricalEvent, optConfig]);

  const handleLoadHindcastToMap = async () => {
    const scenario: Scenario = {
      rainfall_mm_per_hr: activeHistoricalEvent.rainfallMmHr,
      duration_hr: activeHistoricalEvent.durationHr,
      budget_pkr: hindcastBudget,
      antecedent_wetness: activeHistoricalEvent.wetness,
      uncertainty_factor: 1.0,
      tag: 'HYPOTHETICAL_STRESS_TEST',
      label: activeHistoricalEvent.title,
    };
    const nextCfg = {
      ...optConfig,
      budgetPkr: hindcastBudget,
      enabledTypes: ['retention_pond', 'permeable_surface', 'drainage_upgrade'] as typeof optConfig.enabledTypes,
    };
    setSimScenario(scenario);
    setOptConfig(nextCfg);
    await runCloudburstSimulation(scenario);
    await runOptimization(nextCfg);
    navigate('/map');
  };

  const visibleForecast = useMemo(
    () =>
      weather.hourlyForecast.slice(0, forecastHorizon).map((h) => ({
        label: `+${h.hourOffset}h`,
        fullTime: h.label,
        precipitationMm: h.precipitationMm,
        probabilityPct: h.probabilityPct,
      })),
    [weather.hourlyForecast, forecastHorizon]
  );

  const horizonTotalMm =
    forecastHorizon === 24
      ? weather.forecast24hMm
      : forecastHorizon === 48
        ? weather.forecast48hMm
        : weather.forecast72hMm;

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      simScenario.rainfall_mm_per_hr < 5 ||
      simScenario.rainfall_mm_per_hr > 200
    ) {
      setValidationError('Rainfall intensity must be between 5 and 200 mm/hr.');
      return;
    }
    if (simScenario.duration_hr < 0.5 || simScenario.duration_hr > 24) {
      setValidationError('Storm duration must be between 0.5 and 24 hours.');
      return;
    }
    setValidationError(null);
    await runCloudburstSimulation();
  };

  const exposedFacilityList = useMemo(
    () =>
      twin.facility_records.filter((f) => {
        const idx = f.row * twin.cols + f.col;
        return simActiveResult.exposed_mask[idx] === 1;
      }),
    [twin, simActiveResult]
  );

  const preparednessActions = useMemo(() => {
    const actions: Array<{ priority: 'HIGH' | 'MEDIUM' | 'ROUTINE'; text: string }> = [];
    const totalRain = Number(
      (
        simScenario.rainfall_mm_per_hr *
        simScenario.duration_hr *
        (simScenario.uncertainty_factor ?? 1)
      ).toFixed(0)
    );

    if (simActiveResult.metrics.exposed_area_km2 <= 0.1) {
      actions.push({
        priority: 'ROUTINE',
        text: `Modeled accumulation is within routine drainage capacity (${totalRain} mm scenario). Maintain standard WASA monitoring.`,
      });
      return actions;
    }

    const hospitals = exposedFacilityList.filter((f) => f.type === 'hospital');
    const rescueNodes = exposedFacilityList.filter((f) => f.type === 'rescue_1122');
    const wasaNodes = exposedFacilityList.filter((f) => f.type === 'wasa_station');

    if (hospitals.length > 0) {
      actions.push({
        priority: 'HIGH',
        text: `Protect backup power & ground-floor triage at ${hospitals.map((h) => h.name).join(', ')} (within modeled >=50 mm risk mask).`,
      });
    }
    if (rescueNodes.length > 0 || wasaNodes.length > 0) {
      const names = [...wasaNodes, ...rescueNodes].map((n) => n.name).join(', ');
      actions.push({
        priority: 'HIGH',
        text: `Verify pump readiness & pre-position Rescue 1122 response units near ${names}.`,
      });
    }
    if (simActiveResult.metrics.road_segments_exposed > 0) {
      actions.push({
        priority: 'MEDIUM',
        text: `Issue pre-storm traffic diversion advisory for ${simActiveResult.metrics.road_segments_exposed} modeled flood-exposed arterial corridors (including low-lying Nullah Lai crossings).`,
      });
    }
    actions.push({
      priority: 'MEDIUM',
      text: `Screening scenario (${totalRain} mm total) estimates ${simActiveResult.metrics.exposed_area_km2.toFixed(2)} km² exposed — cross-verify with official PMD & NDMA bulletins before public directives.`,
    });
    return actions;
  }, [exposedFacilityList, simActiveResult, simScenario]);

  const comparisonRows = useMemo(() => {
    const b = simBaselineResult.metrics;
    const s = simActiveResult.metrics;
    const pct = (a: number, c: number) =>
      a > 0 ? `${((c - a) / a) * 100 >= 0 ? '+' : ''}${(((c - a) / a) * 100).toFixed(1)}%` : '—';

    return [
      {
        label: 'Estimated Affected Area',
        unit: 'km²',
        before: b.exposed_area_km2.toFixed(2),
        after: s.exposed_area_km2.toFixed(2),
        delta: pct(b.exposed_area_km2, s.exposed_area_km2),
        icon: Waves,
      },
      {
        label: 'Potentially Exposed Population',
        unit: 'people',
        before: formatNumber(b.population_exposed),
        after: formatNumber(s.population_exposed),
        delta: pct(b.population_exposed, s.population_exposed),
        icon: Users,
      },
      {
        label: 'Potentially Affected Buildings',
        unit: 'structures',
        before: formatNumber(b.buildings_exposed),
        after: formatNumber(s.buildings_exposed),
        delta: pct(b.buildings_exposed, s.buildings_exposed),
        icon: Building2,
      },
      {
        label: 'Potentially Affected Roads',
        unit: 'segments',
        before: String(b.road_segments_exposed),
        after: String(s.road_segments_exposed),
        delta: pct(b.road_segments_exposed, s.road_segments_exposed),
        icon: Route,
      },
      {
        label: 'Critical Facilities in Risk Mask',
        unit: 'facilities',
        before: String(b.total_facilities_exposed),
        after: String(s.total_facilities_exposed),
        delta: pct(b.total_facilities_exposed, s.total_facilities_exposed),
        icon: ShieldAlert,
      },
    ];
  }, [simBaselineResult.metrics, simActiveResult.metrics]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#173C79]">
            Operational Flood Prediction &amp; Cloudburst Simulator
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6A7E]">
            Combine meteorological forecasts with pervious-only antecedent soil wetness and deterministic D8 cloudburst stress testing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScenarioTagBadge tag={simActiveResult.scenario_tag} />
          <AlertTierBadge tier={simActiveResult.alert_tier} size="md" />
        </div>
      </div>

      {/* Weather Forecast Section */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <MunicipalPanel
          title="Hourly Rainfall Forecast & Probability"
          className="xl:col-span-8"
          rightSlot={
            <div className="flex items-center rounded-sm bg-[#244D8F] p-0.5 text-[10px]">
              {([24, 48, 72] as ForecastHorizon[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setForecastHorizon(h)}
                  className={cn(
                    'px-2.5 py-0.5 rounded-sm font-mono font-semibold transition-colors cursor-pointer',
                    forecastHorizon === h
                      ? 'bg-white text-[#173C79]'
                      : 'text-white/85 hover:text-white'
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>
          }
        >
          <div className="flex items-center justify-between text-xs text-[#5A6A7E] mb-2">
            <span>
              {forecastHorizon}h cumulative forecast:{' '}
              <strong className="text-[#173C79] font-mono">{horizonTotalMm.toFixed(1)} mm</strong> · Peak hourly:{' '}
              <strong className="font-mono text-[#26364A]">{weather.peakHourlyMm} mm/h</strong>
            </span>
            <span
              className={cn(
                'text-[10px] font-mono px-2 py-0.5 rounded-sm border',
                weather.source === 'OPEN_METEO_LIVE'
                  ? 'bg-[#EDF7EE] border-[#55A85F]/50 text-[#2F6F37]'
                  : 'bg-[#FEF9E7] border-[#E0B422]/70 text-[#8A6700]'
              )}
            >
              {weather.source === 'OPEN_METEO_LIVE' ? 'LIVE OPEN-METEO' : 'FALLBACK DATA'}
            </span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visibleForecast}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#5A6A7E', fontSize: 10 }}
                  interval={forecastHorizon === 24 ? 2 : forecastHorizon === 48 ? 5 : 8}
                />
                <YAxis yAxisId="left" tick={{ fill: '#5A6A7E', fontSize: 10 }} unit="mm" />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: '#5A6A7E', fontSize: 10 }}
                  unit="%"
                />
                <Tooltip contentStyle={{ fontSize: 12, borderColor: '#CBD5E1' }} />
                <Bar
                  yAxisId="left"
                  dataKey="precipitationMm"
                  name="Precipitation (mm)"
                  fill="#244D8F"
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="probabilityPct"
                  name="Rain Probability (%)"
                  stroke="#55A85F"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </MunicipalPanel>

        <MunicipalPanel
          title="Antecedent Wetness & Soil Moisture"
          icon={<Droplets className="w-4 h-4" />}
          rightSlot={
            <span className="text-[10px] font-mono text-white/90">
              API₇ = {weather.api7DayMm} mm
            </span>
          }
          className="xl:col-span-4"
          bodyClassName="p-3.5 flex flex-col justify-between gap-3"
        >
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weather.past7DaysDaily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#5A6A7E', fontSize: 9 }} />
                <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={28} />
                <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                <Bar
                  dataKey="rainfallMm"
                  name="Past Daily Rain (mm)"
                  fill="#55A85F"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E6EAEF]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A7E]">
              Vadose Soil Moisture (Open-Meteo Land Cell)
            </div>
            {[
              { label: 'Surface (0–1 cm)', val: weather.currentSoilMoisture.top0_1cm },
              { label: 'Shallow (1–3 cm)', val: weather.currentSoilMoisture.mid1_3cm },
              { label: 'Root Zone (3–9 cm)', val: weather.currentSoilMoisture.deep3_9cm },
            ].map((sm) => {
              const pct = Math.min(100, Math.round((sm.val / 0.5) * 100));
              return (
                <div key={sm.label} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#5A6A7E]">{sm.label}</span>
                    <span className="font-mono font-semibold text-[#26364A]">
                      {sm.val.toFixed(3)} m³/m³
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#E6EAEF] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#173C79]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-[#5A6A7E] leading-snug pt-1">
              Soil moisture adjusts pervious cells only; paved urban cells remain invariant.
            </p>
          </div>
        </MunicipalPanel>
      </div>

      {/* Cloudburst Scenario Simulator + Prediction Results */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <MunicipalPanel
          title="Cloudburst Scenario Simulator"
          icon={<CloudLightning className="w-4 h-4" />}
          rightSlot={<ScenarioTagBadge tag={simScenario.tag} />}
          className="xl:col-span-5"
        >
          <form onSubmit={handleRunSimulation} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A7E]">
                Deterministic Stress Presets
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STORM_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() =>
                      setSimScenario((prev) => ({
                        ...prev,
                        rainfall_mm_per_hr: p.intensity,
                        duration_hr: p.duration,
                        antecedent_wetness: p.wetness,
                        tag: p.tag,
                        label: p.name,
                      }))
                    }
                    className="px-2.5 py-1 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] hover:border-[#173C79] text-[11px] font-medium text-[#26364A] cursor-pointer transition-colors"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="text-[#5A6A7E] font-medium">Rainfall Intensity (mm/hr)</label>
                <span className="font-mono text-[#173C79] font-semibold">
                  {simScenario.rainfall_mm_per_hr} mm/hr (Total:{' '}
                  {(
                    simScenario.rainfall_mm_per_hr *
                    simScenario.duration_hr *
                    (simScenario.uncertainty_factor ?? 1)
                  ).toFixed(0)}{' '}
                  mm)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={160}
                  step={2}
                  value={simScenario.rainfall_mm_per_hr}
                  onChange={(e) =>
                    setSimScenario((prev) => ({
                      ...prev,
                      rainfall_mm_per_hr: Number(e.target.value),
                    }))
                  }
                  className="flex-1"
                />
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={simScenario.rainfall_mm_per_hr}
                  onChange={(e) =>
                    setSimScenario((prev) => ({
                      ...prev,
                      rainfall_mm_per_hr: Number(e.target.value),
                    }))
                  }
                  className="w-20 px-2 py-1 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] font-mono text-xs text-[#26364A]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="text-[#5A6A7E] font-medium">Storm Duration (hours)</label>
                <span className="font-mono font-semibold text-[#26364A]">
                  {simScenario.duration_hr} hr
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={0.5}
                  value={simScenario.duration_hr}
                  onChange={(e) =>
                    setSimScenario((prev) => ({
                      ...prev,
                      duration_hr: Number(e.target.value),
                    }))
                  }
                  className="flex-1"
                />
                <input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={simScenario.duration_hr}
                  onChange={(e) =>
                    setSimScenario((prev) => ({
                      ...prev,
                      duration_hr: Number(e.target.value),
                    }))
                  }
                  className="w-20 px-2 py-1 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] font-mono text-xs text-[#26364A]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#5A6A7E]">Antecedent Wetness</label>
                <select
                  value={simScenario.antecedent_wetness ?? 'normal'}
                  onChange={(e) =>
                    setSimScenario((prev) => ({
                      ...prev,
                      antecedent_wetness: e.target.value as AntecedentWetnessLevel,
                    }))
                  }
                  className="w-full px-2.5 py-2 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] text-xs text-[#26364A]"
                >
                  <option value="dry">Dry (Low API₇)</option>
                  <option value="normal">Normal Basin Moisture</option>
                  <option value="wet">Wet (Recent Monsoon)</option>
                  <option value="saturated">Saturated Soil Profile</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[#5A6A7E]">Scenario Classification</label>
                <select
                  value={simScenario.tag}
                  onChange={(e) => {
                    const tag = e.target.value as ScenarioTag;
                    setSimScenario((prev) => ({
                      ...prev,
                      tag,
                      uncertainty_factor:
                        tag === 'UNCERTAINTY_ENVELOPE' ? 1.25 : 1.0,
                    }));
                  }}
                  className="w-full px-2.5 py-2 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] text-xs text-[#26364A]"
                >
                  <option value="HYPOTHETICAL_STRESS_TEST">Hypothetical Stress Test</option>
                  <option value="UNCERTAINTY_ENVELOPE">Uncertainty Envelope (+25%)</option>
                  <option value="LIVE_FORECAST">Live Forecast-Driven</option>
                </select>
              </div>
            </div>

            {validationError && (
              <div className="p-2.5 rounded-sm bg-[#FBEBEB] border border-[#D94343]/50 text-xs text-[#D94343]">
                {validationError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSimulating}
              className="w-full py-2.5 px-4 rounded-sm bg-[#173C79] hover:bg-[#244D8F] disabled:opacity-60 text-white font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {isSimulating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running D8 Screening Simulation...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Run Flood Simulation
                </>
              )}
            </button>
          </form>
        </MunicipalPanel>

        <MunicipalPanel
          title="Modeled Flood Exposure & Scenario Comparison"
          rightSlot={
            <span className="text-[10px] font-mono text-white/85">
              Runtime: {simActiveResult.runtime_ms} ms
            </span>
          }
          className="xl:col-span-7"
          bodyClassName="p-4 space-y-4"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#D6DCE4] bg-[#F5F6F7] text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                  <th className="py-2 px-2.5">Exposure Indicator</th>
                  <th className="py-2 px-3 text-right">Operational Baseline</th>
                  <th className="py-2 px-3 text-right">Simulated Scenario</th>
                  <th className="py-2 px-2.5 text-right">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6EAEF] text-xs">
                {comparisonRows.map((row) => {
                  const Icon = row.icon;
                  const isIncrease = row.delta.startsWith('+');
                  return (
                    <tr key={row.label} className="hover:bg-[#F5F6F7]/70">
                      <td className="py-2.5 px-2.5 font-medium text-[#26364A] flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-[#173C79]" />
                        <span>{row.label}</span>
                        <span className="text-[10px] font-mono text-[#5A6A7E]">
                          ({row.unit})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#5A6A7E]">
                        {row.before}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#26364A]">
                        {row.after}
                      </td>
                      <td
                        className={cn(
                          'py-2.5 px-2.5 text-right font-mono font-semibold',
                          isIncrease ? 'text-[#D94343]' : 'text-[#55A85F]'
                        )}
                      >
                        {row.delta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E6EAEF]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#173C79]">
                Critical Facilities Within Modeled Risk Mask ({exposedFacilityList.length})
              </span>
              <span className="text-[10px] font-mono text-[#5A6A7E]">
                &ge; 50 mm runoff proxy
              </span>
            </div>
            {exposedFacilityList.length === 0 ? (
              <div className="p-2.5 rounded-sm bg-[#EDF7EE] border border-[#55A85F]/40 text-xs text-[#2F6F37]">
                No critical facilities intersect the 50 mm screening risk mask under this scenario.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {exposedFacilityList.map((f) => (
                  <div
                    key={f.id}
                    className="p-2 rounded-sm bg-[#FBEBEB]/60 border border-[#D94343]/40 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#26364A] truncate">{f.name}</div>
                      <div className="text-[10px] font-mono text-[#5A6A7E] truncate">
                        {f.zoneName}
                      </div>
                    </div>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-sm bg-[#D94343] text-white flex-shrink-0">
                      {f.type.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Before-the-Storm Preparedness Action List */}
          <div className="space-y-2 pt-2 border-t border-[#E6EAEF]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#173C79]">
                Before-the-Storm Preparedness Action List
              </span>
              <span className="text-[10px] font-mono text-[#5A6A7E]">
                Derived from modeled exposure
              </span>
            </div>
            <div className="space-y-1.5">
              {preparednessActions.map((act, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-2 rounded-sm border text-[11px] flex items-start gap-2',
                    act.priority === 'HIGH'
                      ? 'bg-[#FBEBEB]/60 border-[#D94343]/40 text-[#26364A]'
                      : act.priority === 'MEDIUM'
                        ? 'bg-[#FDF1E7]/70 border-[#EF8735]/40 text-[#26364A]'
                        : 'bg-[#EDF7EE] border-[#55A85F]/40 text-[#2F6F37]'
                  )}
                >
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-bold flex-shrink-0 mt-0.5',
                      act.priority === 'HIGH'
                        ? 'bg-[#D94343] text-white'
                        : act.priority === 'MEDIUM'
                          ? 'bg-[#EF8735] text-white'
                          : 'bg-[#55A85F] text-white'
                    )}
                  >
                    {act.priority}
                  </span>
                  <span className="leading-snug">{act.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-sm bg-[#FEF9E7] border border-[#E0B422]/60 flex items-start gap-2.5 text-[11px] text-[#26364A]">
            <AlertTriangle className="w-4 h-4 text-[#EF8735] flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="text-[#8A6700]">
                Uncertainty &amp; Epistemic Limitations:
              </strong>{' '}
              Sensitivity bounds (±14% runoff coefficient) estimate affected area between{' '}
              <span className="font-mono font-semibold">
                {simActiveResult.uncertainty.exposed_area_km2?.[0].toFixed(2)}–
                {simActiveResult.uncertainty.exposed_area_km2?.[1].toFixed(2)} km²
              </span>
              . Outputs are 30 m D8 screening-level proxies and do not replace PMD/NDMA hydrometric bulletins.
            </div>
          </div>
        </MunicipalPanel>
      </div>

      {/* Historical Hindcast & Prevention Impact Section */}
      <MunicipalPanel
        title="Past Flood Hindcast & Prevention Impact (Model Validation Counterfactual)"
        icon={<History className="w-4 h-4" />}
        rightSlot={
          <span className="text-[10px] font-mono text-white/90">
            30 m D8 + AI Optimizer Replay
          </span>
        }
        bodyClassName="p-4 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#E6EAEF]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {HISTORICAL_EVENTS.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setHindcastEventId(ev.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-sm border text-xs font-semibold transition-colors cursor-pointer',
                    hindcastEventId === ev.id
                      ? 'bg-[#173C79] text-white border-[#173C79]'
                      : 'bg-[#F5F6F7] text-[#26364A] border-[#D6DCE4] hover:border-[#173C79]'
                  )}
                >
                  {ev.title}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#5A6A7E]">{activeHistoricalEvent.summary}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <span className="text-[11px] font-semibold text-[#5A6A7E]">
              Prevention Budget:
            </span>
            <div className="flex items-center rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] p-0.5">
              {HINDCAST_BUDGETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setHindcastBudget(b)}
                  className={cn(
                    'px-2 py-1 rounded-sm text-[11px] font-mono font-semibold cursor-pointer transition-colors',
                    hindcastBudget === b
                      ? 'bg-[#173C79] text-white'
                      : 'text-[#5A6A7E] hover:text-[#173C79]'
                  )}
                >
                  {b / 1_000_000}M
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleLoadHindcastToMap}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-[#55A85F] hover:bg-[#469350] text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              <MapIcon className="w-3.5 h-3.5" />
              Inspect Delta on Map
            </button>
          </div>
        </div>

        {isRunningHindcast || !hindcastResult ? (
          <div className="py-10 flex items-center justify-center gap-2 text-xs font-mono text-[#173C79]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Running historical D8 replay &amp; prevention portfolio optimization...
          </div>
        ) : (
          (() => {
            const base = hindcastResult.baselineResult.metrics;
            const opt = hindcastResult.optimizedResult.metrics;
            const savedBuildings = Math.max(0, base.buildings_exposed - opt.buildings_exposed);
            const savedPop = Math.max(0, base.population_exposed - opt.population_exposed);
            const savedArea = Math.max(0, base.exposed_area_km2 - opt.exposed_area_km2);
            const savedFac = Math.max(
              0,
              base.total_facilities_exposed - opt.total_facilities_exposed
            );
            const pctBldg =
              base.buildings_exposed > 0
                ? ((savedBuildings / base.buildings_exposed) * 100).toFixed(1)
                : '0.0';
            const pctPop =
              base.population_exposed > 0
                ? ((savedPop / base.population_exposed) * 100).toFixed(1)
                : '0.0';
            const pctArea =
              base.exposed_area_km2 > 0
                ? ((savedArea / base.exposed_area_km2) * 100).toFixed(1)
                : '0.0';

            const chartData = [
              {
                metric: 'Flooded Area (×100 ha)',
                withoutPrevention: Number((base.exposed_area_km2 * 1).toFixed(2)),
                withPrevention: Number((opt.exposed_area_km2 * 1).toFixed(2)),
              },
              {
                metric: 'Buildings (×1000)',
                withoutPrevention: Number((base.buildings_exposed / 1000).toFixed(2)),
                withPrevention: Number((opt.buildings_exposed / 1000).toFixed(2)),
              },
              {
                metric: 'Population (×10k)',
                withoutPrevention: Number((base.population_exposed / 10_000).toFixed(2)),
                withPrevention: Number((opt.population_exposed / 10_000).toFixed(2)),
              },
            ];

            return (
              <div className="space-y-4">
                {/* Summary Impact Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-sm bg-[#EDF7EE] border border-[#55A85F]/60">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#2F6F37]">
                      <span>Buildings Protected</span>
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="text-xl font-bold font-mono text-[#173C79] mt-1">
                      {formatNumber(savedBuildings)} saved
                    </div>
                    <div className="text-[11px] text-[#2F6F37] font-mono mt-0.5">
                      -{pctBldg}% ({formatNumber(base.buildings_exposed)} →{' '}
                      {formatNumber(opt.buildings_exposed)})
                    </div>
                  </div>

                  <div className="p-3 rounded-sm bg-[#EDF7EE] border border-[#55A85F]/60">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#2F6F37]">
                      <span>Residents Protected</span>
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="text-xl font-bold font-mono text-[#173C79] mt-1">
                      {formatNumber(savedPop)} people
                    </div>
                    <div className="text-[11px] text-[#2F6F37] font-mono mt-0.5">
                      -{pctPop}% ({formatNumber(base.population_exposed)} →{' '}
                      {formatNumber(opt.population_exposed)})
                    </div>
                  </div>

                  <div className="p-3 rounded-sm bg-[#EEF3FA] border border-[#244D8F]/40">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#173C79]">
                      <span>Flooded Area Reduced</span>
                      <Waves className="w-4 h-4" />
                    </div>
                    <div className="text-xl font-bold font-mono text-[#173C79] mt-1">
                      -{savedArea.toFixed(2)} km²
                    </div>
                    <div className="text-[11px] text-[#5A6A7E] font-mono mt-0.5">
                      -{pctArea}% ({base.exposed_area_km2.toFixed(2)} →{' '}
                      {opt.exposed_area_km2.toFixed(2)} km²)
                    </div>
                  </div>

                  <div className="p-3 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4]">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#173C79]">
                      <span>Downstream Equity Audit</span>
                      <ShieldCheck className="w-4 h-4 text-[#55A85F]" />
                    </div>
                    <div className="text-sm font-bold font-mono text-[#2F6F37] mt-1.5 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#55A85F]" />
                      {hindcastResult.equityStatus.replace(/_/g, ' ')}
                    </div>
                    <div className="text-[11px] text-[#5A6A7E] font-mono mt-1">
                      {hindcastResult.selectedPortfolio.length} sites ({formatPKR(hindcastResult.totalCostPkr)}) · {savedFac} facilities shielded
                    </div>
                  </div>
                </div>

                {/* Comparison Chart + Selected Prevention Measures */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-6 p-3 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                    <div className="text-xs font-bold text-[#173C79] mb-2">
                      Without Prevention vs. With AI-Optimized Prevention ({activeHistoricalEvent.dateLabel})
                    </div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE4" vertical={false} />
                          <XAxis dataKey="metric" tick={{ fill: '#26364A', fontSize: 10 }} />
                          <YAxis tick={{ fill: '#5A6A7E', fontSize: 10 }} />
                          <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar
                            dataKey="withoutPrevention"
                            name="Without Prevention"
                            fill="#D94343"
                            radius={[2, 2, 0, 0]}
                          />
                          <Bar
                            dataKey="withPrevention"
                            name="With AI Prevention"
                            fill="#55A85F"
                            radius={[2, 2, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="lg:col-span-6 p-3 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#173C79]">
                        Where Prevention Measures Were Sited ({hindcastResult.selectedPortfolio.length} Sites)
                      </span>
                      <span className="text-[10px] font-mono text-[#55A85F] font-semibold">
                        Lift vs. Random: +{hindcastResult.improvementOverRandomPct}%
                      </span>
                    </div>
                    <div className="max-h-44 overflow-y-auto divide-y divide-[#E2E6EC] bg-white rounded-sm border border-[#D6DCE4] px-2.5">
                      {hindcastResult.selectedPortfolio.map((iv) => (
                        <div
                          key={iv.id}
                          className="py-1.5 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-[#173C79] mr-1.5">
                              {iv.id}
                            </span>
                            <span className="font-semibold text-[#26364A]">
                              {PILOT_CONFIG.interventions[iv.type].label}
                            </span>
                            <span className="text-[#5A6A7E] ml-1.5">· {iv.zoneName}</span>
                          </div>
                          <div className="font-mono text-right flex-shrink-0">
                            <span className="text-[#55A85F] font-semibold mr-2">
                              -{iv.expected_impact_pct.toFixed(1)}%
                            </span>
                            <span className="text-[#5A6A7E]">{formatPKR(iv.cost_pkr)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#5A6A7E] leading-snug">
                      <strong>Methodological note:</strong> Counterfactual hindcast computed on the 30 m D8 screening twin using historical storm depth ({activeHistoricalEvent.dateLabel}). Demonstrates spatial loss reduction and downstream equity compliance; not a substitute for surveyed 2001 WASA/PMD claim ledgers.
                    </p>
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </MunicipalPanel>
    </div>
  );
}
