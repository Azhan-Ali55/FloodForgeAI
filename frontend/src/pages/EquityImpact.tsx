import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Building2,
  Route,
  Scale,
  ShieldAlert,
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
import {
  EquityStatusBanner,
  MunicipalPanel,
  PageHeader,
  PanelCard,
} from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { cn } from '../utils/cn';
import { formatNumber } from '../utils/formatters';

export function EquityImpact({ embedded = false }: { embedded?: boolean }) {
  const { optResult } = useFloodForge();

  const metricsComparison = useMemo(() => {
    if (!optResult) return [];
    const b = optResult.baselineResult.metrics;
    const o = optResult.optimizedResult.metrics;

    const buildRow = (
      label: string,
      unit: string,
      baseVal: number,
      optVal: number,
      decimals: number,
      icon: typeof Waves
    ) => {
      const diff = optVal - baseVal;
      const pct = baseVal > 0 ? (diff / baseVal) * 100 : 0;
      return {
        label,
        unit,
        baseVal,
        optVal,
        diff,
        pct,
        decimals,
        icon,
      };
    };

    return [
      buildRow('Flooded Area', 'km²', b.exposed_area_km2, o.exposed_area_km2, 2, Waves),
      buildRow('Buildings Exposed', 'structures', b.buildings_exposed, o.buildings_exposed, 0, Building2),
      buildRow('Population Exposed', 'people', b.population_exposed, o.population_exposed, 0, Users),
      buildRow('Road Segments Exposed', 'corridors', b.road_segments_exposed, o.road_segments_exposed, 0, Route),
      buildRow('Critical Facilities Exposed', 'facilities', b.total_facilities_exposed, o.total_facilities_exposed, 0, ShieldAlert),
    ];
  }, [optResult]);

  const zoneChartData = useMemo(() => {
    if (!optResult) return [];
    return optResult.zoneEquityRows.map((z) => ({
      zone: z.zoneName.split('&')[0].trim().slice(0, 16),
      baseline: z.baselineAreaKm2,
      post: z.postAreaKm2,
    }));
  }, [optResult]);

  if (!optResult) {
    return (
      <PanelCard className="p-8 text-center text-sm text-[#64748B]">
        Run an optimization portfolio first in Mitigation Optimizer to generate equity and risk-transfer diagnostics.
      </PanelCard>
    );
  }

  const hasFloodRisk =
    optResult.baselineResult.metrics.exposed_area_km2 > 0 ||
    optResult.baselineResult.metrics.buildings_exposed > 0;
  const equityFlagged =
    optResult.equityStatus === 'RISK_TRANSFER_CONCERN' ||
    Boolean(optResult.optimizedResult.risk_transfer?.flagged);

  return (
    <div className="space-y-4">
      {!embedded && (
        <PageHeader
          title="Neighborhood Equity & Impact Assessment"
          subtitle="Before-and-after exposure comparison and downstream risk-transfer audit across Islamabad & Rawalpindi."
          rightSlot={
            <div className="flex items-center gap-2 text-xs font-mono text-[#12345B]">
              <Scale className="w-4 h-4" />
              <span>{optResult.zoneEquityRows.length} Basin Zones Audited</span>
            </div>
          }
        />
      )}

      <EquityStatusBanner
        hasFloodRisk={hasFloodRisk}
        equityFlagged={equityFlagged}
        description={
          !hasFloodRisk
            ? 'No exposed corridors require downstream transfer auditing under dry conditions.'
            : equityFlagged
              ? 'Downstream Rawalpindi exposed buildings exceeded the 2% tolerance threshold.'
              : 'All Rawalpindi & Islamabad basin wards pass the 2% downstream building risk tolerance limit.'
        }
        rightSlot={optResult.equityStatus.replace(/_/g, ' ')}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {metricsComparison.map((m) => {
          const Icon = m.icon;
          const improved = m.diff < 0;
          return (
            <PanelCard key={m.label} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  {m.label}
                </span>
                <Icon className="w-4 h-4 text-[#12345B]" />
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-[10px] font-mono text-[#64748B]">Baseline</div>
                  <div className="text-sm font-mono text-[#10223D]">
                    {m.decimals > 0
                      ? m.baseVal.toFixed(m.decimals)
                      : formatNumber(m.baseVal)}
                  </div>
                </div>
                <ArrowDownRight
                  className={cn(
                    'w-4 h-4',
                    improved ? 'text-[#55A85F]' : 'text-[#64748B]'
                  )}
                />
                <div className="text-right">
                  <div className="text-[10px] font-mono text-[#64748B]">Optimized</div>
                  <div className="text-base font-bold font-mono text-[#12345B]">
                    {m.decimals > 0
                      ? m.optVal.toFixed(m.decimals)
                      : formatNumber(m.optVal)}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#E6EAEF] flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#64748B]">
                  {m.diff > 0 ? '+' : ''}
                  {m.decimals > 0 ? m.diff.toFixed(m.decimals) : formatNumber(m.diff)} {m.unit}
                </span>
                <span
                  className={cn(
                    'font-semibold',
                    m.diff < 0
                      ? 'text-[#55A85F]'
                      : m.diff > 0
                        ? 'text-[#D94343]'
                        : 'text-[#EF8735]'
                  )}
                >
                  {m.pct > 0 ? '+' : ''}
                  {m.pct.toFixed(1)}%
                </span>
              </div>
            </PanelCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <MunicipalPanel
          title="Ward-Level Flooded Area Comparison (Before vs. After)"
          className="xl:col-span-8"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                <XAxis
                  dataKey="zone"
                  tick={{ fill: '#64748B', fontSize: 10 }}
                  angle={-18}
                  textAnchor="end"
                  height={54}
                />
                <YAxis tick={{ fill: '#64748B', fontSize: 10 }} unit=" km²" />
                <Tooltip contentStyle={{ fontSize: 12, borderColor: '#CBD5E1' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="baseline" name="Baseline (km²)" fill="#EF8735" radius={[2, 2, 0, 0]} />
                <Bar dataKey="post" name="Post-Intervention (km²)" fill="#55A85F" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MunicipalPanel>

        <MunicipalPanel
          title="Equity Governance Guardrail"
          icon={<AlertTriangle className="w-4 h-4" />}
          className="xl:col-span-4"
          bodyClassName="p-4 flex flex-col justify-between gap-4"
        >
          <ul className="space-y-2 text-xs text-[#10223D] leading-relaxed list-disc pl-4">
            <li>
              Prevents upstream Islamabad drainage upgrades from shifting flood peaks into downstream Rawalpindi wards.
            </li>
            <li className="text-[#64748B]">
              Each zone is audited independently against a strict 2% downstream building exposure tolerance.
            </li>
          </ul>

          <div className="p-3 rounded-sm bg-[#F1F6FB] border border-[#E2E8F0] space-y-1.5 text-xs">
            <div className="font-semibold text-[10px] uppercase tracking-wider text-[#64748B]">
              Audit Summary
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Wards with Modeled Reduction</span>
              <span className="font-mono text-[#55A85F] font-bold">
                {optResult.zoneEquityRows.filter((r) => r.status === 'REDUCTION').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">No Significant Change</span>
              <span className="font-mono text-[#EF8735] font-bold">
                {
                  optResult.zoneEquityRows.filter(
                    (r) => r.status === 'NO_SIGNIFICANT_CHANGE'
                  ).length
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Increased Exposure Flagged</span>
              <span className="font-mono text-[#D94343] font-bold">
                {
                  optResult.zoneEquityRows.filter((r) => r.status === 'RISK_INCREASED')
                    .length
                }
              </span>
            </div>
          </div>
        </MunicipalPanel>
      </div>

      <MunicipalPanel title="Neighborhood Risk-Transfer Audit (Zone-by-Zone)">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[680px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F1F6FB] text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                <th className="py-2 px-2.5">Neighborhood / Zone</th>
                <th className="py-2 px-3">Sector</th>
                <th className="py-2 px-3 text-right">Baseline Flooded Area</th>
                <th className="py-2 px-3 text-right">Post-Intervention Area</th>
                <th className="py-2 px-3 text-right">Change</th>
                <th className="py-2 px-2.5 text-right">Risk-Transfer Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6EAEF] text-xs">
              {optResult.zoneEquityRows.map((row) => {
                const badge =
                  row.status === 'REDUCTION'
                    ? {
                        label: 'MODELED REDUCTION',
                        cls: 'bg-[#EDF7EE] text-[#2F6F37] border-[#55A85F]/50',
                      }
                    : row.status === 'RISK_INCREASED'
                      ? {
                          label: 'RISK INCREASED',
                          cls: 'bg-[#FBEBEB] text-[#A12323] border-[#D94343]/50',
                        }
                      : {
                          label: 'NO SIGNIFICANT CHANGE',
                          cls: 'bg-[#FEF9E7] text-[#8A6700] border-[#E0B422]/60',
                        };

                return (
                  <tr key={row.zoneId} className="hover:bg-[#F1F6FB]/70">
                    <td className="py-2.5 px-2.5 font-semibold text-[#12345B]">
                      {row.zoneName}
                    </td>
                    <td className="py-2.5 px-3 text-[#64748B]">{row.sector}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#10223D]">
                      {row.baselineAreaKm2.toFixed(4)} km²
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#10223D]">
                      {row.postAreaKm2.toFixed(4)} km²
                    </td>
                    <td
                      className={cn(
                        'py-2.5 px-3 text-right font-mono font-semibold',
                        row.deltaAreaKm2 < 0
                          ? 'text-[#55A85F]'
                          : row.deltaAreaKm2 > 0
                            ? 'text-[#D94343]'
                            : 'text-[#EF8735]'
                      )}
                    >
                      {row.deltaAreaKm2 > 0 ? '+' : ''}
                      {row.deltaAreaKm2.toFixed(4)} km² ({row.pctChange > 0 ? '+' : ''}
                      {row.pctChange.toFixed(1)}%)
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      <span
                        className={cn(
                          'inline-block px-2 py-0.5 rounded-sm text-[10px] font-mono border',
                          badge.cls
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </MunicipalPanel>
    </div>
  );
}
