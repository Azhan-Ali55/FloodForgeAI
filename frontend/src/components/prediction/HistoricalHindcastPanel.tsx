import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  History,
  Loader2,
  Map as MapIcon,
  ShieldCheck,
  Users,
  Waves,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MunicipalPanel, StatCard } from '../ui/Primitives';
import { useFloodForge } from '../../context/FloodForgeContext';
import { PILOT_CONFIG } from '../../engine/pilotConfig';
import { executeOptimization } from '../../services/optimizerService';
import type {
  AntecedentWetnessLevel,
  OptimizationResult,
  Scenario,
} from '../../types/floodforge';
import { cn } from '../../utils/cn';
import { formatNumber, formatPKR } from '../../utils/formatters';

interface HistoricalEventSpec {
  id: '2001_cloudburst' | '2026_monsoon' | '2021_monsoon';
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
      'Historic 620 mm / 10h Nullah Lai cloudburst comparing unmitigated flooding against optimal flood prevention.',
    rainfallMmHr: 62,
    durationHr: 10,
    wetness: 'saturated',
  },
  {
    id: '2026_monsoon',
    title: 'Sept 2026 Nullah Lai Monsoon Event',
    dateLabel: '201 mm over 24 hr · Wet Basin',
    summary:
      'Sustained 24-hour monsoon benchmark (~8.4 mm/hr) testing prolonged urban drainage accumulation and equity.',
    rainfallMmHr: 8.4,
    durationHr: 24,
    wetness: 'wet',
  },
  {
    id: '2021_monsoon',
    title: 'July 28, 2021 Nullah Lai Monsoon Surge',
    dateLabel: '330 mm over 6 hr · Wet Basin',
    summary:
      'Urban flash-flooding surge impacting Katarian, Gawalmandi, and I-10/E-11 corridors under budget constraints.',
    rainfallMmHr: 55,
    durationHr: 6,
    wetness: 'wet',
  },
];

const HINDCAST_BUDGETS = [50_000_000, 150_000_000, 200_000_000, 300_000_000];
const MAX_HINDCAST_CACHE_ENTRIES = 12;
const hindcastCache = new Map<string, OptimizationResult>();

function setBoundedHindcastCache(key: string, val: OptimizationResult) {
  if (hindcastCache.has(key)) hindcastCache.delete(key);
  hindcastCache.set(key, val);
  while (hindcastCache.size > MAX_HINDCAST_CACHE_ENTRIES) {
    const oldest = hindcastCache.keys().next().value;
    if (oldest !== undefined) hindcastCache.delete(oldest);
    else break;
  }
}

/**
 * Counterfactual replay of past Nullah Lai flood events comparing unmitigated exposure vs. optimized interventions.
 */
