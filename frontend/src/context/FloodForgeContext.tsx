import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { buildNullahLaiTwin } from '../engine/nullahLaiTwin';
import { buildMonitoringStations } from '../engine/monitoringStations';
import { runScenarioLocal } from '../engine/simulator';
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_ENGINE_MODE,
  pingBackendHealth,
  type EngineMode,
} from '../services/apiClient';
import { buildForecastScenario } from '../services/forecastService';
import { buildDataSourceHealth, buildModelDiagnostics } from '../services/metricsService';
import { executeOptimization } from '../services/optimizerService';
import { executeSimulation } from '../services/simulationService';
import {
  clearWeatherCache,
  createDeterministicFallbackWeather,
  fetchNullahLaiWeather,
} from '../services/weatherService';
import type {
  DataSourceHealth,
  ForecastHorizon,
  ModelDiagnostics,
  MonitoringStation,
  OptimizationConfig,
  OptimizationResult,
  Scenario,
  SimResult,
  StudyAreaId,
  SystemEvent,
  TwinGrid,
  WeatherBundle,
} from '../types/floodforge';
import { formatPktTime } from '../utils/formatters';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  timestamp: string;
  read: boolean;
}

interface FloodForgeContextValue {
  studyAreaId: StudyAreaId;
  setStudyAreaId: (id: StudyAreaId) => void;
  forecastHorizon: ForecastHorizon;
  setForecastHorizon: (h: ForecastHorizon) => void;
  twin: TwinGrid;

  weather: WeatherBundle;
  isSyncingWeather: boolean;
  refreshWeather: () => Promise<void>;

  operationalScenario: Scenario;
  operationalResult: SimResult;
  highEnvelopeResult: SimResult;

  // Cloudburst / Hypothetical Simulator state
  simScenario: Scenario;
  setSimScenario: React.Dispatch<React.SetStateAction<Scenario>>;
  simBaselineResult: SimResult;
  simActiveResult: SimResult;
  isSimulating: boolean;
  hasCustomSimRun: boolean;
  runCloudburstSimulation: (custom?: Scenario) => Promise<void>;

  // Optimizer & Equity state
  optConfig: OptimizationConfig;
  setOptConfig: React.Dispatch<React.SetStateAction<OptimizationConfig>>;
  optResult: OptimizationResult | null;
  isOptimizing: boolean;
  optProgressStage: string;
  runOptimization: (overrideConfig?: OptimizationConfig) => Promise<void>;

  // Diagnostics & Events
  monitoringStations: MonitoringStation[];
  selectedStationId: string | null;
  setSelectedStationId: (id: string | null) => void;
  dataSources: DataSourceHealth[];
  modelDiagnostics: ModelDiagnostics;
  events: SystemEvent[];
  notifications: NotificationItem[];
  markAllNotificationsRead: () => void;
  pushToast: (title: string, message: string, severity?: NotificationItem['severity']) => void;
  activeToasts: NotificationItem[];
  dismissToast: (id: string) => void;

  // Settings / API integration
  engineMode: EngineMode;
  setEngineMode: (m: EngineMode) => void;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  apiHealthy: boolean;
  apiLatencyMs: number | null;
  checkApiHealth: () => Promise<void>;
  officialAgencyOverride: boolean;
  setOfficialAgencyOverride: (v: boolean) => void;
  resetWeatherCache: () => void;
}

const FloodForgeContext = createContext<FloodForgeContextValue | null>(null);

const DEFAULT_OPT_CONFIG: OptimizationConfig = {
  budgetPkr: 100_000_000,
  enabledTypes: ['retention_pond', 'permeable_surface', 'drainage_upgrade'],
  weights: {
    population: 30,
    buildings: 30,
    roads: 15,
    facilities: 15,
    area: 10,
  },
};

const baselineOptCache = new Map<StudyAreaId, OptimizationResult>();

