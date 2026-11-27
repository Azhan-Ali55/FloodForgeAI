import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Coins, Loader2, Play, Scale, Sparkles } from 'lucide-react';
import type { OptimizationConfig, OptimizationResult } from '../../types/floodforge';
import { cn } from '../../utils/cn';
import { formatNumber, formatPKR } from '../../utils/formatters';
import { BudgetControlCard } from '../ui/BudgetControlCard';
import { MunicipalPanel } from '../ui/Primitives';

export type MapComparisonMode = 'mitigated' | 'baseline' | 'delta' | 'compare';

interface MitigationComparisonPanelProps {
  optConfig: OptimizationConfig;
  onBudgetChange: (budgetPkr: number) => void;
  optResult: OptimizationResult | null;
  isOptimizing: boolean;
  isAutoSyncingOpt: boolean;
  isOptStale: boolean;
  optError: string | null;
  onRunOptimization: () => Promise<void>;
  mapViewMode: MapComparisonMode;
  onMapViewModeChange: (m: MapComparisonMode) => void;
  compareSplitPct: number;
  onCompareSplitChange: (pct: number) => void;
}

export const MitigationComparisonPanel = React.memo(function MitigationComparisonPanel({
  optConfig,
  onBudgetChange,
  optResult,
  isOptimizing,
  isAutoSyncingOpt,
  isOptStale,
  optError,
  onRunOptimization,
  mapViewMode,
  onMapViewModeChange,
  compareSplitPct,
  onCompareSplitChange,
}: MitigationComparisonPanelProps) {
  const baseMetrics = optResult?.baselineResult.metrics;
  const optMetrics = optResult?.optimizedResult.metrics;

  const hasFloodRisk = Boolean(
    baseMetrics && (baseMetrics.exposed_area_km2 > 0 || baseMetrics.buildings_exposed > 0)
  );

  // Dynamically derive knee/efficiency metrics from actual optimization output (never hardcoded)
  const kneePoint =
    optResult?.paretoFrontier.find((p) => p.isKneePoint) ??
    optResult?.paretoFrontier[optResult.paretoFrontier.length - 1] ??
    null;

  const totalCostM = optResult ? optResult.totalCostPkr / 1_000_000 : 0;
  const weightedReduction = optResult?.weightedReductionPct ?? 0;
  const costPerPctM =
    weightedReduction > 0 && totalCostM > 0 ? totalCostM / weightedReduction : null;

  const engineLabel =
    optResult?.engineSource === 'python_api'
      ? 'Python Backend Engine'
      : 'In-Browser D8 Engine';

  const compareRows =
    baseMetrics && optMetrics
      ? [
          {
            label: 'Flooded Area',
            before: `${baseMetrics.exposed_area_km2.toFixed(2)} km²`,
            after: `${optMetrics.exposed_area_km2.toFixed(2)} km²`,
            delta:
              baseMetrics.exposed_area_km2 > 0
                ? `-${(((baseMetrics.exposed_area_km2 - optMetrics.exposed_area_km2) / baseMetrics.exposed_area_km2) * 100).toFixed(1)}%`
                : '0.0%',
          },
          {
            label: 'Exposed Pop.',
            before: formatNumber(baseMetrics.population_exposed),
            after: formatNumber(optMetrics.population_exposed),
            delta:
              baseMetrics.population_exposed > 0
                ? `-${(((baseMetrics.population_exposed - optMetrics.population_exposed) / baseMetrics.population_exposed) * 100).toFixed(1)}%`
                : '0.0%',
          },
          {
            label: 'Buildings',
            before: formatNumber(baseMetrics.buildings_exposed),
            after: formatNumber(optMetrics.buildings_exposed),
            delta:
              baseMetrics.buildings_exposed > 0
                ? `-${(((baseMetrics.buildings_exposed - optMetrics.buildings_exposed) / baseMetrics.buildings_exposed) * 100).toFixed(1)}%`
                : '0.0%',
          },
          {
            label: 'Facilities',
            before: String(baseMetrics.total_facilities_exposed),
            after: String(optMetrics.total_facilities_exposed),
            delta:
              baseMetrics.total_facilities_exposed > 0
                ? `-${(((baseMetrics.total_facilities_exposed - optMetrics.total_facilities_exposed) / baseMetrics.total_facilities_exposed) * 100).toFixed(1)}%`
                : '0.0%',
          },
        ]
      : [];

  return (
    <MunicipalPanel
      title="Mitigation Impact"
      subtitle={`Provenance: ${engineLabel}${isAutoSyncingOpt || isOptimizing ? ' (Updating...)' : ''}`}
      icon={<Coins className="w-4 h-4" />}
      rightSlot={
        <div className="flex items-center gap-1.5">
          <Link
            to="/mitigation"
            className="text-xs font-medium text-[#1D4ED8] hover:underline"
          >
            Full Optimizer
          </Link>
        </div>
      }
      bodyClassName="p-3.5 space-y-3"
    >
      {/* 4-Step End-to-End Decision Workflow */}
      <div className="grid grid-cols-4 gap-1 text-[11px] text-center">
        {[
          { step: '1. Forecast', done: true },
          { step: '2. Risk', done: Boolean(baseMetrics) },
          { step: '3. Portfolio', done: Boolean(optResult && !isOptStale) },
          { step: '4. Compare', done: Boolean(optResult && !isOptStale) },
        ].map((item) => (
          <div
            key={item.step}
            className={cn(
              'py-1 px-1 rounded border font-medium truncate',
              item.done
                ? 'bg-[#F0FDFA] border-[#99F6E4] text-[#0F766E]'
                : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]'
            )}
          >
            {item.step}
          </div>
        ))}
      </div>

      {/* Synchronized Before/After Map Mode Controls */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-[#334155]">
          <span>Map Comparison View</span>
          {mapViewMode === 'compare' && (
            <span className="font-mono text-[11px] text-[#0F766E]">
              Split {compareSplitPct}% / {100 - compareSplitPct}%
            </span>
          )}
        </div>
        <div
          role="group"
          aria-label="Mitigation comparison view selector"
          className="grid grid-cols-4 gap-1 rounded-md bg-[#F1F5F9] p-0.5 border border-[#E2E8F0] text-xs"
        >
          {(
            [
              ['baseline', 'Before'],
              ['mitigated', 'After'],
              ['compare', 'Split'],
              ['delta', 'Delta'],
            ] as Array<[MapComparisonMode, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mapViewMode === id}
              onClick={() => onMapViewModeChange(id)}
              className={cn(
                'py-1 rounded font-medium transition-colors cursor-pointer',
                mapViewMode === id
                  ? 'bg-[#0F172A] text-white'
                  : 'text-[#475569] hover:text-[#0F172A]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mapViewMode === 'compare' && (
          <input
            type="range"
            aria-label="Comparison split curtain position"
            min={5}
            max={95}
            step={1}
            value={compareSplitPct}
            onChange={(e) => onCompareSplitChange(Number(e.target.value))}
            className="w-full accent-[#0F766E] cursor-pointer"
          />
        )}
      </div>

      {/* Stale / Error Guard */}
      {(optError || isOptStale) && (
        <div
          role="status"
          className="px-2.5 py-2 rounded-md border border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412] text-xs flex items-center gap-2"
        >
          <Loader2 className={cn('w-3.5 h-3.5 flex-shrink-0', (isAutoSyncingOpt || isOptimizing) && 'animate-spin')} />
          <span>{optError || 'Recomputing portfolio metrics for current inputs...'}</span>
        </div>
      )}

      {/* Before vs After Quantitative Impact Comparison */}
      {!isOptStale && !optError && optResult && (
        <div className="space-y-2.5">
          <div className="rounded-md border border-[#E2E8F0] overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B]">
                  <th className="py-1.5 px-2.5">Metric</th>
                  <th className="py-1.5 px-2 text-right">Before</th>
                  <th className="py-1.5 px-2 text-right">After</th>
                  <th className="py-1.5 px-2.5 text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {compareRows.map((row) => (
                  <tr key={row.label}>
                    <td className="py-1.5 px-2.5 font-medium text-[#334155]">{row.label}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-[#64748B]">{row.before}</td>
                    <td className="py-1.5 px-2 text-right font-mono font-semibold text-[#0F172A]">{row.after}</td>
                    <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-[#0F766E]">
                      {row.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Dynamic Optimization Metrics (Zero hardcoded Pareto label) */}
          <div className="p-2.5 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#475569] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
                Deployed Portfolio ({optResult.selectedPortfolio.length} sites)
              </span>
              <span className="font-mono font-semibold text-[#0F172A]">
                {formatPKR(optResult.totalCostPkr)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#64748B]">
              <span>Weighted Exposure Reduction</span>
              <span className="font-mono font-semibold text-[#0F766E]">
                {optResult.weightedReductionPct > 0
                  ? `-${optResult.weightedReductionPct.toFixed(1)}%`
                  : '0.0%'}
              </span>
            </div>
            {costPerPctM !== null && (
              <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                <span>Marginal Efficiency</span>
                <span className="font-mono text-[#0F172A]">
                  {costPerPctM.toFixed(1)}M PKR / % reduction
                </span>
              </div>
            )}
            {kneePoint && (
              <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                <span>Pareto Knee From Model</span>
                <span className="font-mono text-[#1D4ED8]">
                  {(kneePoint.budgetPkr / 1_000_000).toFixed(0)}M PKR (
                  {kneePoint.exposureReductionPct > 0
                    ? `-${kneePoint.exposureReductionPct.toFixed(1)}%`
                    : '0.0%'}
                  )
                </span>
              </div>
            )}
          </div>

          {/* Equity Risk Transfer Indicator */}
          <div
            className={cn(
              'px-2.5 py-2 rounded-md border text-[11px] flex items-center justify-between gap-2',
              hasFloodRisk && optResult.equityStatus === 'RISK_TRANSFER_CONCERN'
                ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
            )}
          >
            <span className="flex items-center gap-1.5 font-medium">
              {hasFloodRisk && optResult.equityStatus === 'RISK_TRANSFER_CONCERN' ? (
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              {hasFloodRisk && optResult.equityStatus === 'RISK_TRANSFER_CONCERN'
                ? 'Downstream risk increase flagged'
                : 'Downstream equity check passed'}
            </span>
            <Link to="/equity" className="inline-flex items-center gap-1 underline font-medium">
              <Scale className="w-3 h-3" />
              Audit
            </Link>
          </div>
        </div>
      )}

      {/* Compact Budget Control + Explicit Recompute Action */}
      <div className="pt-2 border-t border-[#E2E8F0] space-y-2.5">
        <BudgetControlCard
          ariaLabel="Mitigation investment budget"
          inputId="dashboard-budget-slider"
          budgetPkr={optConfig.budgetPkr}
          onBudgetChange={onBudgetChange}
        />

        <button
          type="button"
          onClick={() => void onRunOptimization()}
          disabled={isOptimizing}
          className="w-full py-2 px-3 rounded-md bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
        >
          {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {isOptimizing ? 'Optimizing Portfolio...' : 'Recompute Mitigation Portfolio'}
        </button>
      </div>
    </MunicipalPanel>
  );
});
