import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Coins,
  Loader2,
  Play,
  Scale,
  Sparkles,
} from 'lucide-react';
import type { OptimizationConfig, OptimizationResult } from '../../types/floodforge';
import { cn } from '../../utils/cn';
import { formatNumber, formatPKR } from '../../utils/formatters';
import { BudgetControlCard } from '../ui/BudgetControlCard';
import { MunicipalPanel } from '../ui/Primitives';
import { Tooltip } from '../ui/Tooltip';

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
}: MitigationComparisonPanelProps) {
  const [showDetails, setShowDetails] = useState(false);

  const baseMetrics = optResult?.baselineResult.metrics;
  const optMetrics = optResult?.optimizedResult.metrics;

  const hasFloodRisk = Boolean(
    baseMetrics && (baseMetrics.exposed_area_km2 > 0 || baseMetrics.buildings_exposed > 0)
  );

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
      subtitle={`Provenance: ${engineLabel}${isAutoSyncingOpt || isOptimizing ? ' · Updating…' : ''}`}
      icon={<Coins className="w-4 h-4" />}
      rightSlot={
        <Link
          to="/mitigation"
          className="text-xs font-medium text-white/95 hover:text-white underline"
        >
          Full Optimizer
        </Link>
      }
      bodyClassName="p-3.5 space-y-3"
    >
      {/* Stale / Error / Loading Guard */}
      {(optError || isOptStale) && (
        <div
          role="status"
          className="px-2.5 py-2 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412] text-xs flex items-center gap-2"
        >
          <Loader2 className={cn('w-3.5 h-3.5 flex-shrink-0', (isAutoSyncingOpt || isOptimizing) && 'animate-spin')} />
          <span>{optError || 'Recomputing portfolio metrics for current inputs…'}</span>
        </div>
      )}

      {/* Quick Budget Control */}
      <Tooltip content="Adjust the capital budget cap to evaluate portfolio exposure reduction.">
        <div className="w-full">
          <BudgetControlCard
            ariaLabel="Mitigation investment budget"
            inputId="dashboard-budget-slider"
            budgetPkr={optConfig.budgetPkr}
            onBudgetChange={onBudgetChange}
          />
        </div>
      </Tooltip>

      {/* Primary Before vs After Summary */}
      {!isOptStale && !optError && optResult && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E2E8F0] bg-[#F1F6FB] text-xs">
            <span className="text-[#475569] flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
              {optResult.selectedPortfolio.length} sites · {formatPKR(optResult.totalCostPkr)}
            </span>
            <span className="font-mono font-bold text-[#0F766E]">
              {optResult.weightedReductionPct > 0
                ? `-${optResult.weightedReductionPct.toFixed(1)}%`
                : '0.0%'}{' '}
              <span className="font-sans font-normal text-[#64748B]">est.</span>
            </span>
          </div>

          <div className="rounded-lg border border-[#E2E8F0] overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#F1F6FB] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B]">
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
                    <td className="py-1.5 px-2 text-right font-mono font-semibold text-[#10223D]">{row.after}</td>
                    <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-[#0F766E]">
                      {row.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Equity Risk Transfer Indicator */}
          <Tooltip content="Identify potential downstream risk transfer caused by mitigation.">
            <div
              className={cn(
                'w-full px-2.5 py-2 rounded-lg border text-[11px] flex items-center justify-between gap-2',
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
              <Link to="/reports?tab=equity" className="inline-flex items-center gap-1 underline font-medium">
                <Scale className="w-3 h-3" />
                Audit
              </Link>
            </div>
          </Tooltip>

          {/* Progressive Disclosure: Secondary Efficiency & Pareto Details */}
          <div>
            <button
              type="button"
              aria-expanded={showDetails}
              onClick={() => setShowDetails((v) => !v)}
              className="w-full flex items-center justify-between text-[11px] font-medium text-[#64748B] hover:text-[#10223D] py-1 cursor-pointer"
            >
              <span>Pareto &amp; efficiency details</span>
              <ChevronDown
                className={cn('w-3.5 h-3.5 transition-transform', showDetails && 'rotate-180')}
              />
            </button>
            {showDetails && (
              <div className="mt-1 p-2.5 rounded-lg border border-[#E2E8F0] bg-[#F1F6FB] space-y-1 text-[11px] text-[#64748B]">
                {costPerPctM !== null && (
                  <div className="flex items-center justify-between">
                    <span>Marginal Efficiency</span>
                    <span className="font-mono text-[#10223D]">
                      {costPerPctM.toFixed(1)}M PKR / % reduction
                    </span>
                  </div>
                )}
                {kneePoint && (
                  <div className="flex items-center justify-between">
                    <span>Pareto Knee From Model</span>
                    <span className="font-mono text-[#12345B]">
                      {(kneePoint.budgetPkr / 1_000_000).toFixed(0)}M PKR (
                      {kneePoint.exposureReductionPct > 0
                        ? `-${kneePoint.exposureReductionPct.toFixed(1)}%`
                        : '0.0%'}
                      )
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span>Remaining Budget</span>
                  <span className="font-mono text-[#10223D]">
                    {formatPKR(optResult.remainingBudgetPkr)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recompute Action */}
      <button
        type="button"
        onClick={() => void onRunOptimization()}
        disabled={isOptimizing}
        className="w-full py-2 px-3 rounded-lg bg-[#12345B] hover:bg-[#0F2A4A] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
      >
        {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        {isOptimizing ? 'Optimizing Portfolio…' : 'Recompute Mitigation Portfolio'}
      </button>
    </MunicipalPanel>
  );
});