export function FloodForgeProvider({ children }: { children: React.ReactNode }) {
  const [studyAreaId, setStudyAreaId] = useState<StudyAreaId>('nullah_lai_basin');
  const [forecastHorizon, setForecastHorizon] = useState<ForecastHorizon>(24);
  const [engineMode, setEngineMode] = useState<EngineMode>(DEFAULT_ENGINE_MODE);
  const [apiUrl, setApiUrl] = useState<string>(DEFAULT_API_BASE_URL);
  const [apiHealthy, setApiHealthy] = useState(false);
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [officialAgencyOverride, setOfficialAgencyOverride] = useState(false);

  const [weather, setWeather] = useState<WeatherBundle>(() =>
    createDeterministicFallbackWeather()
  );
  const [isSyncingWeather, setIsSyncingWeather] = useState(false);

  const twin = useMemo(() => buildNullahLaiTwin(studyAreaId, 42), [studyAreaId]);

  const [events, setEvents] = useState<SystemEvent[]>([
    {
      id: 'ev-init-1',
      timestamp: formatPktTime(),
      category: 'SYSTEM',
      severity: 'info',
      title: 'FloodForgeAI Basin Twin Initialized',
      detail: '30 m EPSG:32643 Nullah Lai screening grid and D8 topological DAG ready.',
    },
  ]);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'Screening-Level Mode Active',
      message:
        '30 m D8 runoff screening model active. Verify operational warnings against PMD & NDMA bulletins.',
      severity: 'info',
      timestamp: formatPktTime(),
      read: false,
    },
  ]);

  const [activeToasts, setActiveToasts] = useState<NotificationItem[]>([]);

  const addEvent = useCallback(
    (
      category: SystemEvent['category'],
      severity: SystemEvent['severity'],
      title: string,
      detail: string
    ) => {
      setEvents((prev) => [
        {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: formatPktTime(),
          category,
          severity,
          title,
          detail,
        },
        ...prev.slice(0, 24),
      ]);
    },
    []
  );

  const pushToast = useCallback(
    (
      title: string,
      message: string,
      severity: NotificationItem['severity'] = 'info'
    ) => {
      const item: NotificationItem = {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        title,
        message,
        severity,
        timestamp: formatPktTime(),
        read: false,
      };
      setNotifications((prev) => [item, ...prev.slice(0, 19)]);
      setActiveToasts((prev) => [item, ...prev.slice(0, 2)]);
      setTimeout(() => {
        setActiveToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const refreshWeather = useCallback(async () => {
    setIsSyncingWeather(true);
    try {
      const bundle = await fetchNullahLaiWeather(true);
      setWeather(bundle);
      if (bundle.source === 'OPEN_METEO_LIVE') {
        addEvent(
          'WEATHER',
          'success',
          'Open-Meteo Forecast Synchronized',
          `24h=${bundle.forecast24hMm} mm, 72h=${bundle.forecast72hMm} mm, 7d API=${bundle.api7DayMm} mm.`
        );
        pushToast(
          'Weather Telemetry Synced',
          `Live Open-Meteo data loaded for Nullah Lai (24h: ${bundle.forecast24hMm} mm).`,
          'success'
        );
      } else {
        addEvent(
          'WEATHER',
          'warning',
          'Weather API Fallback Active',
          'Serving deterministic/cached rainfall profile; live Open-Meteo unreachable.'
        );
      }
    } finally {
      setIsSyncingWeather(false);
    }
  }, [addEvent, pushToast]);

  useEffect(() => {
    let active = true;
    (async () => {
      setIsSyncingWeather(true);
      const bundle = await fetchNullahLaiWeather(false);
      if (!active) return;
      setWeather(bundle);
      setIsSyncingWeather(false);
      addEvent(
        'WEATHER',
        bundle.source === 'OPEN_METEO_LIVE' ? 'success' : 'warning',
        bundle.source === 'OPEN_METEO_LIVE'
          ? 'Open-Meteo Live Feed Connected'
          : 'Demonstration Weather Fallback',
        `Source: ${bundle.source} · 72h total ${bundle.forecast72hMm} mm`
      );
    })();
    return () => {
      active = false;
    };
  }, [addEvent]);

  const checkApiHealth = useCallback(async () => {
    const res = await pingBackendHealth(apiUrl);
    setApiHealthy(res.ok);
    setApiLatencyMs(res.latencyMs);
    if (res.ok) {
      pushToast('Backend Connected', `Python API healthy (${res.latencyMs} ms).`, 'success');
    } else {
      pushToast(
        'Backend Unreachable',
        res.error || 'Using in-browser deterministic screening engine.',
        'warning'
      );
    }
  }, [apiUrl, pushToast]);

  // Operational scenario derived from live weather + forecast horizon
  const operationalScenario = useMemo(
    () => buildForecastScenario(weather, forecastHorizon, 100_000_000, 'LIVE_FORECAST'),
    [weather, forecastHorizon]
  );

  const highEnvelopeScenario = useMemo(
    () =>
      buildForecastScenario(
        weather,
        forecastHorizon,
        100_000_000,
        'UNCERTAINTY_ENVELOPE'
      ),
    [weather, forecastHorizon]
  );

  const operationalResult = useMemo(
    () =>
      runScenarioLocal(
        twin,
        operationalScenario,
        { interventions: [] },
        undefined,
        officialAgencyOverride
      ),
    [twin, operationalScenario, officialAgencyOverride]
  );

  const highEnvelopeResult = useMemo(
    () =>
      runScenarioLocal(
        twin,
        highEnvelopeScenario,
        { interventions: [] },
        undefined,
        officialAgencyOverride
      ),
    [twin, highEnvelopeScenario, officialAgencyOverride]
  );

  // Cloudburst / Hypothetical Scenario Simulator
  const [simScenario, setSimScenario] = useState<Scenario>({
    rainfall_mm_per_hr: 72,
    duration_hr: 3,
    budget_pkr: 100_000_000,
    antecedent_wetness: 'wet',
    uncertainty_factor: 1.0,
    tag: 'HYPOTHETICAL_STRESS_TEST',
    label: 'Monsoon Cloudburst Stress Test',
  });
  const [isSimulating, setIsSimulating] = useState(false);
  const [hasCustomSimRun, setHasCustomSimRun] = useState(true);
  const [simBaselineResult, setSimBaselineResult] = useState<SimResult>(() =>
    runScenarioLocal(
      buildNullahLaiTwin('nullah_lai_basin', 42),
      {
        rainfall_mm_per_hr: 40,
        duration_hr: 2.5,
        budget_pkr: 100_000_000,
        antecedent_wetness: 'normal',
        uncertainty_factor: 1.0,
        tag: 'LIVE_FORECAST',
      },
      { interventions: [] }
    )
  );
  const [simActiveResult, setSimActiveResult] = useState<SimResult>(() =>
    runScenarioLocal(
      buildNullahLaiTwin('nullah_lai_basin', 42),
      {
        rainfall_mm_per_hr: 72,
        duration_hr: 3,
        budget_pkr: 100_000_000,
        antecedent_wetness: 'wet',
        uncertainty_factor: 1.0,
        tag: 'HYPOTHETICAL_STRESS_TEST',
      },
      { interventions: [] }
    )
  );

  // Re-run simulation baseline when studyArea changes
  useEffect(() => {
    setSimBaselineResult(operationalResult);
    setSimActiveResult(
      runScenarioLocal(
        twin,
        simScenario,
        { interventions: [] },
        operationalResult,
        officialAgencyOverride
      )
    );
  }, [twin, operationalResult, officialAgencyOverride]); // eslint-disable-line react-hooks/exhaustive-deps

  const runCloudburstSimulation = useCallback(
    async (custom?: Scenario) => {
      const target = custom ?? simScenario;
      if (custom) setSimScenario(custom);
      setIsSimulating(true);
      await new Promise((r) => setTimeout(r, 260));
      try {
        const base = operationalResult;
        const { result, usedFallback } = await executeSimulation(
          engineMode,
          apiUrl,
          twin,
          target,
          { interventions: [] },
          base,
          officialAgencyOverride
        );
        setSimBaselineResult(base);
        setSimActiveResult(result);
        setHasCustomSimRun(true);
        addEvent(
          'SIMULATION',
          result.alert_tier === 'Warning' || result.alert_tier === 'Emergency'
            ? 'warning'
            : 'info',
          `Simulation Executed (${target.tag})`,
          `${target.rainfall_mm_per_hr} mm/hr × ${target.duration_hr} hr → ${result.metrics.exposed_area_km2} km² exposed (${result.runtime_ms} ms${usedFallback ? ', local fallback' : ''}).`
        );
        pushToast(
          'Flood Simulation Complete',
          `Modeled ${result.metrics.exposed_area_km2} km² exposed · Risk Tier: ${result.alert_tier}.`,
          result.alert_tier === 'Warning' ? 'warning' : 'success'
        );
      } finally {
        setIsSimulating(false);
      }
    },
    [
      simScenario,
      operationalResult,
      engineMode,
      apiUrl,
      twin,
      officialAgencyOverride,
      addEvent,
      pushToast,
    ]
  );

  // Mitigation Optimizer & Equity Audit
  const [optConfig, setOptConfig] = useState<OptimizationConfig>(DEFAULT_OPT_CONFIG);
  const [optResult, setOptResult] = useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optProgressStage, setOptProgressStage] = useState('');

  // Run initial baseline optimization asynchronously after initial paint so dashboard loads immediately
  useEffect(() => {
    const cached = baselineOptCache.get(twin.studyAreaId);
    if (cached) {
      setOptResult(cached);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      executeOptimization(
        'local',
        apiUrl,
        twin,
        simScenario,
        optConfig,
        officialAgencyOverride
      ).then((res) => {
        if (!active) return;
        baselineOptCache.set(twin.studyAreaId, res.result);
        setOptResult(res.result);
      });
    }, 50);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [twin]); // eslint-disable-line react-hooks/exhaustive-deps

  const runOptimization = useCallback(
    async (overrideConfig?: OptimizationConfig) => {
      const cfg = overrideConfig ?? optConfig;
      if (cfg.enabledTypes.length === 0) {
        pushToast(
          'Validation Error',
          'Select at least one intervention type before optimizing.',
          'warning'
        );
        return;
      }
      setIsOptimizing(true);
      setOptProgressStage('Generating spatial candidate sites across 12 wards...');
      await new Promise((r) => setTimeout(r, 150));
      setOptProgressStage('Evaluating surrogate pre-screening & D8 routing...');
      await new Promise((r) => setTimeout(r, 160));
      setOptProgressStage('Computing multi-budget Pareto frontier & zone equity audit...');

      try {
        const designStorm: Scenario = {
          ...simScenario,
          budget_pkr: cfg.budgetPkr,
        };
        const { result, usedFallback } = await executeOptimization(
          engineMode,
          apiUrl,
          twin,
          designStorm,
          cfg,
          officialAgencyOverride
        );
        setOptResult(result);
        addEvent(
          'OPTIMIZER',
          result.equityStatus === 'RISK_TRANSFER_CONCERN' ? 'warning' : 'success',
          'Portfolio Optimization Completed',
          `${result.selectedPortfolio.length} interventions (${result.utilizationPct}% budget) → -${result.weightedReductionPct}% weighted exposure${usedFallback ? ' (local fallback)' : ''}.`
        );
        addEvent(
          'EQUITY',
          result.equityStatus === 'RISK_TRANSFER_CONCERN' ? 'warning' : 'success',
          'Zone Risk-Transfer Audit Updated',
          `Status: ${result.equityStatus.replace(/_/g, ' ')}.`
        );
        pushToast(
          'Portfolio Optimized',
          `Selected ${result.selectedPortfolio.length} sites achieving ${result.weightedReductionPct}% weighted exposure reduction.`,
          'success'
        );
      } finally {
        setIsOptimizing(false);
        setOptProgressStage('');
      }
    },
    [optConfig, simScenario, engineMode, apiUrl, twin, officialAgencyOverride, addEvent, pushToast]
  );

  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  const monitoringStations = useMemo(
    () => buildMonitoringStations(twin, operationalResult, weather, operationalScenario),
    [twin, operationalResult, weather, operationalScenario]
  );

  const dataSources = useMemo(
    () => buildDataSourceHealth(weather, engineMode, apiHealthy),
    [weather, engineMode, apiHealthy]
  );

  const modelDiagnostics = useMemo(
    () => buildModelDiagnostics(twin, simActiveResult, optResult),
    [twin, simActiveResult, optResult]
  );

  const resetWeatherCache = useCallback(() => {
    clearWeatherCache();
    pushToast('Cache Cleared', 'Cleared archived Open-Meteo browser cache.', 'info');
  }, [pushToast]);

  const value: FloodForgeContextValue = {
    studyAreaId,
    setStudyAreaId,
    forecastHorizon,
    setForecastHorizon,
    twin,
    weather,
    isSyncingWeather,
    refreshWeather,
    operationalScenario,
    operationalResult,
    highEnvelopeResult,
    simScenario,
    setSimScenario,
    simBaselineResult,
    simActiveResult,
    isSimulating,
    hasCustomSimRun,
    runCloudburstSimulation,
    optConfig,
    setOptConfig,
    optResult,
    isOptimizing,
    optProgressStage,
    runOptimization,
    monitoringStations,
    selectedStationId,
    setSelectedStationId,
    dataSources,
    modelDiagnostics,
    events,
    notifications,
    markAllNotificationsRead,
    pushToast,
    activeToasts,
    dismissToast,
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
  };

  return (
    <FloodForgeContext.Provider value={value}>
      {children}
    </FloodForgeContext.Provider>
  );
}

export function useFloodForge() {
  const ctx = useContext(FloodForgeContext);
  if (!ctx) {
    throw new Error('useFloodForge must be used within FloodForgeProvider');
  }
  return ctx;
}
