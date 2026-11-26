import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  CloudRain,
  Database,
  MapPin,
  RefreshCw,
  Thermometer,
  Waves,
  Wind,
} from 'lucide-react';
import { MunicipalPanel, StationRiskBadge } from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { cn } from '../utils/cn';
import { formatCoord } from '../utils/formatters';

export function LiveMonitoring() {
  const navigate = useNavigate();
  const {
    weather,
    isSyncingWeather,
    refreshWeather,
    monitoringStations,
    setSelectedStationId,
    dataSources,
    events,
  } = useFloodForge();

  const statusSummary = useMemo(() => {
    const counts = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
    for (const s of monitoringStations) counts[s.riskLevel]++;
    return counts;
  }, [monitoringStations]);

  const handleInspectOnMap = (stationId: string) => {
    setSelectedStationId(stationId);
    navigate('/map');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold text-[#173C79]">
            Live Environmental &amp; Station Telemetry
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6A7E]">
            Real-time meteorological feed (Open-Meteo), Nullah Lai monitoring node status, and data source diagnostics.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refreshWeather()}
          disabled={isSyncingWeather}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-[#173C79] hover:bg-[#244D8F] text-white text-xs font-semibold cursor-pointer self-start"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isSyncingWeather && 'animate-spin')} />
          Refresh Telemetry
        </button>
      </div>

      {/* Top Current Weather & Station Risk Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-[#D6DCE4] rounded p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#5A6A7E]">
            <CloudRain className="w-3.5 h-3.5 text-[#244D8F]" />
            Current Rainfall
          </div>
          <div className="text-lg font-bold font-mono text-[#173C79] mt-1">
            {weather.currentWeather.precipitationMm !== null
              ? `${weather.currentWeather.precipitationMm.toFixed(1)} mm/h`
              : 'Data unavailable'}
          </div>
        </div>
        <div className="bg-white border border-[#D6DCE4] rounded p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#5A6A7E]">
            <Thermometer className="w-3.5 h-3.5 text-[#EF8735]" />
            Air Temperature
          </div>
          <div className="text-lg font-bold font-mono text-[#26364A] mt-1">
            {weather.currentWeather.temperatureC !== null
              ? `${weather.currentWeather.temperatureC.toFixed(1)} °C`
              : 'Data unavailable'}
          </div>
        </div>
        <div className="bg-white border border-[#D6DCE4] rounded p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#5A6A7E]">
            <Wind className="w-3.5 h-3.5 text-[#55A85F]" />
            Wind Speed
          </div>
          <div className="text-lg font-bold font-mono text-[#26364A] mt-1">
            {weather.currentWeather.windSpeedKmh !== null
              ? `${weather.currentWeather.windSpeedKmh.toFixed(1)} km/h`
              : 'Data unavailable'}
          </div>
        </div>
        <div className="bg-white border border-[#D6DCE4] rounded p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#5A6A7E]">
            <Waves className="w-3.5 h-3.5 text-[#244D8F]" />
            Water Temp
          </div>
          <div className="text-sm font-semibold font-mono text-[#5A6A7E] mt-1.5">
            Data unavailable
          </div>
        </div>
        <div className="bg-white border border-[#D6DCE4] rounded p-3">
          <div className="text-[11px] text-[#5A6A7E]">Low / Moderate Stations</div>
          <div className="text-lg font-bold font-mono text-[#55A85F] mt-1">
            {statusSummary.Low + statusSummary.Moderate} / {monitoringStations.length}
          </div>
        </div>
        <div className="bg-white border border-[#D6DCE4] rounded p-3">
          <div className="text-[11px] text-[#5A6A7E]">High / Critical Stations</div>
          <div className="text-lg font-bold font-mono text-[#D94343] mt-1">
            {statusSummary.High + statusSummary.Critical} / {monitoringStations.length}
          </div>
        </div>
      </div>

      {/* Monitoring Stations Table */}
      <MunicipalPanel
        title="Nullah Lai Monitoring Stations & Hydrometric Nodes"
        icon={<MapPin className="w-4 h-4" />}
        rightSlot={
          <span className="text-[10px] font-mono text-white/85">
            Updated: {weather.fetchedAtPkt}
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-[#D6DCE4] bg-[#F5F6F7] text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                <th className="py-2 px-2.5">Station</th>
                <th className="py-2 px-2.5">Location</th>
                <th className="py-2 px-2.5">Coordinates</th>
                <th className="py-2 px-2.5 text-right">Rainfall</th>
                <th className="py-2 px-2.5 text-right">Water Level (Proxy)</th>
                <th className="py-2 px-2.5 text-right">Air Temp</th>
                <th className="py-2 px-2.5 text-right">Wind</th>
                <th className="py-2 px-2.5">Risk</th>
                <th className="py-2 px-2.5">Status</th>
                <th className="py-2 px-2.5 text-right">Map</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6EAEF] text-xs">
              {monitoringStations.map((st) => (
                <tr key={st.id} className="hover:bg-[#F5F6F7]/70">
                  <td className="py-2.5 px-2.5">
                    <div className="font-semibold text-[#173C79]">{st.name}</div>
                    <div className="text-[10px] font-mono text-[#5A6A7E]">{st.stationCode}</div>
                  </td>
                  <td className="py-2.5 px-2.5 text-[#26364A]">
                    <div>{st.location}</div>
                    <div className="text-[10px] text-[#5A6A7E]">{st.sector}</div>
                  </td>
                  <td className="py-2.5 px-2.5 font-mono text-[11px] text-[#5A6A7E]">
                    {formatCoord(st.lat, st.lon)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-[#26364A]">
                    {st.rainfallMmHr !== null ? `${st.rainfallMmHr.toFixed(1)} mm/h` : 'Unavailable'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-[#173C79]">
                    {st.waterLevelM !== null ? `${st.waterLevelM.toFixed(2)} m` : 'Unavailable'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-[#26364A]">
                    {st.temperatureC !== null ? `${st.temperatureC.toFixed(1)} °C` : 'Unavailable'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-[#26364A]">
                    {st.windSpeedKmh !== null ? `${st.windSpeedKmh.toFixed(1)} km/h` : 'Unavailable'}
                  </td>
                  <td className="py-2.5 px-2.5">
                    <StationRiskBadge level={st.riskLevel} />
                  </td>
                  <td className="py-2.5 px-2.5 text-[11px] font-medium text-[#26364A]">
                    {st.operationalStatus}
                  </td>
                  <td className="py-2.5 px-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleInspectOnMap(st.id)}
                      className="px-2 py-1 rounded-sm bg-[#EEF3FA] hover:bg-[#173C79] text-[#173C79] hover:text-white text-[11px] font-semibold border border-[#173C79]/30 transition-colors cursor-pointer"
                    >
                      Locate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MunicipalPanel>

      {/* Data Source Health + Event Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <MunicipalPanel
          title="Connected Data Feeds & GIS Layers"
          icon={<Database className="w-4 h-4" />}
          className="lg:col-span-7"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {dataSources.map((ds) => {
              const dotColor =
                ds.status === 'CONNECTED'
                  ? '#55A85F'
                  : ds.status === 'SYNTHETIC_PROXY'
                    ? '#244D8F'
                    : '#EF8735';
              return (
                <div
                  key={ds.id}
                  className="p-2.5 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#173C79]">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: dotColor }}
                      />
                      {ds.name}
                    </span>
                    <span className="text-[10px] font-mono text-[#5A6A7E]">
                      {ds.completenessPct}%
                    </span>
                  </div>
                  <div className="text-[11px] text-[#5A6A7E]">{ds.notes}</div>
                </div>
              );
            })}
          </div>
        </MunicipalPanel>

        <MunicipalPanel
          title="Recent Telemetry & System Events"
          icon={<Activity className="w-4 h-4" />}
          className="lg:col-span-5"
        >
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {events.slice(0, 8).map((ev) => (
              <div
                key={ev.id}
                className="p-2.5 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC] space-y-0.5"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                  <span className="font-semibold text-[#173C79]">{ev.category}</span>
                  <span className="text-[#5A6A7E]">{ev.timestamp.split(',').pop()?.trim()}</span>
                </div>
                <div className="text-xs font-semibold text-[#26364A]">{ev.title}</div>
                <div className="text-[11px] text-[#5A6A7E]">{ev.detail}</div>
              </div>
            ))}
          </div>
        </MunicipalPanel>
      </div>
    </div>
  );
}
