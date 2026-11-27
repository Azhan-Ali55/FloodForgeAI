import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { MunicipalPanel, PanelCard } from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { cn } from '../utils/cn';

export function ModelHealth() {
  const {
    dataSources,
    modelDiagnostics,
    isSyncingWeather,
    refreshWeather,
    engineMode,
    apiHealthy,
  } = useFloodForge();

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#173C79]">
            System Intelligence &amp; Model Diagnostics
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6A7E]">
            Transparent telemetry on weather feeds, geospatial data layers, D8 hydrological routing, and surrogate fidelity vs. independent validation.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refreshWeather()}
          disabled={isSyncingWeather}
          className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-[#173C79] hover:bg-[#244D8F] text-xs font-semibold text-white self-start cursor-pointer"
        >
          <RefreshCw
            className={cn('w-3.5 h-3.5', isSyncingWeather && 'animate-spin')}
          />
          Verify Live Telemetry
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <PanelCard className="space-y-1.5 border-t-2 border-t-[#55A85F]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#5A6A7E]">
            <span>Basin Runoff Model</span>
            <Cpu className="w-4 h-4 text-[#55A85F]" />
          </div>
          <div className="text-lg font-bold font-mono text-[#55A85F]">
            Active
          </div>
          <div className="text-[11px] text-[#5A6A7E]">
            Rawalpindi–Islamabad Catchment
          </div>
        </PanelCard>

        <PanelCard className="space-y-1.5 border-t-2 border-t-[#173C79]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#5A6A7E]">
            <span>Simulation Speed</span>
            <Activity className="w-4 h-4 text-[#173C79]" />
          </div>
          <div className="text-lg font-bold font-mono text-[#26364A]">
            {modelDiagnostics.lastSimExecutionMs} ms
          </div>
          <div className="text-[11px] text-[#5A6A7E]">
            Status: Screening Ready
          </div>
        </PanelCard>

        <PanelCard className="space-y-1.5 border-t-2 border-t-[#244D8F]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#5A6A7E]">
            <span>Optimization Consistency</span>
            <ShieldCheck className="w-4 h-4 text-[#244D8F]" />
          </div>
          <div className="flex items-baseline gap-3">
            <div>
              <span className="text-[10px] font-mono text-[#5A6A7E] block">Curve Fit</span>
              <span className="text-lg font-bold font-mono text-[#26364A]">
                {(modelDiagnostics.surrogateTrainR2 * 100).toFixed(0)}%
              </span>
            </div>
            <span className="text-[#CBD5E1]">/</span>
            <div>
              <span className="text-[10px] font-mono text-[#55A85F] block">
                Stability
              </span>
              <span className="text-lg font-bold font-mono text-[#55A85F]">
                {(modelDiagnostics.surrogateValidationR2 * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="text-[11px] text-[#5A6A7E]">
            Verified across {modelDiagnostics.validationSampleCount} budget checkpoints
          </div>
        </PanelCard>

        <PanelCard className="space-y-1.5 border-t-2 border-t-[#EF8735]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#5A6A7E]">
            <span>Calibration Status</span>
            <AlertTriangle className="w-4 h-4 text-[#EF8735]" />
          </div>
          <div className="text-sm font-bold text-[#EF8735]">
            {modelDiagnostics.mlMaturityTier === 'TIER_2_CALIBRATED'
              ? 'Terrain Calibrated'
              : 'Baseline Screening'}
          </div>
          <div className="text-[11px] text-[#5A6A7E] leading-snug">
            Terrain &amp; rainfall physics — field river gauge calibration pending.
          </div>
        </PanelCard>
      </div>

      <PanelCard className="bg-[#FEF9E7] border-[#E0B422]/60">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#EF8735] flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-bold text-[#8A6700]">
              Planning Notice ({engineMode === 'api' && apiHealthy ? 'Server Active' : 'Local Screening'})
            </div>
            <p className="text-[#26364A] leading-relaxed">
              Results are designed for municipal investment planning and emergency preparedness across Rawalpindi and Islamabad. They should be cross-checked against official PMD and NDMA river-gauge advisories before issuing evacuation directives.
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
              <tr className="border-b border-[#D6DCE4] bg-[#F5F6F7] text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
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
                      ? 'bg-[#EEF3FA] text-[#173C79] border-[#244D8F]/40'
                      : ds.status === 'FALLBACK'
                        ? 'bg-[#FEF9E7] text-[#8A6700] border-[#E0B422]/60'
                        : 'bg-[#FBEBEB] text-[#A12323] border-[#D94343]/50';

                return (
                  <tr key={ds.id} className="hover:bg-[#F5F6F7]/70">
                    <td className="py-2.5 px-2.5">
                      <div className="font-semibold text-[#173C79]">{ds.name}</div>
                      <div className="text-[11px] text-[#5A6A7E]">{ds.dataset}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[#26364A]">
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
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#26364A]">
                      {ds.completenessPct}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[#5A6A7E]">
                      {ds.lastUpdated}
                    </td>
                    <td className="py-2.5 px-2.5 text-[11px] text-[#5A6A7E]">
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