export function HistoricalHindcastPanel() {
  const navigate = useNavigate();
  const {
    twin,
    setSimScenario,
    runCloudburstSimulation,
    optConfig,
    setOptConfig,
    runOptimization,
    engineMode,
    apiUrl,
  } = useFloodForge();

  const [hindcastEventId, setHindcastEventId] =
    useState<HistoricalEventSpec['id']>('2001_cloudburst');
  const [hindcastBudget, setHindcastBudget] = useState<number>(200_000_000);
  const [hindcastResult, setHindcastResult] = useState<OptimizationResult | null>(null);
  const [isRunningHindcast, setIsRunningHindcast] = useState(false);

  const activeHistoricalEvent = useMemo(
    () => HISTORICAL_EVENTS.find((e) => e.id === hindcastEventId) ?? HISTORICAL_EVENTS[0],
    [hindcastEventId]
  );

  useEffect(() => {
    const thresholdMm = activeHistoricalEvent.id === '2001_cloudburst' ? 150 : 50;
    const w = optConfig.weights;
    const weightsKey = `${w.population},${w.buildings},${w.roads},${w.facilities},${w.area}`;
    const urlKey = engineMode === 'api' ? apiUrl.trim() : '';
    const cacheKey = `${twin.studyAreaId}:${twin.rows}:${twin.seed}:${engineMode}:${urlKey}:${hindcastEventId}:${hindcastBudget}:${thresholdMm}:${weightsKey}`;
    const cached = hindcastCache.get(cacheKey);
    if (cached) {
      hindcastCache.delete(cacheKey);
      hindcastCache.set(cacheKey, cached);
      setHindcastResult(cached);
      setIsRunningHindcast(false);
      return;
    }
    let active = true;
    const abortCtrl = new AbortController();
    setIsRunningHindcast(true);
    const timer = setTimeout(() => {
      const scenario: Scenario = {
        rainfall_mm_per_hr: activeHistoricalEvent.rainfallMmHr,
        duration_hr: activeHistoricalEvent.durationHr,
        budget_pkr: hindcastBudget,
        threshold_mm: thresholdMm,
        antecedent_wetness: activeHistoricalEvent.wetness,
        uncertainty_factor: 1.0,
        tag: 'HYPOTHETICAL_STRESS_TEST',
        label: activeHistoricalEvent.title,
      };
      executeOptimization(
        engineMode,
        apiUrl,
        twin,
        scenario,
        {
          weights: optConfig.weights,
          budgetPkr: hindcastBudget,
          enabledTypes: ['retention_pond', 'permeable_surface', 'drainage_upgrade'],
        },
        false,
        abortCtrl.signal
      )
        .then(({ result }) => {
          if (!active) return;
          setBoundedHindcastCache(cacheKey, result);
          setHindcastResult(result);
          setIsRunningHindcast(false);
        })
        .catch(() => {
          if (active) setIsRunningHindcast(false);
        });
    }, 60);
    return () => {
      active = false;
      abortCtrl.abort();
      clearTimeout(timer);
    };
  }, [twin, hindcastEventId, hindcastBudget, activeHistoricalEvent, optConfig.weights, engineMode, apiUrl]);

  const handleLoadHindcastToMap = async () => {
    const thresholdMm = activeHistoricalEvent.id === '2001_cloudburst' ? 150 : 50;
    const scenario: Scenario = {
      rainfall_mm_per_hr: activeHistoricalEvent.rainfallMmHr,
      duration_hr: activeHistoricalEvent.durationHr,
      budget_pkr: hindcastBudget,
      threshold_mm: thresholdMm,
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

  return (
    <MunicipalPanel
      title="Past Flood Hindcast & Prevention Impact"
      icon={<History className="w-4 h-4" />}
      rightSlot={
        <span className="text-xs font-mono text-[#64748B]">
          Historical Counterfactual Replay
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
          <span className="text-[11px] font-semibold text-[#5A6A7E]">Prevention Budget:</span>
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
          const savedFac = Math.max(0, base.total_facilities_exposed - opt.total_facilities_exposed);
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
              metric: 'Flooded Area (km²)',
              withoutPrevention: Number(base.exposed_area_km2.toFixed(2)),
              withPrevention: Number(opt.exposed_area_km2.toFixed(2)),
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  tone="success"
                  label="Buildings Protected"
                  icon={<Building2 className="w-4 h-4" />}
                  value={`${formatNumber(savedBuildings)} saved`}
                  subtext={`-${pctBldg}% (${formatNumber(base.buildings_exposed)} → ${formatNumber(opt.buildings_exposed)})`}
                />

                <StatCard
                  tone="success"
                  label="Residents Protected"
                  icon={<Users className="w-4 h-4" />}
                  value={`${formatNumber(savedPop)} people`}
                  subtext={`-${pctPop}% (${formatNumber(base.population_exposed)} → ${formatNumber(opt.population_exposed)})`}
                />

                <StatCard
                  tone="primary"
                  label="Flooded Area Reduced"
                  icon={<Waves className="w-4 h-4" />}
                  value={`-${savedArea.toFixed(2)} km²`}
                  subtext={`-${pctArea}% (${base.exposed_area_km2.toFixed(2)} → ${opt.exposed_area_km2.toFixed(2)} km²)`}
                />

                <StatCard
                  tone="neutral"
                  label="Downstream Equity Audit"
                  icon={<ShieldCheck className="w-4 h-4 text-[#55A85F]" />}
                  value={
                    <span className="text-sm font-bold text-[#2F6F37] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#55A85F]" />
                      {hindcastResult.equityStatus.replace(/_/g, ' ')}
                    </span>
                  }
                  subtext={`${hindcastResult.selectedPortfolio.length} sites (${formatPKR(hindcastResult.totalCostPkr)}) · ${savedFac} facilities shielded`}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-6 p-3 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-xs font-bold text-[#173C79] mb-2">
                    Without Prevention vs. With AI Prevention ({activeHistoricalEvent.dateLabel})
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
                      Prevention Sites ({hindcastResult.selectedPortfolio.length} Selected)
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
                    <strong>Note:</strong> Counterfactual replay across the 30 m D8 basin grid ({activeHistoricalEvent.dateLabel}).
                  </p>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </MunicipalPanel>
  );
}
