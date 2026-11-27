import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  CloudLightning,
  Download,
  Droplets,
  Loader2,
  Play,
  Route,
  ShieldAlert,
  Users,
  Waves,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { HistoricalHindcastPanel } from '../components/prediction/HistoricalHindcastPanel';
import {
  AlertTierBadge,
  MunicipalPanel,
  PageHeader,
  ScenarioTagBadge,
} from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { buildPreparednessActions } from '../engine/monitoringStations';
import { buildScenarioForOutlookDay } from '../services/forecastService';
import type {
  AntecedentWetnessLevel,
  ForecastHorizon,
  ScenarioTag,
} from '../types/floodforge';
import { cn } from '../utils/cn';
import { formatNumber } from '../utils/formatters';
import { downloadSimulationReportCsv } from '../utils/reportExport';

const STORM_PRESETS: Array<{
  name: string;
  intensity: number;
  duration: number;
  thresholdMm: number;
  wetness: AntecedentWetnessLevel;
  tag: ScenarioTag;
}> = [
  {
    name: 'Moderate Monsoon',
    intensity: 38,
    duration: 2.5,
    thresholdMm: 50,
    wetness: 'normal',
    tag: 'HYPOTHETICAL_STRESS_TEST',
  },
  {
    name: 'Severe Cloudburst',
    intensity: 76,
    duration: 3,
    thresholdMm: 50,
    wetness: 'wet',
    tag: 'HYPOTHETICAL_STRESS_TEST',
  },
  {
    name: '2001 Cloudburst (620 mm / 10h)',
    intensity: 62,
    duration: 10,
    thresholdMm: 150,
    wetness: 'saturated',
    tag: 'HYPOTHETICAL_STRESS_TEST',
  },
];

