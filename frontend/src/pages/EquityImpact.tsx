import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Building2,
  CheckCircle2,
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
import { MunicipalPanel, PanelCard } from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { cn } from '../utils/cn';
import { formatNumber } from '../utils/formatters';

export function EquityImpact() {
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
      <PanelCard className="p-8 text-center text-sm text-[#5A6A7E]">
        Run an optimization portfolio first in Mitigation Optimizer to generate equity and risk-transfer diagnostics.
      </PanelCard>
    );
  }

  const isEquityPass =
    optResult.equityStatus !== 'RISK_TRANSFER_CONCERN' &&
    !(optResult.optimizedResult.risk_transfer?.flagged);

  const equityBanner = isEquityPass
    ? {
        title: '✅ Equity Pass: No downstream risk transfer.',
        desc: 'All Rawalpindi & Islamabad basin wards pass downstream equity limits (<=2% downstream building risk tolerance).',
        icon: CheckCircle2,
        cls: 'bg-[#EDF7EE] border-[#55A85F] text-[#2F6F37]',
      }
    : {
        title: 'Risk-Transfer Concern Detected',
        desc: 'Downstream Rawalpindi exposed buildings increased above the 2% equity threshold after intervention placement. Review drainage discharge routing before approval.',
        icon: AlertTriangle,
        cls: 'bg-[#FBEBEB] border-[#D94343] text-[#A12323]',
      };

  const BannerIcon = equityBanner.icon;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#173C79]">
            Neighborhood Equity &amp; Impact Assessment
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6A7E]">
            Before-and-after exposure comparison and ward-level downstream risk-transfer audit across Islamabad &amp; Rawalpindi.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-[#173C79]">
          <Scale className="w-4 h-4" />
          <span>{optResult.zoneEquityRows.length} Basin Zones Audited</span>
        </div>
      </div>

      <div
        className={cn(
          'rounded border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3',
          equityBanner.cls
        )}
      >
        <div className="flex items-start gap-3">
          <BannerIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-heading text-sm font-bold">{equityBanner.title}</div>
            <p className="text-xs text-[#26364A] mt-0.5 leading-relaxed">
              {equityBanner.desc}
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-sm bg-white border border-current/30 self-start sm:self-center flex-shrink-0">
          {optResult.equityStatus.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {metricsComparison.map((m) => {
          const Icon = m.icon;
          const improved = m.diff < 0;
          return (
            <PanelCard key={m.label} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                  {m.label}
                </span>
                <Icon className="w-4 h-4 text-[#173C79]" />
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-[10px] font-mono text-[#5A6A7E]">Baseline</div>
                  <div className="text-sm font-mono text-[#26364A]">
                    {m.decimals > 0
                      ? m.baseVal.toFixed(m.decimals)
                      : formatNumber(m.baseVal)}
                  </div>
                </div>
                <ArrowDownRight
                  className={cn(
                    'w-4 h-4',
                    improved ? 'text-[#55A85F]' : 'text-[#5A6A7E]'
                  )}
                />
                <div className="text-right">
                  <div className="text-[10px] font-mono text-[#5A6A7E]">Optimized</div>
                  <div className="text-base font-bold font-mono text-[#173C79]">
                    {m.decimals > 0
                      ? m.optVal.toFixed(m.decimals)
                      : formatNumber(m.optVal)}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#E6EAEF] flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#5A6A7E]">
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
                  tick={{ fill: '#5A6A7E', fontSize: 10 }}
                  angle={-18}
                  textAnchor="end"
                  height={54}
                />
                <YAxis tick={{ fill: '#5A6A7E', fontSize: 10 }} unit=" km²" />
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
          <div className="space-y-2.5 text-xs text-[#26364A] leading-relaxed">
            <p>
              A reduction in total basin flooded area does <strong>not</strong> automatically verify social equity. Drainage upgrades in upstream Islamabad sectors can accelerate peak discharge into low-income downstream Rawalpindi wards (such as Dhoke Hassu, Ratta Amral, and Gawalmandi).
            </p>
            <p className="text-[#5A6A7E]">
              FloodForgeAI audits every zone independently and flags portfolios that transfer flood risk beyond a 2% downstream building tolerance threshold.
            </p>
          </div>

          <div className="p-3 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] space-y-1.5 text-xs">
            <div className="font-semibold text-[10px] uppercase tracking-wider text-[#5A6A7E]">
              Audit Summary
            </div>
            <div className="flex justify-between">
              <span className="text-[#5A6A7E]">Wards with Modeled Reduction</span>
              <span className="font-mono text-[#55A85F] font-bold">
                {optResult.zoneEquityRows.filter((r) => r.status === 'REDUCTION').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#5A6A7E]">No Significant Change</span>
              <span className="font-mono text-[#EF8735] font-bold">
                {
                  optResult.zoneEquityRows.filter(
                    (r) => r.status === 'NO_SIGNIFICANT_CHANGE'
                  ).length
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#5A6A7E]">Increased Exposure Flagged</span>
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
              <tr className="border-b border-[#D6DCE4] bg-[#F5F6F7] text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
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
                  <tr key={row.zoneId} className="hover:bg-[#F5F6F7]/70">
                    <td className="py-2.5 px-2.5 font-semibold text-[#173C79]">
                      {row.zoneName}
                    </td>
                    <td className="py-2.5 px-3 text-[#5A6A7E]">{row.sector}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#26364A]">
                      {row.baselineAreaKm2.toFixed(4)} km²
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#26364A]">
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
