import { useState } from 'react';
import {
  CheckCircle2,
  Server,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { MunicipalPanel } from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { cn } from '../utils/cn';

export function Settings() {
  const {
    engineMode,
    setEngineMode,
    apiUrl,
    setApiUrl,
    apiHealthy,
    apiLatencyMs,
    checkApiHealth,
    officialAgencyOverride,
    setOfficialAgencyOverride,
    resetWeatherCache,
  } = useFloodForge();

  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await checkApiHealth();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="font-heading text-xl font-bold text-[#173C79]">
          Platform &amp; Backend Integration Settings
        </h1>
        <p className="text-xs sm:text-sm text-[#5A6A7E]">
          Configure Python REST API connectivity, agency authorization gates, and local weather telemetry cache.
        </p>
      </div>

      {/* Engine & Backend REST API Integration */}
      <MunicipalPanel
        title="Simulation & Optimizer Compute Backend"
        icon={<Server className="w-4 h-4" />}
        rightSlot={
          <span
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-mono',
              apiHealthy
                ? 'bg-[#55A85F] text-white'
                : 'bg-white/15 text-white'
            )}
          >
            {apiHealthy ? (
              <>
                <Wifi className="w-3 h-3" />
                API Connected ({apiLatencyMs} ms)
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                Local Screening Mode
              </>
            )}
          </span>
        }
        bodyClassName="p-4 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setEngineMode('local')}
            className={cn(
              'p-3.5 rounded-sm border text-left transition-colors cursor-pointer',
              engineMode === 'local'
                ? 'bg-[#EEF3FA] border-[#173C79]'
                : 'bg-[#F5F6F7] border-[#D6DCE4] hover:border-[#244D8F]'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#173C79]">
                In-Browser Deterministic Engine
              </span>
              {engineMode === 'local' && (
                <CheckCircle2 className="w-4 h-4 text-[#55A85F]" />
              )}
            </div>
            <p className="text-[11px] text-[#5A6A7E] mt-1 leading-relaxed">
              Runs topological D8 routing, Pareto optimizer, and zone risk-transfer audits locally with zero backend latency.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setEngineMode('api')}
            className={cn(
              'p-3.5 rounded-sm border text-left transition-colors cursor-pointer',
              engineMode === 'api'
                ? 'bg-[#EEF3FA] border-[#173C79]'
                : 'bg-[#F5F6F7] border-[#D6DCE4] hover:border-[#244D8F]'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#173C79]">
                Connected Python REST API
              </span>
              {engineMode === 'api' && (
                <CheckCircle2 className="w-4 h-4 text-[#55A85F]" />
              )}
            </div>
            <p className="text-[11px] text-[#5A6A7E] mt-1 leading-relaxed">
              Calls <code className="text-[#173C79]">/api/simulate</code> and{' '}
              <code className="text-[#173C79]">/api/optimize</code> on the FloodForge Python server with automatic local fallback on error.
            </p>
          </button>
        </div>

        <div className="space-y-1.5 pt-2">
          <label className="text-xs font-semibold text-[#26364A]">
            Backend Base URL (<code className="text-[#173C79]">VITE_API_BASE_URL</code>)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://localhost:8000"
              className="flex-1 px-3 py-2 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] font-mono text-xs text-[#26364A]"
            />
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking}
              className="px-4 py-2 rounded-sm bg-[#173C79] hover:bg-[#244D8F] text-white font-semibold text-xs uppercase tracking-wider cursor-pointer"
            >
              {checking ? 'Pinging...' : 'Test /api/health'}
            </button>
          </div>
        </div>
      </MunicipalPanel>

      {/* Official Agency Alert Gate */}
      <MunicipalPanel
        title="Official PMD / NDMA Emergency Tier Authorization Gate"
        icon={<ShieldAlert className="w-4 h-4" />}
        bodyClassName="p-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#5A6A7E] leading-relaxed">
              By default, automated <strong className="text-[#D94343]">CRITICAL / EMERGENCY</strong> public evacuation directives are strictly blocked. Enable only when an authorized PMD/NDMA hydrometric bulletin is active.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={officialAgencyOverride}
              onChange={(e) => setOfficialAgencyOverride(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-[#E2E6EC] border border-[#CBD5E1] rounded-full peer peer-checked:bg-[#D94343] after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
          </label>
        </div>
      </MunicipalPanel>

      {/* Telemetry Cache Management */}
      <MunicipalPanel
        title="Local Weather Telemetry Cache"
        icon={<Trash2 className="w-4 h-4" />}
        bodyClassName="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <p className="text-xs text-[#5A6A7E]">
          Clear cached Open-Meteo hourly forecast responses stored in browser localStorage.
        </p>
        <button
          type="button"
          onClick={resetWeatherCache}
          className="flex items-center gap-2 px-3 py-2 rounded-sm bg-[#FBEBEB] border border-[#D94343]/50 hover:bg-[#D94343] hover:text-white text-xs font-semibold text-[#D94343] transition-colors self-start cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear Weather Cache
        </button>
      </MunicipalPanel>
    </div>
  );
}