export function FloodPrediction() {
  const {
    weather,
    forecastHorizon,
    setForecastHorizon,
    monsoonStressMode,
    toggleMonsoonStressMode,
    twin,
    simScenario,
    setSimScenario,
    simBaselineResult,
    simActiveResult,
    isSimulating,
    runCloudburstSimulation,
  } = useFloodForge();

  const [validationError, setValidationError] = useState<string | null>(null);

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
    const totalRain = Number(
      (
        simScenario.rainfall_mm_per_hr *
        simScenario.duration_hr *
        (simScenario.uncertainty_factor ?? 1)
      ).toFixed(0)
    );
    return buildPreparednessActions(
      twin,
      simActiveResult,
      totalRain,
      simScenario.threshold_mm ?? 50
    );
  }, [twin, simActiveResult, simScenario]);

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
      <PageHeader
        title="Operational Flood Prediction & Cloudburst Simulator"
        subtitle="Combine meteorological forecasts, soil moisture, and D8 cloudburst stress testing."
        rightSlot={
          <>
            <ScenarioTagBadge tag={simActiveResult.scenario_tag} />
            <AlertTierBadge tier={simActiveResult.alert_tier} size="md" />
          </>
        }
      />

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
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5A6A7E] mb-2">
            <span>
              Peak 6h window:{' '}
              <strong className="text-[#173C79] font-mono">
                {(() => {
                  const slice = weather.hourlyForecast.slice(0, forecastHorizon);
                  let best = 0;
                  for (let i = 0; i <= Math.max(0, slice.length - 6); i++) {
                    let s = 0;
                    for (let j = 0; j < 6 && i + j < slice.length; j++) s += slice[i + j].precipitationMm;
                    if (s > best) best = s;
                  }
                  return best.toFixed(1);
                })()} mm
              </strong>{' '}
              · {forecastHorizon}h total:{' '}
              <strong className="font-mono text-[#26364A]">{horizonTotalMm.toFixed(1)} mm</strong> · Peak hourly:{' '}
              <strong className="font-mono text-[#26364A]">{weather.peakHourlyMm} mm/h</strong>
            </span>
            <div className="flex items-center gap-2">
              {monsoonStressMode && (
                <button
                  type="button"
                  onClick={toggleMonsoonStressMode}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#EF8735] text-white font-semibold cursor-pointer hover:bg-[#D97222]"
                >
                  Exit Monsoon Test
                </button>
              )}
              <span
                className={cn(
                  'text-[10px] font-mono px-2 py-0.5 rounded-sm border',
                  weather.source === 'OPEN_METEO_LIVE'
                    ? 'bg-[#EDF7EE] border-[#55A85F]/50 text-[#2F6F37]'
                    : monsoonStressMode
                      ? 'bg-[#FDF1E7] border-[#EF8735]/70 text-[#A64D0B]'
                      : 'bg-[#FEF9E7] border-[#E0B422]/70 text-[#8A6700]'
                )}
              >
                {weather.source === 'OPEN_METEO_LIVE'
                  ? 'LIVE OPEN-METEO'
                  : monsoonStressMode
                    ? 'MONSOON SURGE TEST'
                    : 'FALLBACK DATA'}
              </span>
            </div>
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

      {/* 30-Day Multi-Tier Flood Outlook (16d Daily + 30d Ensemble) */}
      <MunicipalPanel
        title="30-Day Extended Flood Outlook (16-Day Deterministic + Days 17–30 Ensemble)"
        icon={<CalendarDays className="w-4 h-4" />}
        rightSlot={
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/85">
              30d Total: {weather.forecast30dMm} mm
            </span>
            <button
              type="button"
              onClick={toggleMonsoonStressMode}
              className={cn(
                'px-2 py-0.5 rounded-sm text-[10px] font-semibold border transition-colors cursor-pointer',
                monsoonStressMode
                  ? 'bg-[#EF8735] border-[#EF8735] text-white'
                  : 'bg-white/10 border-white/25 text-white hover:bg-white/20'
              )}
            >
              {monsoonStressMode ? 'Exit Monsoon Test' : 'Test 30-Day Monsoon Surge'}
            </button>
          </div>
        }
        bodyClassName="p-3.5 space-y-3"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
          {weather.earliestFloodAlert ? (
            <div className="flex items-center gap-2 text-[#A12323] font-medium">
              <AlertTriangle className="w-4 h-4 text-[#D94343] flex-shrink-0" />
              <span>{weather.earliestFloodAlert.summary}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[#2F6F37] font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#55A85F] flex-shrink-0" />
              <span>No flood-triggering rainfall (&gt;35 mm/day) detected in the next 30 days.</span>
            </div>
          )}
          <span className="text-[11px] text-[#5A6A7E]">
            Click any bar to run the 30 m D8 flood simulation for that future date.
          </span>
        </div>

        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={weather.outlook30d}
              onClick={(state) => {
                const payload = (state as { activePayload?: Array<{ payload: typeof weather.outlook30d[number] }> })?.activePayload?.[0]?.payload;
                if (payload) {
                  const s = buildScenarioForOutlookDay(payload, weather, simScenario.budget_pkr);
                  runCloudburstSimulation(s);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: '#5A6A7E', fontSize: 10 }}
                interval={2}
              />
              <YAxis tick={{ fill: '#5A6A7E', fontSize: 10 }} unit="mm" />
              <Tooltip contentStyle={{ fontSize: 12, borderColor: '#CBD5E1' }} />
              <Bar
                dataKey="rainfallMm"
                name="Daily Rain (mm)"
                fill="#244D8F"
                radius={[2, 2, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="p90RainfallMm"
                name="P90 Ensemble Envelope (mm)"
                stroke="#EF8735"
                strokeWidth={1.8}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </MunicipalPanel>

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
                        threshold_mm: p.thresholdMm,
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

            <div className="p-2 rounded-sm bg-[#EEF3FA] border border-[#173C79]/25 text-[11px] text-[#173C79] leading-snug">
              30 m D8 runoff routing across the 200×200 DEM grid.
            </div>

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadSimulationReportCsv({
                    scenarioLabel: simScenario.label ?? simScenario.tag,
                    timestampPkt: simActiveResult.timestamp_pkt,
                    thresholdMm: simScenario.threshold_mm ?? 50,
                    baseline: simBaselineResult,
                    simulated: simActiveResult,
                    actions: preparednessActions,
                  })
                }
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-white/15 hover:bg-white/25 border border-white/25 text-white text-[10px] font-semibold cursor-pointer"
              >
                <Download className="w-3 h-3" />
                Export Report
              </button>
              <span className="text-[10px] font-mono text-white/85">
                Runtime: {simActiveResult.runtime_ms} ms
              </span>
            </div>
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
                &ge; {simScenario.threshold_mm ?? 50} mm runoff proxy
              </span>
            </div>
            {exposedFacilityList.length === 0 ? (
              <div className="p-2.5 rounded-sm bg-[#EDF7EE] border border-[#55A85F]/40 text-xs text-[#2F6F37]">
                No critical facilities intersect the {simScenario.threshold_mm ?? 50} mm screening risk mask under this scenario.
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
                Uncertainty &amp; Limitations:
              </strong>{' '}
              Sensitivity bounds (±12% runoff coefficient) estimate affected area between{' '}
              <span className="font-mono font-semibold">
                {simActiveResult.uncertainty.exposed_area_km2?.[0].toFixed(2)}–
                {simActiveResult.uncertainty.exposed_area_km2?.[1].toFixed(2)} km²
              </span>
              . 30 m D8 screening outputs only — verify against PMD/NDMA bulletins.
            </div>
          </div>
        </MunicipalPanel>
      </div>

      <HistoricalHindcastPanel />
    </div>
  );
}
