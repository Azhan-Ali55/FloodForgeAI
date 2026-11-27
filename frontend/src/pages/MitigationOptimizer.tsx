import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Coins,
  Loader2,
  Sliders,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { normalizeWeights } from '../engine/optimizer';
import { PILOT_CONFIG } from '../engine/pilotConfig';
import { MunicipalPanel, PanelCard } from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import type { InterventionType, OptimizationWeights } from '../types/floodforge';
import { cn } from '../utils/cn';
import { formatCoord, formatPKR } from '../utils/formatters';

const WEIGHT_FIELDS: Array<{ key: keyof OptimizationWeights; label: string }> = [
  { key: 'population', label: 'Population Protection' },
  { key: 'buildings', label: 'Building Protection' },
  { key: 'roads', label: 'Road Protection' },
  { key: 'facilities', label: 'Critical Facility Protection' },
  { key: 'area', label: 'Flooded-Area Reduction' },
];

export function MitigationOptimizer() {
  const {
    operationalMode,
    setOperationalMode,
    activeThresholdMm,
    optConfig,
    setOptConfig,
    setPitchBudgetPkr,
    optResult,
    isOptimizing,
    optProgressStage,
    runOptimization,
  } = useFloodForge();

  const [tableFilter, setTableFilter] = useState<'selected' | 'all'>('selected');

  const normalized = useMemo(
    () => normalizeWeights(optConfig.weights),
    [optConfig.weights]
  );

  const toggleInterventionType = (type: InterventionType) => {
    setOptConfig((prev) => {
      const exists = prev.enabledTypes.includes(type);
      const next = exists
        ? prev.enabledTypes.filter((t) => t !== type)
        : [...prev.enabledTypes, type];
      return { ...prev, enabledTypes: next };
    });
  };

  const updateWeight = (key: keyof OptimizationWeights, value: number) => {
    setOptConfig((prev) => ({
      ...prev,
      weights: { ...prev.weights, [key]: Math.max(0, Math.min(100, value)) },
    }));
  };

  const paretoChartData = useMemo(() => {
    if (!optResult) return [];
    return optResult.paretoFrontier.map((p) => ({
      costM: Number((p.costPkr / 1_000_000).toFixed(1)),
      budgetM: Number((p.budgetPkr / 1_000_000).toFixed(1)),
      reductionPct: p.exposureReductionPct,
      selectedCount: p.selectedCount,
      isCurrent: Boolean(p.isCurrentSelection),
      isKnee: Boolean(p.isKneePoint),
      label: p.label,
    }));
  }, [optResult]);

  const randomScatterData = useMemo(() => {
    if (!optResult) return [];
    return optResult.randomBaselines.map((r) => ({
      costM: Number((r.costPkr / 1_000_000).toFixed(1)),
      randomPct: r.exposureReductionPct,
    }));
  }, [optResult]);

  const tableRows = useMemo(() => {
    if (!optResult) return [];
    return tableFilter === 'selected'
      ? optResult.selectedPortfolio
      : optResult.allCandidates;
  }, [optResult, tableFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#173C79]">
            Flood Mitigation Investment Optimizer
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6A7E]">
            {PILOT_CONFIG.comparison_label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#26364A]">
          <div className="flex items-center rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] p-0.5 font-sans font-semibold text-[11px]">
            <button
              type="button"
              onClick={() => setOperationalMode('live_ops')}
              className={cn(
                'px-2.5 py-1 rounded-xs cursor-pointer',
                operationalMode === 'live_ops' ? 'bg-[#173C79] text-white' : 'text-[#5A6A7E]'
              )}
            >
              Live Ops (50mm)
            </button>
            <button
              type="button"
              onClick={() => setOperationalMode('demo_2001')}
              className={cn(
                'px-2.5 py-1 rounded-xs cursor-pointer',
                operationalMode === 'demo_2001' ? 'bg-[#D94343] text-white' : 'text-[#5A6A7E]'
              )}
            >
              2001 Demo (150mm)
            </button>
          </div>
          {optResult && (
            <span className="px-2.5 py-1 rounded-sm bg-[#EDF7EE] border border-[#55A85F]/50 text-[#2F6F37] font-sans font-semibold text-[11px]">
              {activeThresholdMm} mm {operationalMode === 'demo_2001' ? 'Severe Cutoff' : 'Flood Cutoff'}
            </span>
          )}
        </div>
      </div>

      {optResult && (
        <div
          className={cn(
            'px-4 py-2.5 rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold',
            optResult.equityStatus === 'RISK_TRANSFER_CONCERN' || optResult.optimizedResult.risk_transfer?.flagged
              ? 'bg-[#FBEBEB] border-[#D94343] text-[#A12323]'
              : 'bg-[#EDF7EE] border-[#55A85F] text-[#2F6F37]'
          )}
        >
          <span>
            {optResult.baselineResult.metrics.exposed_area_km2 <= 0 &&
            optResult.baselineResult.metrics.buildings_exposed === 0
              ? '✅ No Flood Risk Modeled: Mitigation solutions are not required under current dry conditions.'
              : optResult.equityStatus === 'RISK_TRANSFER_CONCERN' ||
                  optResult.optimizedResult.risk_transfer?.flagged
                ? '⚠️ Risk Transfer Warning: Downstream Rawalpindi exposure exceeded tolerance.'
                : PILOT_CONFIG.equity_pass_banner}
          </span>
          <span className="font-mono text-[11px]">
            Buildings Saved: {Math.max(0, optResult.baselineResult.metrics.buildings_exposed - optResult.optimizedResult.metrics.buildings_exposed)} · Area Reduction: -
            {optResult.baselineResult.metrics.exposed_area_km2 > 0
              ? (((optResult.baselineResult.metrics.exposed_area_km2 - optResult.optimizedResult.metrics.exposed_area_km2) / optResult.baselineResult.metrics.exposed_area_km2) * 100).toFixed(1)
              : '0.0'}
            %
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <MunicipalPanel
          title="Budget & Priority Configuration"
          icon={<Sliders className="w-4 h-4" />}
          className="xl:col-span-4"
          bodyClassName="p-4 space-y-5"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[#5A6A7E] font-medium">Municipal Budget (PKR)</label>
              <span className="font-mono font-bold text-[#173C79]">
                {formatPKR(optConfig.budgetPkr)}
              </span>
            </div>
            <input
              type="range"
              aria-label="Optimizer budget slider"
              min={50_000_000}
              max={300_000_000}
              step={5_000_000}
              value={Math.min(300_000_000, Math.max(50_000_000, optConfig.budgetPkr))}
              onChange={(e) => setPitchBudgetPkr(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex items-center justify-between text-[10px] font-mono text-[#5A6A7E]">
              <span>PKR 50M</span>
              <span>PKR 150M</span>
              <span>PKR 200M</span>
              <span>PKR 300M</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={50_000_000}
                max={300_000_000}
                step={5_000_000}
                value={optConfig.budgetPkr}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val) && val >= 0) {
                    setOptConfig((prev) => ({ ...prev, budgetPkr: val }));
                  }
                }}
                onBlur={(e) => {
                  setPitchBudgetPkr(Number(e.target.value) || 50_000_000);
                }}
                className="flex-1 px-2.5 py-1.5 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] font-mono text-xs text-[#26364A]"
              />
              <span className="text-[11px] font-mono text-[#5A6A7E]">PKR</span>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E6EAEF]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A7E]">
              Eligible Intervention Types
            </div>
            <div className="space-y-2">
              {Object.values(PILOT_CONFIG.interventions).map((meta) => {
                const active = optConfig.enabledTypes.includes(meta.type);
                return (
                  <label
                    key={meta.type}
                    className={cn(
                      'flex items-start gap-2.5 p-2.5 rounded-sm border cursor-pointer transition-colors',
                      active
                        ? 'bg-[#EEF3FA] border-[#173C79]/50'
                        : 'bg-[#F5F6F7] border-[#D6DCE4] opacity-70'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleInterventionType(meta.type)}
                      className="mt-0.5 accent-[#173C79]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#173C79]">
                          {meta.pluralLabel}
                        </span>
                        <span className="text-[10px] font-mono text-[#5A6A7E]">
                          {formatPKR(meta.unitCostPkr)}/site
                        </span>
                      </div>
                      <p className="text-[10px] text-[#5A6A7E] mt-0.5 leading-snug">
                        {meta.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-[#E6EAEF]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A7E]">
                Optimization Priority Weights
              </span>
              <span className="text-[10px] font-mono text-[#55A85F] font-semibold">
                Normalized (100%)
              </span>
            </div>

            {WEIGHT_FIELDS.map((wf) => (
              <div key={wf.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#26364A]">{wf.label}</span>
                  <span className="font-mono font-semibold text-[#173C79]">
                    {(normalized[wf.key] * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={optConfig.weights[wf.key]}
                  onChange={(e) => updateWeight(wf.key, Number(e.target.value))}
                  className="w-full"
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => runOptimization()}
            disabled={isOptimizing || optConfig.enabledTypes.length === 0}
            className="w-full py-2.5 px-4 rounded-sm bg-[#55A85F] hover:bg-[#469350] disabled:opacity-60 text-white font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {isOptimizing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Optimizing Portfolio...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Run Budget Optimization
              </>
            )}
          </button>

          {isOptimizing && optProgressStage && (
            <div className="text-[11px] font-mono text-[#173C79] text-center">
              {optProgressStage}
            </div>
          )}
        </MunicipalPanel>

        <div className="xl:col-span-8 space-y-4">
          {optResult && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <PanelCard padding="p-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                    Total Budget
                  </div>
                  <div className="text-lg font-bold font-mono text-[#26364A] mt-1">
                    {formatPKR(optResult.totalBudgetPkr)}
                  </div>
                  <div className="text-[10px] text-[#5A6A7E] mt-0.5">Allocated ceiling</div>
                </PanelCard>

                <PanelCard padding="p-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                    Total Intervention Cost
                  </div>
                  <div className="text-lg font-bold font-mono text-[#173C79] mt-1">
                    {formatPKR(optResult.totalCostPkr)}
                  </div>
                  <div className="text-[10px] text-[#55A85F] mt-0.5 font-mono font-semibold">
                    {optResult.utilizationPct}% utilized
                  </div>
                </PanelCard>

                <PanelCard padding="p-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                    Remaining Budget
                  </div>
                  <div className="text-lg font-bold font-mono text-[#26364A] mt-1">
                    {formatPKR(optResult.remainingBudgetPkr)}
                  </div>
                  <div className="text-[10px] text-[#5A6A7E] mt-0.5">Unspent reserve</div>
                </PanelCard>

                <PanelCard padding="p-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                    Selected Interventions
                  </div>
                  <div className="text-lg font-bold font-mono text-[#26364A] mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#55A85F]" />
                    {optResult.selectedPortfolio.length} Sites
                  </div>
                  <div className="text-[10px] text-[#5A6A7E] mt-0.5">
                    {optResult.allCandidates.length === 0
                      ? 'No flood risk — no solution needed'
                      : `Out of ${optResult.allCandidates.length} evaluated`}
                  </div>
                </PanelCard>

                <PanelCard padding="p-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                    Est. Exposure Reduction
                  </div>
                  <div className="text-lg font-bold font-mono text-[#55A85F] mt-1 flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    -{optResult.weightedReductionPct}%
                  </div>
                  <div className="text-[10px] text-[#5A6A7E] mt-0.5">Weighted objective gain</div>
                </PanelCard>

                <PanelCard padding="p-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                    Lift vs. Random Portfolios
                  </div>
                  <div className="text-lg font-bold font-mono text-[#EF8735] mt-1 flex items-center gap-1">
                    <Zap className="w-4 h-4" />
                    +{optResult.improvementOverRandomPct}%
                  </div>
                  <div className="text-[10px] text-[#5A6A7E] mt-0.5">
                    Random avg: -{optResult.avgRandomReductionPct}%
                  </div>
                </PanelCard>
              </div>

              <MunicipalPanel
                title="Multi-Budget Pareto Frontier vs. Random Portfolios"
                rightSlot={
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-white/90">● Pareto</span>
                    <span className="text-[#9AE6B4]">● Selected</span>
                    <span className="text-[#FBD38D]">● Random</span>
                  </div>
                }
              >
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart margin={{ top: 10, right: 20, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" />
                      <XAxis
                        type="number"
                        dataKey="costM"
                        name="Expenditure"
                        unit="M"
                        domain={['auto', 'auto']}
                        tick={{ fill: '#5A6A7E', fontSize: 11 }}
                        label={{
                          value: 'Portfolio Expenditure (PKR Millions)',
                          position: 'insideBottom',
                          offset: -4,
                          fill: '#5A6A7E',
                          fontSize: 11,
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="reductionPct"
                        name="Reduction"
                        unit="%"
                        tick={{ fill: '#5A6A7E', fontSize: 11 }}
                        label={{
                          value: 'Exposure Reduction (%)',
                          angle: -90,
                          position: 'insideLeft',
                          fill: '#5A6A7E',
                          fontSize: 11,
                        }}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderColor: '#CBD5E1' }}
                        formatter={(value, name) => {
                          const label = String(name ?? '');
                          const num = Number(value ?? 0);
                          return [
                            label.includes('Expenditure') ? `PKR ${num}M` : `${num}%`,
                            label,
                          ];
                        }}
                      />
                      <Line
                        data={paretoChartData}
                        type="monotone"
                        dataKey="reductionPct"
                        name="Pareto Exposure Reduction"
                        stroke="#173C79"
                        strokeWidth={2.5}
                        dot={(props: {
                          cx?: number;
                          cy?: number;
                          payload?: { isCurrent?: boolean; isKnee?: boolean };
                        }) => {
                          const { cx = 0, cy = 0, payload } = props;
                          if (payload?.isCurrent) {
                            return (
                              <circle
                                key={`cur-${cx}-${cy}`}
                                cx={cx}
                                cy={cy}
                                r={7}
                                fill="#55A85F"
                                stroke="#173C79"
                                strokeWidth={2.5}
                              />
                            );
                          }
                          if (payload?.isKnee) {
                            return (
                              <circle
                                key={`knee-${cx}-${cy}`}
                                cx={cx}
                                cy={cy}
                                r={5.5}
                                fill="#EF8735"
                                stroke="#FFFFFF"
                                strokeWidth={1.5}
                              />
                            );
                          }
                          return (
                            <circle
                              key={`pt-${cx}-${cy}`}
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill="#244D8F"
                            />
                          );
                        }}
                      />
                      <Scatter
                        data={randomScatterData}
                        dataKey="randomPct"
                        name="Random Portfolio Baseline"
                        fill="#EF8735"
                        fillOpacity={0.65}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </MunicipalPanel>
            </>
          )}
        </div>
      </div>

      {optResult && (
        <MunicipalPanel
          title="Intervention Portfolio Allocation Table"
          icon={<Coins className="w-4 h-4" />}
          rightSlot={
            <div className="flex items-center rounded-sm bg-[#244D8F] p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setTableFilter('selected')}
                className={cn(
                  'px-2.5 py-0.5 rounded-sm font-semibold cursor-pointer',
                  tableFilter === 'selected' ? 'bg-white text-[#173C79]' : 'text-white/85'
                )}
              >
                Selected ({optResult.selectedPortfolio.length})
              </button>
              <button
                type="button"
                onClick={() => setTableFilter('all')}
                className={cn(
                  'px-2.5 py-0.5 rounded-sm font-semibold cursor-pointer',
                  tableFilter === 'all' ? 'bg-white text-[#173C79]' : 'text-white/85'
                )}
              >
                All ({optResult.allCandidates.length})
              </button>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[740px]">
              <thead>
                <tr className="border-b border-[#D6DCE4] bg-[#F5F6F7] text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                  <th className="py-2 px-2.5">Intervention ID</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Grid Coords</th>
                  <th className="py-2 px-3">Zone</th>
                  <th className="py-2 px-3 text-right">Cost (PKR)</th>
                  <th className="py-2 px-3 text-right">Expected Impact</th>
                  <th className="py-2 px-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6EAEF] text-xs">
                {tableRows.map((iv) => {
                  const meta = PILOT_CONFIG.interventions[iv.type];
                  return (
                    <tr key={iv.id} className="hover:bg-[#F5F6F7]/70">
                      <td className="py-2.5 px-2.5 font-mono font-semibold text-[#173C79]">
                        {iv.id}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#26364A]">
                        {meta.label}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6A7E]">
                        [{iv.row}, {iv.col}] · {formatCoord(iv.lat, iv.lon)}
                      </td>
                      <td className="py-2.5 px-3 text-[#26364A]">{iv.zoneName}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#26364A]">
                        {formatPKR(iv.cost_pkr)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#55A85F]">
                        -{iv.expected_impact_pct.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right">
                        {iv.selected ? (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-mono bg-[#EDF7EE] text-[#2F6F37] border border-[#55A85F]/50">
                            SELECTED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-mono bg-[#F5F6F7] text-[#5A6A7E] border border-[#D6DCE4]">
                            CANDIDATE
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </MunicipalPanel>
      )}
    </div>
  );
}
