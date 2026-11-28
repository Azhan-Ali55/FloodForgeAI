import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { MunicipalPanel, PageHeader, PanelCard } from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { cn } from '../utils/cn';

export function ModelHealth() {
  const {
    dataSources,
    modelDiagnostics,
    isSyncingWeather,
    refreshWeather,
    optResult,
  } = useFloodForge();

  const actualEngineLabel =
    optResult?.engineSource === 'python_api' ? 'Python Backend Engine' : 'Local In-Browser Engine';

  return (
    <div className="space-y-4">
      <PageHeader
        title="System Intelligence & Model Diagnostics"
        subtitle="Telemetry health across weather feeds, geospatial layers, and flood routing accuracy."
        rightSlot={
          <button
            type="button"
            onClick={() => refreshWeather()}
            disabled={isSyncingWeather}
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-[#12345B] hover:bg-[#12345B] text-xs font-semibold text-white cursor-pointer"
          >
            <RefreshCw
              className={cn('w-3.5 h-3.5', isSyncingWeather && 'animate-spin')}
            />
            Verify Live Telemetry
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <PanelCard className="space-y-1.5 border-t-2 border-t-[#55A85F]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#64748B]">
            <span>Basin Runoff Model</span>
            <Cpu className="w-4 h-4 text-[#55A85F]" />
          </div>
          <div className="text-lg font-bold font-mono text-[#55A85F]">
            Active
          </div>
          <div className="text-[11px] text-[#64748B]">
            Rawalpindi–Islamabad Catchment
          </div>
        </PanelCard>

        <PanelCard className="space-y-1.5 border-t-2 border-t-[#12345B]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#64748B]">
            <span>Simulation Speed</span>
            <Activity className="w-4 h-4 text-[#12345B]" />
          </div>
          <div className="text-lg font-bold font-mono text-[#10223D]">
            {modelDiagnostics.lastSimExecutionMs} ms
          </div>
          <div className="text-[11px] text-[#64748B]">
            Status: Screening Ready
          </div>
        </PanelCard>

        <PanelCard className="space-y-1.5 border-t-2 border-t-[#12345B]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#64748B]">
            <span>Optimization Consistency</span>
            <ShieldCheck className="w-4 h-4 text-[#12345B]" />
          </div>
          <div className="flex items-baseline gap-3">
            <div>
              <span className="text-[10px] font-mono text-[#64748B] block">Curve Fit</span>
              <span className="text-lg font-bold font-mono text-[#10223D]">
                {modelDiagnostics.validationSampleCount > 0
                  ? `${(modelDiagnostics.surrogateTrainR2 * 100).toFixed(0)}%`
                  : 'N/A'}
              </span>
            </div>
            <span className="text-[#CBD5E1]">/</span>
            <div>
              <span className="text-[10px] font-mono text-[#55A85F] block">
                Stability
              </span>
              <span className="text-lg font-bold font-mono text-[#55A85F]">
                {modelDiagnostics.validationSampleCount > 0
                  ? `${(modelDiagnostics.surrogateValidationR2 * 100).toFixed(0)}%`
                  : 'N/A'}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-[#64748B]">
            {modelDiagnostics.validationSampleCount > 0
              ? `Verified across ${modelDiagnostics.validationSampleCount} budget checkpoints`
              : 'Run optimizer to compute Pareto curve fit'}
          </div>
        </PanelCard>

        <PanelCard className="space-y-1.5 border-t-2 border-t-[#EF8735]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#64748B]">
            <span>Calibration Status</span>
            <AlertTriangle className="w-4 h-4 text-[#EF8735]" />
          </div>
          <div className="text-sm font-bold text-[#EF8735]">
            {modelDiagnostics.mlMaturityTier === 'TIER_2_CALIBRATED'
              ? 'Terrain Calibrated'
              : 'Baseline Screening'}
          </div>
          <div className="text-[11px] text-[#64748B] leading-snug">
            Terrain &amp; rainfall physics — field river gauge calibration pending.
          </div>
        </PanelCard>
      </div>

      <PanelCard className="bg-[#FEF9E7] border-[#E0B422]/60">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#EF8735] flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-bold text-[#8A6700]">
              Planning Notice ({actualEngineLabel})
            </div>
            <p className="text-[#10223D] leading-relaxed">
              {modelDiagnostics.validationStatus} Results are designed for municipal investment planning and preparedness across Rawalpindi and Islamabad and must be cross-checked with official PMD and NDMA river-gauge advisories before public directives.
            </p>
          </div>
        </div>
      </PanelCard>

      <MunicipalPanel
        title="Geospatial & Meteorological Data Sources"
        icon={<Database className="w-4 h-4" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F1F6FB] text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                <th className="py-2 px-2.5">Data Source</th>
                <th className="py-2 px-3">Source Type</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Completeness</th>
                <th className="py-2 px-3">Last Update</th>
                <th className="py-2 px-2.5">Diagnostic Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6EAEF] text-xs">
              {dataSources.map((ds) => {
                const statusBadge =
                  ds.status === 'CONNECTED'
                    ? 'bg-[#EDF7EE] text-[#2F6F37] border-[#55A85F]/50'
                    : ds.status === 'SYNTHETIC_PROXY'
                      ? 'bg-[#EEF3FA] text-[#12345B] border-[#12345B]/40'
                      : ds.status === 'FALLBACK'
                        ? 'bg-[#FEF9E7] text-[#8A6700] border-[#E0B422]/60'
                        : 'bg-[#FBEBEB] text-[#A12323] border-[#D94343]/50';

                return (
                  <tr key={ds.id} className="hover:bg-[#F1F6FB]/70">
                    <td className="py-2.5 px-2.5">
                      <div className="font-semibold text-[#12345B]">{ds.name}</div>
                      <div className="text-[11px] text-[#64748B]">{ds.dataset}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[#10223D]">
                      {ds.sourceType}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-sm text-[10px] font-mono border',
                          statusBadge
                        )}
                      >
                        {ds.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#10223D]">
                      {ds.completenessPct}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B]">
                      {ds.lastUpdated}
                    </td>
                    <td className="py-2.5 px-2.5 text-[11px] text-[#64748B]">
                      {ds.notes}
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
