import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Coins,
  Cpu,
  Database,
  Scale,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import {
  EquityStatusBanner,
  MunicipalPanel,
  PageHeader,
  PanelCard,
  StatCard,
} from '../components/ui/Primitives';
import { ReportActionButtons } from '../components/ui/ReportActionButtons';
import { useFloodForge } from '../context/FloodForgeContext';
import { cn } from '../utils/cn';
import { formatCoord, formatNumber, formatPKR } from '../utils/formatters';
import { EquityImpact } from './EquityImpact';

type ReportTab = 'optimizer' | 'equity' | 'diagnostics';

const REPORT_TABS: Array<{ id: ReportTab; label: string; icon: typeof Sliders }> = [
  { id: 'optimizer', label: 'Mitigation Portfolio', icon: Sliders },
  { id: 'equity', label: 'Zone Equity & Risk-Transfer', icon: Scale },
  { id: 'diagnostics', label: 'Model Diagnostics', icon: Activity },
];

export function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    operationalMode,
    activeThresholdMm,
    optConfig,
    optResult,
    isOptStale,
    dataSources,
    modelDiagnostics,
  } = useFloodForge();

  const paramTab = searchParams.get('tab');
  const tab: ReportTab =
    paramTab === 'equity' || paramTab === 'diagnostics' ? paramTab : 'optimizer';

  const handleTabChange = (next: ReportTab) => {
    setSearchParams(next === 'optimizer' ? {} : { tab: next });
  };

  const hasFloodRisk = Boolean(
    optResult &&
      (optResult.baselineResult.metrics.exposed_area_km2 > 0 ||
        optResult.baselineResult.metrics.buildings_exposed > 0)
  );
  const equityFlagged = Boolean(
    optResult &&
      (optResult.equityStatus === 'RISK_TRANSFER_CONCERN' ||
        optResult.optimizedResult.risk_transfer?.flagged)
  );

  const kneePoint =
    optResult?.paretoFrontier.find((p) => p.isKneePoint) ??
    optResult?.paretoFrontier[optResult.paretoFrontier.length - 1] ??
    null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Executive Reports & Audits"
        subtitle="Review modeled portfolio outcomes, ward-level equity audits, and system diagnostics."
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-white border border-[#E2E8F0] text-xs font-mono text-[#475569]">
              {operationalMode === 'demo_2001' ? '2001 Cloudburst Replay' : 'Live Ops'} · {activeThresholdMm} mm
            </span>
          </div>
        }
      />

      {/* Accessible Report Tab Bar & Export Toolbar */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs print:hidden">
        <div role="tablist" aria-label="Report categories" className="flex flex-wrap items-center gap-1.5">
          {REPORT_TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                  active
                    ? 'bg-[#12345B] text-white'
                    : 'text-[#10223D] hover:bg-[#F1F6FB]'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <ReportActionButtons activeTab={tab} />
      </div>

      {/* 1. Mitigation Portfolio Summary Report (Read-Only Report View) */}
      {tab === 'optimizer' && (
        <div role="tabpanel" aria-label="Mitigation Portfolio" className="space-y-4">
          {!optResult ? (
            <PanelCard className="p-8 text-center space-y-3">
              <div className="text-sm font-medium text-[#64748B]">
                No mitigation portfolio has been computed yet.
              </div>
              <Link
                to="/mitigation"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#12345B] text-white text-xs font-semibold"
              >
                Configure &amp; Run Optimizer
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </PanelCard>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <EquityStatusBanner
                  hasFloodRisk={hasFloodRisk}
                  equityFlagged={equityFlagged}
                  className="flex-1"
                  rightSlot={
                    isOptStale
                      ? 'Stale — recompute in Optimizer'
                      : optResult.equityStatus.replace(/_/g, ' ')
                  }
                />
                <Link
                  to="/mitigation"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E2E8F0] hover:bg-[#F1F6FB] text-xs font-semibold text-[#12345B] print:hidden"
                >
                  Edit Configuration in Optimizer
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <StatCard
                  label="Total Investment"
                  value={formatPKR(optResult.totalCostPkr)}
                  subtext={`Budget cap: ${formatPKR(optConfig.budgetPkr)}`}
                  icon={<Coins className="w-4 h-4 text-[#12345B]" />}
                  tone="primary"
                />
                <StatCard
                  label="Remaining Budget"
                  value={formatPKR(optResult.remainingBudgetPkr)}
                  subtext={`${optResult.selectedPortfolio.length} interventions selected`}
                  icon={<Sliders className="w-4 h-4 text-[#0F766E]" />}
                  tone="neutral"
                />
                <StatCard
                  label="Exposure Reduction"
                  value={
                    optResult.weightedReductionPct > 0
                      ? `-${optResult.weightedReductionPct.toFixed(1)}%`
                      : '0.0%'
                  }
                  subtext={`${optResult.baselineResult.metrics.exposed_area_km2.toFixed(2)} → ${optResult.optimizedResult.metrics.exposed_area_km2.toFixed(2)} km²`}
                  icon={<ShieldCheck className="w-4 h-4 text-[#059669]" />}
                  tone="success"
                />
                <StatCard
                  label="Pareto Knee"
                  value={kneePoint ? formatPKR(kneePoint.budgetPkr) : 'N/A'}
                  subtext={
                    kneePoint
                      ? `${kneePoint.exposureReductionPct.toFixed(1)}% weighted reduction`
                      : 'Computed from frontier'
                  }
                  icon={<Activity className="w-4 h-4 text-[#12345B]" />}
                  tone="neutral"
                />
              </div>

              <MunicipalPanel
                title="Selected Intervention Portfolio"
                subtitle={`Provenance: ${optResult.engineSource === 'python_api' ? 'Python Backend' : 'Local In-Browser D8'}`}
                icon={<Sliders className="w-4 h-4" />}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[680px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F1F6FB] text-[11px] font-semibold uppercase text-[#64748B]">
                        <th className="py-2 px-3">Intervention Site</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Zone</th>
                        <th className="py-2 px-3 text-right">Cost</th>
                        <th className="py-2 px-3 text-right">Coordinates</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] text-xs">
                      {optResult.selectedPortfolio.map((site) => (
                        <tr key={site.id} className="hover:bg-[#F1F6FB]/70">
                          <td className="py-2 px-3 font-semibold text-[#10223D]">{site.id}</td>
                          <td className="py-2 px-3 text-[#475569] capitalize">
                            {site.type.replace(/_/g, ' ')}
                          </td>
                          <td className="py-2 px-3 text-[#475569]">{site.zoneName}</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-[#12345B]">
                            {formatPKR(site.cost_pkr)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[11px] text-[#64748B]">
                            {formatCoord(site.lat, site.lon)}
                          </td>
                        </tr>
                      ))}
                      {optResult.selectedPortfolio.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-[#64748B]">
                            No interventions required or selected under current scenario &amp; budget.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </MunicipalPanel>

              <PanelCard className="p-3.5">
                <div className="text-xs font-semibold text-[#10223D] mb-2">
                  Before vs. After Exposure Summary
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-[#64748B]">Flooded Area</div>
                    <div className="font-mono font-semibold text-[#10223D]">
                      {optResult.baselineResult.metrics.exposed_area_km2.toFixed(2)} →{' '}
                      {optResult.optimizedResult.metrics.exposed_area_km2.toFixed(2)} km²
                    </div>
                  </div>
                  <div>
                    <div className="text-[#64748B]">Population Exposed</div>
                    <div className="font-mono font-semibold text-[#10223D]">
                      {formatNumber(optResult.baselineResult.metrics.population_exposed)} →{' '}
                      {formatNumber(optResult.optimizedResult.metrics.population_exposed)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#64748B]">Structures</div>
                    <div className="font-mono font-semibold text-[#10223D]">
                      {formatNumber(optResult.baselineResult.metrics.buildings_exposed)} →{' '}
                      {formatNumber(optResult.optimizedResult.metrics.buildings_exposed)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#64748B]">Critical Facilities</div>
                    <div className="font-mono font-semibold text-[#10223D]">
                      {optResult.baselineResult.metrics.total_facilities_exposed} →{' '}
                      {optResult.optimizedResult.metrics.total_facilities_exposed}
                    </div>
                  </div>
                </div>
              </PanelCard>
            </>
          )}
        </div>
      )}

      {/* 2. Zone Equity & Risk-Transfer Audit */}
      {tab === 'equity' && (
        <div role="tabpanel" aria-label="Zone Equity & Risk-Transfer">
          <EquityImpact embedded />
        </div>
      )}

      {/* 3. Model Diagnostics Summary (Full workspace lives at /health) */}
      {tab === 'diagnostics' && (
        <div role="tabpanel" aria-label="Model Diagnostics" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-[#64748B]">
              Summary of active hydrological engine, runtime performance, and data source status.
            </div>
            <Link
              to="/health"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] hover:bg-[#F1F6FB] text-xs font-semibold text-[#12345B] print:hidden"
            >
              Open Full Model Health
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Active Engine"
              value={optResult?.engineSource === 'python_api' ? 'Python Backend' : 'Local D8'}
              subtext="30 m Nullah Lai Catchment"
              icon={<Cpu className="w-4 h-4 text-[#0F766E]" />}
              tone="neutral"
            />
            <StatCard
              label="Simulation Latency"
              value={`${modelDiagnostics.lastSimExecutionMs} ms`}
              subtext={
                modelDiagnostics.mlMaturityTier === 'TIER_2_CALIBRATED'
                  ? 'Terrain Calibrated'
                  : 'Baseline Screening'
              }
              icon={<Activity className="w-4 h-4 text-[#12345B]" />}
              tone="primary"
            />
            <StatCard
              label="Connected Sources"
              value={`${dataSources.filter((d) => d.status === 'CONNECTED').length}/${dataSources.length}`}
              subtext="Telemetry & geospatial feeds"
              icon={<Database className="w-4 h-4 text-[#059669]" />}
              tone="success"
            />
          </div>

          <MunicipalPanel
            title="Data Source Health Summary"
            icon={<Database className="w-4 h-4" />}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F1F6FB] text-[11px] font-semibold uppercase text-[#64748B]">
                    <th className="py-2 px-3">Source</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Completeness</th>
                    <th className="py-2 px-3 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {dataSources.map((ds) => (
                    <tr key={ds.id}>
                      <td className="py-2 px-3 font-medium text-[#10223D]">{ds.name}</td>
                      <td className="py-2 px-3 font-mono text-[11px] text-[#475569]">
                        {ds.status.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-[#10223D]">
                        {ds.completenessPct}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[11px] text-[#64748B]">
                        {ds.lastUpdated}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MunicipalPanel>
        </div>
      )}
    </div>
  );
}
