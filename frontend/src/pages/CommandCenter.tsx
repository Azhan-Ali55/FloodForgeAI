import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  MapPin,
  ShieldAlert,
  Sun,
  Thermometer,
  Waves,
  Wind,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GeospatialMap } from '../components/maps/GeospatialMap';
import {
  MunicipalPanel,
  ScenarioTagBadge,
  StationRiskBadge,
} from '../components/ui/Primitives';
import { useFloodForge } from '../context/FloodForgeContext';
import { computeFloodRiskIndex } from '../engine/monitoringStations';
import { PILOT_CONFIG, STATION_RISK_META } from '../engine/pilotConfig';
import { extractTopHotspots } from '../engine/simulator';
import type {
  ForecastHorizon,
  MapLayerVisibility,
  StationRiskLevel,
  StudyAreaId,
} from '../types/floodforge';
import { cn } from '../utils/cn';

function WeatherConditionIcon({ code }: { code: number | null }) {
  if (code === null) return <Cloud className="w-5 h-5 text-[#5A6A7E]" />;
  if (code === 0) return <Sun className="w-5 h-5 text-[#EF8735]" />;
  if (code <= 2) return <CloudSun className="w-5 h-5 text-[#EF8735]" />;
  if (code >= 95) return <CloudLightning className="w-5 h-5 text-[#D94343]" />;
  if (code >= 51) return <CloudRain className="w-5 h-5 text-[#244D8F]" />;
  return <Cloud className="w-5 h-5 text-[#5A6A7E]" />;
}

