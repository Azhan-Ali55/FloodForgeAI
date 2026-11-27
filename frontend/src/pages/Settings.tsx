import { useState } from 'react';
import {
  CheckCircle2,
  Server,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { MunicipalPanel, PageHeader } from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { cn } from '../utils/cn';

export function Settings() {
  const {
    engineMode,
    setEngineMode,
    apiUrl,
    setApiUrl,
    apiHealthy,
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
      <PageHeader
        title="Platform & Analytics Server Settings"
        subtitle="Configure server connection, emergency authorization gates, and local weather cache."
      />

      {/* Simulation Compute Mode */}
      <MunicipalPanel
        title="Simulation Compute Mode"
        icon={<Server className="w-4 h-4" />}
        rightSlot={
          <span
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium border',
              apiHealthy
                ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                : 'bg-[#F1F5F9] border-[#E2E8F0] text-[#475569]'
            )}
          >
            {apiHealthy ? (
              <>
                <Wifi className="w-3 h-3" />
                Connected
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                Offline Mode
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
                In-Browser Mode
              </span>
              {engineMode === 'local' && (
                <CheckCircle2 className="w-4 h-4 text-[#55A85F]" />
              )}
            </div>
            <p className="text-[11px] text-[#5A6A7E] mt-1 leading-relaxed">
              Runs flood simulation and investment planning locally in the browser without external server dependency.
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
                Connected Analytics Server
              </span>
              {engineMode === 'api' && (
                <CheckCircle2 className="w-4 h-4 text-[#55A85F]" />
              )}
            </div>
            <p className="text-[11px] text-[#5A6A7E] mt-1 leading-relaxed">
              Uses the dedicated FloodForge calculation server with automatic browser fallback if unavailable.
            </p>
          </button>
        </div>

        <div className="space-y-1.5 pt-2">
          <label htmlFor="server-connection-address" className="text-xs font-semibold text-[#26364A]">
            Server Connection Address
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="server-connection-address"
              aria-label="Server Connection Address"
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://your-floodforge-api.example.com"
              className="flex-1 px-3 py-2 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] font-mono text-xs text-[#26364A]"
            />
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking}
              className="px-4 py-2 rounded-sm bg-[#173C79] hover:bg-[#244D8F] text-white font-semibold text-xs uppercase tracking-wider cursor-pointer"
            >
              {checking ? 'Checking...' : 'Check Server Connection'}
            </button>
          </div>
          <p className="text-[11px] text-[#5A6A7E]">
            Admin Service Endpoints: <code className="font-mono text-[#173C79]">/api/simulate</code> (Run Flood Simulation) ·{' '}
            <code className="font-mono text-[#173C79]">/api/optimize</code> (Run Budget Optimization)
          </p>
        </div>
      </MunicipalPanel>

      {/* Demonstration Emergency Tier Simulation Toggle */}
      <MunicipalPanel
        title="Demonstration Emergency Tier Simulation Toggle"
        icon={<ShieldAlert className="w-4 h-4" />}
        bodyClassName="p-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#5A6A7E] leading-relaxed">
              <strong className="text-[#173C79]">Demonstration control only (not connected to official PMD / NDMA systems).</strong> By default, the <strong className="text-[#D94343]">Emergency</strong> alert tier is locked in screening mode. Toggle only for tabletop drills or UI simulations — no real public evacuation directives are issued.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              aria-label="Demonstration Emergency Tier Simulation Toggle"
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
