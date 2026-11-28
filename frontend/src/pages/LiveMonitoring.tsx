import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CloudRain,
  Droplets,
  MapPin,
  RefreshCw,
  Thermometer,
  Wind,
} from 'lucide-react';
import {
  MunicipalPanel,
  PageHeader,
  StatCard,
  StationRiskBadge,
} from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { formatSoilMoistureStatus } from '../services/forecastService';
import { cn } from '../utils/cn';
import { formatCoord } from '../utils/formatters';

export function LiveMonitoring() {
  const navigate = useNavigate();
  const {
    operationalMode,
    weather,
    backendForecast,
    isSyncingWeather,
    refreshWeather,
    monitoringStations,
    setSelectedStationId,
  } = useFloodForge();

  const soilMoisture = useMemo(
    () =>
      formatSoilMoistureStatus(
        weather,
        operationalMode === 'demo_2001' ? null : backendForecast
      ),
    [weather, operationalMode, backendForecast]
  );

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
      <PageHeader
        title="Live Environmental & Station Telemetry"
        subtitle="Real-time meteorological feed and Nullah Lai corridor monitoring status."
        rightSlot={
          <button
            type="button"
            onClick={() => refreshWeather()}
            disabled={isSyncingWeather}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-[#12345B] hover:bg-[#12345B] text-white text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isSyncingWeather && 'animate-spin')} />
            Refresh Telemetry
          </button>
        }
      />

      {/* Top Current Weather & Station Risk Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard
          label="Current Rainfall"
          icon={<CloudRain className="w-3.5 h-3.5 text-[#12345B]" />}
          tone="primary"
          value={
            <span className="text-lg">
              {weather.currentWeather.precipitationMm !== null
                ? `${weather.currentWeather.precipitationMm.toFixed(1)} mm/h`
                : 'Unavailable'}
            </span>
          }
        />
        <StatCard
          label="Air Temperature"
          icon={<Thermometer className="w-3.5 h-3.5 text-[#EF8735]" />}
          value={
            <span className="text-lg">
              {weather.currentWeather.temperatureC !== null
                ? `${weather.currentWeather.temperatureC.toFixed(1)} °C`
                : 'Unavailable'}
            </span>
          }
        />
        <StatCard
          label="Wind Speed"
          icon={<Wind className="w-3.5 h-3.5 text-[#55A85F]" />}
          value={
            <span className="text-lg">
              {weather.currentWeather.windSpeedKmh !== null
                ? `${weather.currentWeather.windSpeedKmh.toFixed(1)} km/h`
                : 'Unavailable'}
            </span>
          }
        />
        <StatCard
          label="Soil Moisture (0–9 cm)"
          icon={<Droplets className="w-3.5 h-3.5 text-[#12345B]" />}
          tone="primary"
          value={<span className="text-sm">{soilMoisture.combinedLabel}</span>}
        />
        <StatCard
          label="Low / Moderate"
          tone="success"
          value={
            <span className="text-lg">
              {statusSummary.Low + statusSummary.Moderate} / {monitoringStations.length}
            </span>
          }
        />
        <StatCard
          label="High / Critical"
          tone={statusSummary.High + statusSummary.Critical > 0 ? 'danger' : 'neutral'}
          value={
            <span className="text-lg">
              {statusSummary.High + statusSummary.Critical} / {monitoringStations.length}
            </span>
          }
        />
      </div>

      {/* Monitoring Stations Table */}
      <MunicipalPanel
        title="Nullah Lai Monitoring Stations & Hydrometric Nodes"
        icon={<MapPin className="w-4 h-4" />}
        rightSlot={
          <span className="text-xs font-mono text-[#64748B]">
            Updated: {weather.fetchedAtPkt}
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F1F6FB] text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                <th className="py-2 px-2.5">Station</th>
                <th className="py-2 px-2.5">Location</th>
                <th className="py-2 px-2.5">Coordinates</th>
                <th className="py-2 px-2.5 text-right">Rainfall</th>
                <th className="py-2 px-2.5 text-right">Est. Water Depth</th>
                <th className="py-2 px-2.5 text-right">Air Temp</th>
                <th className="py-2 px-2.5 text-right">Wind</th>
                <th className="py-2 px-2.5">Risk</th>
                <th className="py-2 px-2.5">Status</th>
                <th className="py-2 px-2.5 text-right">Map</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6EAEF] text-xs">
              {monitoringStations.map((st) => (
                <tr key={st.id} className="hover:bg-[#F1F6FB]/70">
                  <td className="py-2.5 px-2.5">
                    <div className="font-semibold text-[#12345B]">{st.name}</div>
                    <div className="text-[10px] font-mono text-[#64748B]">{st.stationCode}</div>
                  </td>
                  <td className="py-2.5 px-2.5 text-[#10223D]">
                    <div>{st.location}</div>
                    <div className="text-[10px] text-[#64748B]">{st.sector}</div>
                  </td>
                  <td className="py-2.5 px-2.5 font-mono text-[11px] text-[#64748B]">
                    {formatCoord(st.lat, st.lon)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-[#10223D]">
                    {st.rainfallMmHr !== null ? `${st.rainfallMmHr.toFixed(1)} mm/h` : 'Unavailable'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-[#12345B]">
                    {st.waterLevelM !== null ? `${st.waterLevelM.toFixed(2)} m` : 'Unavailable'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-[#10223D]">
                    {st.temperatureC !== null ? `${st.temperatureC.toFixed(1)} °C` : 'Unavailable'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-[#10223D]">
                    {st.windSpeedKmh !== null ? `${st.windSpeedKmh.toFixed(1)} km/h` : 'Unavailable'}
                  </td>
                  <td className="py-2.5 px-2.5">
                    <StationRiskBadge level={st.riskLevel} />
                  </td>
                  <td className="py-2.5 px-2.5 text-[11px] font-medium text-[#10223D]">
                    {st.operationalStatus}
                  </td>
                  <td className="py-2.5 px-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleInspectOnMap(st.id)}
                      className="px-2 py-1 rounded-sm bg-[#EEF3FA] hover:bg-[#12345B] text-[#12345B] hover:text-white text-[11px] font-semibold border border-[#12345B]/30 transition-colors cursor-pointer"
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
    </div>
  );
}