export function CommandCenter() {
  const {
    studyAreaId,
    setStudyAreaId,
    forecastHorizon,
    setForecastHorizon,
    twin,
    weather,
    operationalScenario,
    operationalResult,
    highEnvelopeResult,
    monitoringStations,
    selectedStationId,
    setSelectedStationId,
    optResult,
  } = useFloodForge();

  const operationalHotspots = useMemo(
    () => extractTopHotspots(twin, operationalResult, 6),
    [twin, operationalResult]
  );

  const [forecastDaysOption, setForecastDaysOption] = useState<3 | 5>(3);
  const [layers, setLayers] = useState<MapLayerVisibility>({
    flood_risk: true,
    rainfall: false,
    elevation: false,
    population: false,
    waterway: true,
    roads: true,
    buildings: false,
    facilities: false,
    stations: true,
    interventions: false,
    neighborhoods: true,
  });

  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
  } | null>(null);

  const toggleLayer = (key: keyof MapLayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Weather Forecast chart data (3-day = 72h or 5-day = 120h)
  const forecastHours = forecastDaysOption === 3 ? 72 : 120;
  const forecastChartSeries = useMemo(() => {
    const step = forecastDaysOption === 3 ? 3 : 6;
    return weather.hourlyForecast
      .slice(0, forecastHours)
      .filter((_, idx) => idx % step === 0)
      .map((h) => ({
        hour: `+${h.hourOffset}h`,
        label: h.label.replace(',', ''),
        temp: h.temperatureC,
        rain: h.precipitationMm,
        wind: h.windSpeedKmh,
      }));
  }, [weather.hourlyForecast, forecastHours, forecastDaysOption]);

  const dailySummaryCards = useMemo(
    () => weather.dailyForecast5d.slice(0, forecastDaysOption),
    [weather.dailyForecast5d, forecastDaysOption]
  );

  // Water-level / runoff trend across key monitoring stations (ordered North -> South)
  const stationWaterTrend = useMemo(() => {
    return [...monitoringStations]
      .sort((a, b) => a.row - b.row)
      .slice(0, 8)
      .map((s) => ({
        code: s.stationCode,
        name: s.name,
        levelM: s.waterLevelM ?? 0,
        risk: s.riskLevel,
      }));
  }, [monitoringStations]);

  const peakWaterLevelM = useMemo(() => {
    if (monitoringStations.length === 0) return 0;
    return Math.max(...monitoringStations.map((s) => s.waterLevelM ?? 0));
  }, [monitoringStations]);

  const avgWaterLevelM = useMemo(() => {
    if (monitoringStations.length === 0) return 0;
    return (
      monitoringStations.reduce((sum, s) => sum + (s.waterLevelM ?? 0), 0) /
      monitoringStations.length
    );
  }, [monitoringStations]);

  // Flood Risk Index & Classification
  const riskSummary = useMemo(
    () => computeFloodRiskIndex(operationalResult, monitoringStations),
    [operationalResult, monitoringStations]
  );

  // Envelope delta (uncertainty range upper bound vs operational baseline)
  const levelDeltaM = useMemo(() => {
    const baseArea = operationalResult.metrics.exposed_area_km2;
    const highArea = highEnvelopeResult.metrics.exposed_area_km2;
    const diffPct = baseArea > 0 ? ((highArea - baseArea) / baseArea) * 100 : 0;
    return Number(diffPct.toFixed(1));
  }, [operationalResult.metrics.exposed_area_km2, highEnvelopeResult.metrics.exposed_area_km2]);

  // Active alerts built directly from real hotspots + critical/high stations
  const activeAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      title: string;
      location: string;
      riskLevel: StationRiskLevel;
      timestamp: string;
      description: string;
      lat: number;
      lon: number;
      stationId?: string;
    }> = [];

    for (const st of monitoringStations) {
      if (st.riskLevel === 'Critical' || st.riskLevel === 'High') {
        alerts.push({
          id: `st-${st.id}`,
          title:
            st.riskLevel === 'Critical'
              ? `Critical Runoff Threshold — ${st.stationCode}`
              : `Elevated Water Level — ${st.stationCode}`,
          location: `${st.name} (${st.location})`,
          riskLevel: st.riskLevel,
          timestamp: st.lastUpdated.split(',').pop()?.trim() ?? st.lastUpdated,
          description: `Modeled D8 proxy ${st.waterLevelM?.toFixed(2)} m (${st.modeledAccumulationMm.toFixed(0)} mm) at ${st.elevationM} m elevation.`,
          lat: st.lat,
          lon: st.lon,
          stationId: st.id,
        });
      }
    }

    for (const hs of operationalHotspots) {
      if (hs.riskTier === 'Warning' || hs.riskTier === 'Watch' || hs.riskTier === 'Emergency') {
        alerts.push({
          id: `hs-${hs.zoneId}`,
          title: `Ward Flood Hotspot #${hs.rank}`,
          location: `${hs.zoneName} (${hs.sector})`,
          riskLevel: hs.riskTier === 'Watch' ? 'High' : 'Critical',
          timestamp: operationalResult.timestamp_pkt.split(',').pop()?.trim() ?? '',
          description: `Peak modeled accumulation ${hs.peakAccumulationMm} mm affecting ~${hs.exposedPopulation.toLocaleString()} residents.`,
          lat: hs.lat,
          lon: hs.lon,
        });
      }
    }

    if (alerts.length === 0) {
      alerts.push({
        id: 'baseline-clear',
        title: 'Basin Monitoring Normal',
        location: PILOT_CONFIG.studyAreas[studyAreaId].shortName,
        riskLevel: 'Low',
        timestamp: weather.fetchedAtPkt.split(',').pop()?.trim() ?? '',
        description: 'No monitoring stations exceed screening runoff alert thresholds.',
        lat: PILOT_CONFIG.studyAreas[studyAreaId].center[0],
        lon: PILOT_CONFIG.studyAreas[studyAreaId].center[1],
      });
    }

    const order: Record<StationRiskLevel, number> = {
      Critical: 0,
      High: 1,
      Moderate: 2,
      Low: 3,
    };
    return alerts.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]).slice(0, 6);
  }, [monitoringStations, operationalHotspots, operationalResult.timestamp_pkt, studyAreaId, weather.fetchedAtPkt]);

  const activeWarningCount = activeAlerts.filter(
    (a) => a.riskLevel === 'High' || a.riskLevel === 'Critical'
  ).length;

  const isLiveWeather = weather.source === 'OPEN_METEO_LIVE';

  const handleStationJump = (stationId: string, lat: number, lon: number) => {
    setSelectedStationId(stationId);
    setFocusTarget({ lat, lon, zoom: 14 });
  };

  return (
    <div className="space-y-3">
      {/* Three-Column Municipal Monitoring Grid:
          Desktop (xl): 3-col (Left 3 / Center 6 / Right 3)
          Tablet (md): 2-col (Center Map 7 / Right Risk 5, Left Weather full below)
          Mobile: 1-col vertical stack */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
        {/* LEFT COLUMN — Weather & Environmental Monitoring */}
        <div className="md:col-span-12 xl:col-span-3 space-y-3.5 order-2 xl:order-1">
          {/* Weather Forecast Panel */}
          <MunicipalPanel
            title="Weather Forecast"
            icon={<CloudSun className="w-4 h-4" />}
            rightSlot={
              <div className="flex items-center rounded-sm bg-[#244D8F] p-0.5 text-[10px] font-semibold">
                {([3, 5] as const).map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setForecastDaysOption(days)}
                    className={cn(
                      'px-2 py-0.5 rounded-sm transition-colors cursor-pointer',
                      forecastDaysOption === days
                        ? 'bg-white text-[#173C79]'
                        : 'text-white/85 hover:text-white'
                    )}
                  >
                    {days}-Day
                  </button>
                ))}
              </div>
            }
          >
            <div className="space-y-3">
              {/* Weather condition indicator strip */}
              <div
                className={cn(
                  'grid gap-1.5',
                  forecastDaysOption === 5
                    ? 'grid-cols-2 sm:grid-cols-5 xl:grid-cols-2'
                    : 'grid-cols-3 sm:grid-cols-3 xl:grid-cols-3'
                )}
              >
                {dailySummaryCards.map((d) => (
                  <div
                    key={d.dateLabel}
                    className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC] text-center space-y-1"
                  >
                    <div className="text-[10px] font-semibold text-[#173C79] truncate">
                      {d.dateLabel}
                    </div>
                    <div className="flex justify-center">
                      <WeatherConditionIcon code={d.weatherCode} />
                    </div>
                    <div className="text-[11px] font-mono font-bold text-[#26364A]">
                      {d.maxTempC !== null ? `${d.maxTempC.toFixed(0)}°` : '—'}
                      <span className="text-[#5A6A7E] font-normal">
                        /{d.minTempC !== null ? `${d.minTempC.toFixed(0)}°` : '—'}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#244D8F]">
                      {d.rainfallMm} mm
                    </div>
                  </div>
                ))}
              </div>

              {/* Temperature Forecast Chart */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#26364A] mb-1">
                  <span className="flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5 text-[#EF8735]" />
                    Temperature Forecast (°C)
                  </span>
                  <span className="font-mono text-[10px] text-[#5A6A7E]">
                    {forecastDaysOption}d horizon
                  </span>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecastChartSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: '#5A6A7E', fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={26} />
                      <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                      <Area
                        type="monotone"
                        dataKey="temp"
                        name="Temp (°C)"
                        stroke="#EF8735"
                        fill="#EF8735"
                        fillOpacity={0.18}
                        strokeWidth={1.8}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Rainfall Forecast Chart */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#26364A] mb-1">
                  <span className="flex items-center gap-1">
                    <CloudRain className="w-3.5 h-3.5 text-[#244D8F]" />
                    Rainfall Forecast (mm/h)
                  </span>
                  <span className="font-mono text-[10px] text-[#244D8F]">
                    {forecastDaysOption === 3
                      ? `${weather.forecast72hMm.toFixed(1)} mm`
                      : `${weather.forecast120hMm.toFixed(1)} mm`}
                  </span>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={forecastChartSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: '#5A6A7E', fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={26} />
                      <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                      <Bar dataKey="rain" name="Rainfall (mm)" fill="#244D8F" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Wind-Speed Chart */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#26364A] mb-1">
                  <span className="flex items-center gap-1">
                    <Wind className="w-3.5 h-3.5 text-[#55A85F]" />
                    Wind Speed Forecast (km/h)
                  </span>
                </div>
                <div className="h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecastChartSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: '#5A6A7E', fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={26} />
                      <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                      <Line
                        type="monotone"
                        dataKey="wind"
                        name="Wind (km/h)"
                        stroke="#55A85F"
                        strokeWidth={1.8}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </MunicipalPanel>

          {/* Environmental Conditions Panel */}
          <MunicipalPanel
            title="Environmental Conditions"
            icon={<Thermometer className="w-4 h-4" />}
            rightSlot={
              <span className="text-[10px] font-mono text-white/85">
                {weather.currentWeather.conditionLabel}
              </span>
            }
          >
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[10px] text-[#5A6A7E]">Current Rainfall</div>
                  <div className="text-sm font-bold font-mono text-[#173C79]">
                    {weather.currentWeather.precipitationMm !== null
                      ? `${weather.currentWeather.precipitationMm.toFixed(1)} mm/h`
                      : 'Data unavailable'}
                  </div>
                </div>
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[10px] text-[#5A6A7E]">Air Temperature</div>
                  <div className="text-sm font-bold font-mono text-[#26364A]">
                    {weather.currentWeather.temperatureC !== null
                      ? `${weather.currentWeather.temperatureC.toFixed(1)} °C`
                      : 'Data unavailable'}
                  </div>
                </div>
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[10px] text-[#5A6A7E]">Relative Humidity</div>
                  <div className="text-sm font-bold font-mono text-[#26364A]">
                    {weather.currentWeather.humidityPct !== null
                      ? `${weather.currentWeather.humidityPct}%`
                      : 'Data unavailable'}
                  </div>
                </div>
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="text-[10px] text-[#5A6A7E]">Wind Speed</div>
                  <div className="text-sm font-bold font-mono text-[#26364A]">
                    {weather.currentWeather.windSpeedKmh !== null
                      ? `${weather.currentWeather.windSpeedKmh.toFixed(1)} km/h`
                      : 'Data unavailable'}
                  </div>
                </div>
              </div>

              {/* Historical 7-day Rainfall */}
              <div className="pt-2 border-t border-[#E6EAEF]">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-[#26364A]">
                    Historical Rainfall (7-Day)
                  </span>
                  <span className="font-mono text-[10px] text-[#173C79]">
                    Total: {weather.past7DayTotalMm} mm · API₇ {weather.api7DayMm} mm
                  </span>
                </div>
                <div className="h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weather.past7DaysDaily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: '#5A6A7E', fontSize: 9 }} />
                      <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={24} />
                      <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                      <Bar dataKey="rainfallMm" name="Past Rain (mm)" fill="#55A85F" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </MunicipalPanel>

          {/* Water Monitoring Panel */}
          <MunicipalPanel
            title="Water Monitoring"
            icon={<Waves className="w-4 h-4" />}
            rightSlot={
              <span className="text-[10px] font-mono text-white/85">
                {monitoringStations.length} Stations
              </span>
            }
          >
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
                    <Droplets className="w-3 h-3 text-[#244D8F]" />
                    Water Temp
                  </div>
                  <div className="text-xs font-mono font-semibold text-[#5A6A7E] mt-0.5">
                    Data unavailable
                  </div>
                </div>
                <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                  <div className="flex items-center gap-1 text-[10px] text-[#5A6A7E]">
                    <Waves className="w-3 h-3 text-[#173C79]" />
                    Drainage Level (D8)
                  </div>
                  <div className="text-xs font-mono font-bold text-[#173C79] mt-0.5">
                    Peak {peakWaterLevelM.toFixed(2)} m · Avg {avgWaterLevelM.toFixed(2)} m
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-[#26364A]">
                    Station Corridor Profile (N → S)
                  </span>
                  <span className="text-[10px] font-mono text-[#5A6A7E]">m (proxy)</span>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stationWaterTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EAEF" vertical={false} />
                      <XAxis dataKey="code" tick={{ fill: '#5A6A7E', fontSize: 9 }} />
                      <YAxis tick={{ fill: '#5A6A7E', fontSize: 9 }} width={26} />
                      <Tooltip contentStyle={{ fontSize: 11, borderColor: '#CBD5E1' }} />
                      <Bar dataKey="levelM" name="Runoff Level Proxy (m)" radius={[2, 2, 0, 0]}>
                        {stationWaterTrend.map((entry) => (
                          <Cell
                            key={entry.code}
                            fill={STATION_RISK_META[entry.risk].hex}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </MunicipalPanel>
        </div>

        {/* CENTER COLUMN — Main Interactive Geographical Map */}
        <div className="md:col-span-7 xl:col-span-6 space-y-2.5 order-1 xl:order-2">
          <MunicipalPanel
            title="Nullah Lai Basin — Environmental & Flood Risk Map"
            icon={<MapPin className="w-4 h-4" />}
            bodyClassName="p-2.5 space-y-2.5"
            rightSlot={<ScenarioTagBadge tag={operationalScenario.tag} />}
          >
            {/* Compact Map Toolbar: Study Area + Forecast Horizon */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E6EAEF]">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Study area selector"
                  value={studyAreaId}
                  onChange={(e) => {
                    setSelectedStationId(null);
                    setStudyAreaId(e.target.value as StudyAreaId);
                  }}
                  className="px-2.5 py-1 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] text-xs font-semibold text-[#173C79] focus:outline-none focus:border-[#173C79]"
                >
                  {Object.values(PILOT_CONFIG.studyAreas).map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>

                <div className="flex items-center rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] p-0.5">
                  {([24, 48, 72] as ForecastHorizon[]).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setForecastHorizon(h)}
                      className={cn(
                        'px-2 py-0.5 rounded-sm text-[11px] font-mono font-semibold transition-colors cursor-pointer',
                        forecastHorizon === h
                          ? 'bg-[#173C79] text-white'
                          : 'text-[#5A6A7E] hover:text-[#173C79]'
                      )}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-[11px] text-[#5A6A7E] font-medium">
                Click any circular station marker for live telemetry popup
              </span>
            </div>

            {/* Central Interactive Green Municipal Map */}
            <GeospatialMap
              twin={twin}
              simResult={operationalResult}
              scenario={operationalScenario}
              stations={monitoringStations}
              selectedStationId={selectedStationId}
              onSelectStation={setSelectedStationId}
              interventions={optResult?.selectedPortfolio ?? []}
              layers={layers}
              onToggleLayer={toggleLayer}
              focusTarget={focusTarget}
              heightClass="h-[460px] sm:h-[540px] xl:h-[670px]"
            />

            {/* Quick Station Selector Strip below Map */}
            <div className="pt-1">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E] mb-1.5">
                <span>Monitoring Stations ({monitoringStations.length})</span>
                <span className="font-mono">
                  {isLiveWeather ? 'Open-Meteo Synced' : 'Offline Fallback'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {monitoringStations.map((st) => {
                  const meta = STATION_RISK_META[st.riskLevel];
                  const active = st.id === selectedStationId;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleStationJump(st.id, st.lat, st.lon)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border text-[11px] transition-colors cursor-pointer',
                        active
                          ? 'bg-[#173C79] text-white border-[#173C79] font-semibold'
                          : 'bg-[#F5F6F7] text-[#26364A] border-[#D6DCE4] hover:border-[#173C79]'
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: meta.hex }}
                      />
                      <span>{st.stationCode}</span>
                      <span className="hidden sm:inline truncate max-w-[115px]">
                        {st.name.split(' ')[0]} {st.name.split(' ')[1] ?? ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </MunicipalPanel>
        </div>

        {/* RIGHT COLUMN — Flood Risk & Alert Monitoring */}
        <div className="md:col-span-5 xl:col-span-3 space-y-3.5 order-3">
          {/* Current Flood Risk Panel */}
          <MunicipalPanel
            title="Current Flood Risk"
            icon={<Gauge className="w-4 h-4" />}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 p-2.5 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E]">
                    Flood Risk Index
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-3xl font-bold font-mono text-[#173C79]">
                      {riskSummary.index}
                    </span>
                    <span className="text-xs font-mono text-[#5A6A7E]">/ 100</span>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <StationRiskBadge level={riskSummary.classification} size="md" />
                  <div className="text-[10px] text-[#5A6A7E]">
                    Tier: {operationalResult.alert_tier}
                  </div>
                </div>
              </div>

              {/* 4-Color Risk Indicators */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5A6A7E] mb-1.5">
                  Risk Classification Scale
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(['Low', 'Moderate', 'High', 'Critical'] as StationRiskLevel[]).map(
                    (lvl) => {
                      const m = STATION_RISK_META[lvl];
                      const active = riskSummary.classification === lvl;
                      return (
                        <div
                          key={lvl}
                          className={cn(
                            'px-1.5 py-1 rounded-sm border text-center text-[10px] font-semibold transition-all',
                            active ? 'ring-2 ring-[#173C79] shadow-xs' : 'opacity-75'
                          )}
                          style={{
                            backgroundColor: m.bgHex,
                            borderColor: m.borderHex,
                            color: m.textHex,
                          }}
                        >
                          {lvl}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="divide-y divide-[#E6EAEF] text-xs pt-1">
                <div className="py-1.5 flex items-center justify-between">
                  <span className="text-[#5A6A7E]">Affected Monitoring Zones</span>
                  <span className="font-mono font-bold text-[#26364A]">
                    {riskSummary.affectedZonesEstimate} / {twin.zone_meta.length}
                  </span>
                </div>
                <div className="py-1.5 flex items-center justify-between">
                  <span className="text-[#5A6A7E]">Active Flood Warnings</span>
                  <span className="font-mono font-bold text-[#D94343]">
                    {activeWarningCount}
                  </span>
                </div>
                <div className="py-1.5 flex items-center justify-between">
                  <span className="text-[#5A6A7E]">Last Data Update</span>
                  <span className="font-mono text-[11px] text-[#26364A]">
                    {weather.fetchedAtPkt}
                  </span>
                </div>
              </div>
            </div>
          </MunicipalPanel>

          {/* Monitoring Statistics Compact Cards */}
          <MunicipalPanel
            title="Monitoring Statistics"
            icon={<Activity className="w-4 h-4" />}
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">Current Rainfall</div>
                <div className="text-sm font-bold font-mono text-[#173C79] mt-0.5">
                  {weather.currentWeather.precipitationMm !== null
                    ? `${weather.currentWeather.precipitationMm.toFixed(1)} mm/h`
                    : 'Data unavailable'}
                </div>
              </div>
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">Peak Water Level (D8)</div>
                <div className="text-sm font-bold font-mono text-[#26364A] mt-0.5">
                  {peakWaterLevelM.toFixed(2)} m
                </div>
              </div>
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">Envelope Area Delta</div>
                <div className="text-sm font-bold font-mono text-[#EF8735] mt-0.5">
                  +{levelDeltaM}%
                </div>
              </div>
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">24h Peak Intensity</div>
                <div className="text-sm font-bold font-mono text-[#244D8F] mt-0.5">
                  {weather.peakHourlyMm.toFixed(1)} mm/h
                </div>
              </div>
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">Rain / Flood Prob.</div>
                <div className="text-sm font-bold font-mono text-[#26364A] mt-0.5">
                  {weather.maxProbabilityPct}%
                </div>
              </div>
              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC]">
                <div className="text-[10px] text-[#5A6A7E]">Active Alerts</div>
                <div className="text-sm font-bold font-mono text-[#D94343] mt-0.5">
                  {activeAlerts.length}
                </div>
              </div>
            </div>
          </MunicipalPanel>

          {/* Active Alerts Panel */}
          <MunicipalPanel
            title="Active Flood & Station Alerts"
            icon={<ShieldAlert className="w-4 h-4" />}
            rightSlot={
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-white/15 text-white">
                {activeAlerts.length} Active
              </span>
            }
          >
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-0.5">
              {activeAlerts.map((al) => {
                const meta = STATION_RISK_META[al.riskLevel];
                return (
                  <button
                    key={al.id}
                    type="button"
                    onClick={() => {
                      if (al.stationId) {
                        handleStationJump(al.stationId, al.lat, al.lon);
                      } else {
                        setFocusTarget({ lat: al.lat, lon: al.lon, zoom: 15 });
                      }
                    }}
                    className="w-full text-left p-2.5 rounded-sm bg-[#FFFFFF] hover:bg-[#F5F6F7] border border-[#D6DCE4] transition-colors space-y-1 cursor-pointer"
                    style={{ borderLeftWidth: '4px', borderLeftColor: meta.hex }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-[#173C79] leading-snug">
                        {al.title}
                      </span>
                      <StationRiskBadge level={al.riskLevel} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-[#5A6A7E]">
                      <span className="font-medium truncate">{al.location}</span>
                      <span className="font-mono flex-shrink-0">{al.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-[#26364A] leading-snug">
                      {al.description}
                    </p>
                  </button>
                );
              })}

              <div className="p-2 rounded-sm bg-[#F5F6F7] border border-[#E2E6EC] flex items-start gap-1.5 text-[10px] text-[#5A6A7E]">
                <AlertTriangle className="w-3.5 h-3.5 text-[#EF8735] flex-shrink-0 mt-0.5" />
                <span>
                  Click any alert to center the map. Screening-level 30 m D8 outputs are for municipal planning support only.
                </span>
              </div>
            </div>
          </MunicipalPanel>
        </div>
      </div>
    </div>
  );
}
