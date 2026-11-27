import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { buildNullahLaiTwin, loadRealClippedTwin } from '../engine/nullahLaiTwin';
import { buildMonitoringStations } from '../engine/monitoringStations';
import { runPortfolioOptimizationLocal } from '../engine/optimizer';
import { computeAreaSafetySummary, runScenarioLocal } from '../engine/simulator';
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_ENGINE_MODE,
  pingBackendHealth,
  type EngineMode,
} from '../services/apiClient';
import {
  buildForecastScenario,
  buildScenarioForOutlookDay,
  buildScenarioFromBackendForecast,
  fetchBackendForecast,
} from '../services/forecastService';
import { buildDataSourceHealth, buildModelDiagnostics } from '../services/metricsService';
import { executeOptimization } from '../services/optimizerService';
import { executeSimulation } from '../services/simulationService';
import {
  clearWeatherCache,
  create2001CloudburstWeather,
  createDeterministicFallbackWeather,
  fetchNullahLaiWeather,
} from '../services/weatherService';
import type {
  AreaSafetySummary,
  BackendForecastSummary,
  DataSourceHealth,
  ForecastHorizon,
  ModelDiagnostics,
  MonitoringStation,
  OperationalMode,
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
  operationalMode: OperationalMode;
  setOperationalMode: (mode: OperationalMode) => void;
  activeThresholdMm: number;
  backendForecast: BackendForecastSummary | null;
  forecastHorizon: ForecastHorizon;
  setForecastHorizon: (h: ForecastHorizon) => void;
  twin: TwinGrid;

  weather: WeatherBundle;
  hasLoadedInitialWeather: boolean;
  isSyncingWeather: boolean;
  refreshWeather: () => Promise<void>;
  selectedOutlookDay: number | null;
  setSelectedOutlookDay: (day: number | null) => void;
  demo2001DayOffset: number;
  demo2001Hour: number;
  setDemo2001DayOffset: (dayOffset: number) => void;
  setDemo2001Hour: (hour: number) => void;
  monsoonStressMode: boolean;
  toggleMonsoonStressMode: () => void;
  browserAlertsEnabled: boolean;
  enableBrowserNotifications: () => Promise<void>;
  areaSafetySummary: AreaSafetySummary;

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
  setPitchBudgetPkr: (budgetPkr: number) => void;
  optResult: OptimizationResult | null;
  isOptimizing: boolean;
  isAutoSyncingOpt: boolean;
  isOptStale: boolean;
  optError: string | null;
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
  budgetPkr: 200_000_000,
  enabledTypes: ['retention_pond', 'permeable_surface', 'drainage_upgrade'],
  weights: {
    population: 30,
    buildings: 30,
    roads: 15,
    facilities: 15,
    area: 10,
  },
};

export function FloodForgeProvider({ children }: { children: React.ReactNode }) {
  const [studyAreaId, setStudyAreaId] = useState<StudyAreaId>('nullah_lai_basin');
  const [operationalMode, setOperationalModeState] = useState<OperationalMode>('live_ops');
  const [demo2001DayOffset, setDemo2001DayOffsetState] = useState<number>(7); // 23 Jul 2001
  const [demo2001Hour, setDemo2001HourState] = useState<number>(9); // 09:00 PKT
  const [backendForecast, setBackendForecast] = useState<BackendForecastSummary | null>(null);
  const [forecastHorizon, setForecastHorizon] = useState<ForecastHorizon>(24);
  const [engineMode, setEngineModeState] = useState<EngineMode>(DEFAULT_ENGINE_MODE);
  const manualEngineSelectionRef = useRef<boolean>(false);
  const setEngineMode = useCallback((m: EngineMode) => {
    manualEngineSelectionRef.current = true;
    setEngineModeState(m);
  }, []);
  const [apiUrl, setApiUrl] = useState<string>(DEFAULT_API_BASE_URL);
  const [apiHealthy, setApiHealthy] = useState(false);
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [officialAgencyOverride, setOfficialAgencyOverride] = useState(false);
  const telemetryAbortRef = useRef<AbortController | null>(null);
  const telemetrySeqRef = useRef(0);
  const weatherRefreshAbortRef = useRef<AbortController | null>(null);
  const weatherSeqRef = useRef(0);
  const simAbortRef = useRef<AbortController | null>(null);
  const simSeqRef = useRef(0);

  const [liveWeather, setLiveWeather] = useState<WeatherBundle>(() =>
    createDeterministicFallbackWeather(false)
  );
  const historic2001Weather = useMemo(
    () => create2001CloudburstWeather(demo2001DayOffset, demo2001Hour),
    [demo2001DayOffset, demo2001Hour]
  );
  const activeThresholdMm =
    operationalMode === 'demo_2001' && historic2001Weather.forecast24hMm >= 250
      ? 150
      : 50;
  const [hasLoadedInitialWeather, setHasLoadedInitialWeather] = useState(false);
  const [isSyncingWeather, setIsSyncingWeather] = useState(true);
  const [selectedOutlookDay, setSelectedOutlookDay] = useState<number | null>(null);
  const [monsoonStressMode, setMonsoonStressMode] = useState(false);
  const weather = useMemo<WeatherBundle>(
    () =>
      operationalMode === 'demo_2001' && !monsoonStressMode
        ? historic2001Weather
        : liveWeather,
    [operationalMode, monsoonStressMode, historic2001Weather, liveWeather]
  );
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission === 'granted'
      : false
  );

  const [realBasinTwin, setRealBasinTwin] = useState<TwinGrid | null>(null);
  const twin = useMemo(
    () =>
      studyAreaId === 'nullah_lai_basin' && realBasinTwin
        ? realBasinTwin
        : buildNullahLaiTwin(studyAreaId, 42),
    [studyAreaId, realBasinTwin]
  );

  const [events, setEvents] = useState<SystemEvent[]>([
    {
      id: 'ev-init-1',
      timestamp: formatPktTime(),
      category: 'SYSTEM',
      severity: 'info',
      title: 'FloodForgeAI Basin Twin Initialized',
      detail: '30 m Nullah Lai terrain grid and flow drainage model ready.',
    },
  ]);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'Screening-Level Mode Active',
      message:
        '30 m flood screening model active. Verify operational warnings against PMD & NDMA bulletins.',
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

  const syncBackendTelemetry = useCallback(
    async (externalSignal?: AbortSignal) => {
      telemetryAbortRef.current?.abort();
      const ctrl = new AbortController();
      telemetryAbortRef.current = ctrl;
      const reqSeq = ++telemetrySeqRef.current;

      const onExtAbort = () => ctrl.abort();
      if (externalSignal) {
        if (externalSignal.aborted) ctrl.abort();
        else externalSignal.addEventListener('abort', onExtAbort, { once: true });
      }

      try {
        if (!apiUrl.trim()) {
          if (reqSeq === telemetrySeqRef.current) {
            setApiHealthy(false);
            setApiLatencyMs(null);
            setBackendForecast(null);
          }
          return { ok: false, latencyMs: 0, error: 'Backend URL not configured for static deployment.' };
        }

        const res = await pingBackendHealth(apiUrl, ctrl.signal);
        if (ctrl.signal.aborted || reqSeq !== telemetrySeqRef.current) {
          return { ok: false, latencyMs: res.latencyMs, aborted: true };
        }
        setApiHealthy(res.ok);
        setApiLatencyMs(res.latencyMs);

        if (res.ok) {
          if (!manualEngineSelectionRef.current) {
            setEngineModeState('api');
          }
          try {
            const bf = await fetchBackendForecast(apiUrl, ctrl.signal);
            if (!ctrl.signal.aborted && reqSeq === telemetrySeqRef.current) {
              setBackendForecast(bf);
            }
          } catch (err) {
            if (ctrl.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
              return { ok: false, latencyMs: res.latencyMs, aborted: true };
            }
            if (reqSeq === telemetrySeqRef.current) {
              setBackendForecast(null);
            }
          }
        } else {
          setBackendForecast(null);
        }
        return res;
      } catch (err) {
        if (ctrl.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return { ok: false, latencyMs: 0, aborted: true };
        }
        return {
          ok: false,
          latencyMs: 0,
          error: err instanceof Error ? err.message : 'Backend telemetry check failed',
        };
      } finally {
        if (externalSignal) externalSignal.removeEventListener('abort', onExtAbort);
      }
    },
    [apiUrl]
  );

  const refreshWeather = useCallback(async () => {
    weatherRefreshAbortRef.current?.abort();
    const ctrl = new AbortController();
    weatherRefreshAbortRef.current = ctrl;
    const reqSeq = ++weatherSeqRef.current;

    setIsSyncingWeather(true);
    setMonsoonStressMode(false);
    setSelectedOutlookDay(null);
    try {
      const [bundle] = await Promise.all([
        fetchNullahLaiWeather(true, ctrl.signal),
        apiUrl.trim() ? syncBackendTelemetry(ctrl.signal) : Promise.resolve(null),
      ]);
      if (ctrl.signal.aborted || reqSeq !== weatherSeqRef.current) return;
      setLiveWeather(bundle);
      setHasLoadedInitialWeather(true);
      if (bundle.source === 'OPEN_METEO_LIVE') {
        addEvent(
          'WEATHER',
          bundle.forecastState === 'verified' ? 'success' : 'warning',
          'Open-Meteo Forecast Synchronized',
          `24h=${bundle.forecast24hMm} mm, 72h=${bundle.forecast72hMm} mm, 7d API=${bundle.api7DayMm} mm (${bundle.coveragePct}% coverage).`
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
          bundle.forecastState === 'stale'
            ? `Serving cached archive (${bundle.cacheAgeHours}h old).`
            : 'Weather provider unavailable; deterministic fallback active (not live telemetry).'
        );
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        addEvent('WEATHER', 'warning', 'Weather Sync Failed', 'Unable to refresh weather telemetry.');
      }
    } finally {
      if (reqSeq === weatherSeqRef.current) {
        setIsSyncingWeather(false);
      }
    }
  }, [apiUrl, syncBackendTelemetry, addEvent, pushToast]);

  useEffect(() => {
    let active = true;
    loadRealClippedTwin()
      .then((loaded) => {
        if (!active) return;
        setRealBasinTwin(loaded);
        addEvent(
          'SYSTEM',
          'success',
          'Real Terrain & Infrastructure Data Loaded',
          `Real Terrain & Infrastructure Data Loaded (${loaded.rows}×${loaded.cols} Nullah Lai basin grid: elevation, land cover, buildings, population, roads, hospitals, schools, and zone boundaries).`
        );
      })
      .catch(() => {
        // Keep deterministic synthetic twin fallback seamlessly
      });
    return () => {
      active = false;
    };
  }, [addEvent]);

  useEffect(() => {
    let active = true;
    const ctrl = new AbortController();
    const reqSeq = ++weatherSeqRef.current;
    (async () => {
      setIsSyncingWeather(true);
      try {
        const bundle = await fetchNullahLaiWeather(false, ctrl.signal);
        if (!active || reqSeq !== weatherSeqRef.current) return;
        setLiveWeather(bundle);
      setHasLoadedInitialWeather(true);
        addEvent(
          'WEATHER',
          bundle.forecastState === 'verified' ? 'success' : 'warning',
          bundle.source === 'OPEN_METEO_LIVE'
            ? 'Open-Meteo Live Feed Connected'
            : 'Demonstration Weather Fallback',
          `State: ${bundle.forecastState} (${bundle.coveragePct}% coverage) · 72h total ${bundle.forecast72hMm} mm`
        );
      } catch {
        // aborted on unmount
      } finally {
        if (active && reqSeq === weatherSeqRef.current) {
          setIsSyncingWeather(false);
          setHasLoadedInitialWeather(true);
        }
      }
    })();
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [addEvent]);

  // Debounced backend health & forecast synchronization when API mode or VITE_API_BASE_URL is configured
  useEffect(() => {
    if (engineMode !== 'api' && !import.meta.env.VITE_API_BASE_URL) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      syncBackendTelemetry(ctrl.signal).then((res) => {
        if (ctrl.signal.aborted || !res.ok || 'aborted' in res) return;
        addEvent(
          'SYSTEM',
          'success',
          'Live Simulation Engine Active',
          `System Status: Healthy (${res.latencyMs} ms) — live weather forecast & flood simulation available.`
        );
      });
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [engineMode, syncBackendTelemetry, addEvent]);

  // Genuine active-session telemetry polling (every 15 min while tab is visible in live_ops)
  useEffect(() => {
    if (operationalMode !== 'live_ops') return;
    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshWeather();
    }, 15 * 60_000);
    return () => window.clearInterval(interval);
  }, [operationalMode, refreshWeather]);

  const checkApiHealth = useCallback(async () => {
    const res = await syncBackendTelemetry();
    if ('aborted' in res && res.aborted) return;
    if (res.ok) {
      pushToast('System Status: Healthy', `Live Simulation Engine Reachable (${res.latencyMs} ms).`, 'success');
    } else {
      const errMsg = 'error' in res && res.error ? res.error : undefined;
      pushToast(
        'Backend Unreachable',
        errMsg || 'Using in-browser deterministic screening engine.',
        'warning'
      );
    }
  }, [syncBackendTelemetry, pushToast]);

  const toggleMonsoonStressMode = useCallback(() => {
    const next = !monsoonStressMode;
    setMonsoonStressMode(next);
    if (next) {
      const stress = createDeterministicFallbackWeather(true);
      setLiveWeather(stress);
      if (stress.earliestFloodAlert) {
        setSelectedOutlookDay(stress.earliestFloodAlert.dayOffset);
        // Keep simulated stress-test notice strictly inside dashboard UI; never emit OS/operational notifications
        pushToast(
          '30-Day Monsoon Surge Test Active (Simulated)',
          stress.earliestFloodAlert.summary,
          'warning'
        );
      }
    } else {
      setSelectedOutlookDay(null);
      fetchNullahLaiWeather(false)
        .then((b) => setLiveWeather(b))
        .catch(() => {});
    }
  }, [monsoonStressMode, pushToast]);

  const enableBrowserNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      pushToast(
        'In-App Alerts Active',
        'Browser Notification API unavailable; active-session alerts appear inside the dashboard.',
        'info'
      );
      return;
    }
    const perm =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    const granted = perm === 'granted';
    setBrowserAlertsEnabled(granted);
    if (granted) {
      const isOperationalVerified =
        operationalMode === 'live_ops' &&
        !monsoonStressMode &&
        weather.forecastState === 'verified';
      const hasFull30d =
        isOperationalVerified && weather.outlookSource === 'OPEN_METEO_16D_ENSEMBLE';
      const msg = !isOperationalVerified
        ? 'Active-session alerts enabled. Operational flood alerts trigger only during verified live-forecast sessions.'
        : weather.earliestFloodAlert
          ? weather.earliestFloodAlert.summary
          : hasFull30d
            ? 'All clear across verified 30-day outlook. Session checks refresh every 15 minutes while this tab stays open.'
            : '16-day verified outlook shows no heavy rain (Days 17–30 ensemble coverage incomplete).';
      if (isOperationalVerified && weather.earliestFloodAlert) {
        new Notification('FloodForge AI — Verified Forecast Alert', { body: msg });
      }
      pushToast('Active-Session Alerts Enabled', msg, isOperationalVerified ? 'success' : 'info');
    } else {
      pushToast(
        'Notification Permission Denied',
        'Enable notifications in browser settings for active-session desktop alerts while this tab is open.',
        'warning'
      );
    }
  }, [
    operationalMode,
    monsoonStressMode,
    weather.forecastState,
    weather.outlookSource,
    weather.earliestFloodAlert,
    pushToast,
  ]);

  // Mitigation Optimizer & Equity Audit (defined before mode scenario wiring)
  const [optConfig, setOptConfig] = useState<OptimizationConfig>(DEFAULT_OPT_CONFIG);
  const [optResult, setOptResult] = useState<OptimizationResult | null>(() => ({
    ...runPortfolioOptimizationLocal(
      buildNullahLaiTwin('nullah_lai_basin', 42),
      {
        rainfall_mm_per_hr: 0.5,
        duration_hr: 1,
        budget_pkr: DEFAULT_OPT_CONFIG.budgetPkr,
        threshold_mm: 50,
        antecedent_wetness: 'normal',
        uncertainty_factor: 1.0,
        tag: 'LIVE_FORECAST',
      },
      DEFAULT_OPT_CONFIG
    ),
    engineSource: 'local_d8',
    provenance: 'SIMULATED',
  }));
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isAutoSyncingOpt, setIsAutoSyncingOpt] = useState(false);
  const [isOptStale, setIsOptStale] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);
  const [optProgressStage, setOptProgressStage] = useState('');
  const manualOptSeqRef = useRef(0);
  const manualOptAbortRef = useRef<AbortController | null>(null);
  const autoOptSeqRef = useRef(0);
  const autoOptAbortRef = useRef<AbortController | null>(null);
  const appliedOptEpochRef = useRef(0);
  const hasUserInteractedWithRoiRef = useRef(false);

  const setPitchBudgetPkr = useCallback((budgetPkr: number) => {
    hasUserInteractedWithRoiRef.current = true;
    const clamped = Math.min(300_000_000, Math.max(50_000_000, Math.round(budgetPkr)));
    setOptConfig((prev) => (prev.budgetPkr === clamped ? prev : { ...prev, budgetPkr: clamped }));
  }, []);

  const setDemo2001DayOffset = useCallback((dayOffset: number) => {
    hasUserInteractedWithRoiRef.current = true;
    setSelectedOutlookDay(null);
    setMonsoonStressMode(false);
    setDemo2001DayOffsetState(Math.max(0, Math.min(11, Math.round(dayOffset))));
  }, []);

  const setDemo2001Hour = useCallback((hour: number) => {
    hasUserInteractedWithRoiRef.current = true;
    setSelectedOutlookDay(null);
    setMonsoonStressMode(false);
    setDemo2001HourState(Math.max(0, Math.min(23, Math.round(hour))));
  }, []);

  const setOperationalMode = useCallback(
    (mode: OperationalMode) => {
      hasUserInteractedWithRoiRef.current = true;
      setOperationalModeState(mode);
      setSelectedOutlookDay(null);
      setMonsoonStressMode(false);
      if (mode === 'live_ops') {
        if (monsoonStressMode) {
          fetchNullahLaiWeather(false).then((b) => setLiveWeather(b));
        }
        if (engineMode === 'api' || import.meta.env.VITE_API_BASE_URL) {
          void syncBackendTelemetry();
        }
        addEvent(
          'SYSTEM',
          'info',
          'Switched to Live Operations Mode',
          'Using live forecast telemetry and 50 mm flood cutoff.'
        );
      } else {
        setDemo2001DayOffsetState(7);
        setDemo2001HourState(9);
        addEvent(
          'SYSTEM',
          'warning',
          'Switched to 2001 Emergency Demo Mode',
          'Loaded July 2001 Historic Weather Time Machine (default: 23 Jul 2001, 09:00 PKT — 620 mm / 10h cloudburst).'
        );
      }
    },
    [monsoonStressMode, syncBackendTelemetry, addEvent]
  );

  // Operational scenario: 2001 Time-Machine treated dynamically like live weather, OR Live Operations forecast
  const operationalScenario = useMemo<Scenario>(() => {
    if (selectedOutlookDay !== null) {
      const targetDay = weather.outlook30d.find((d) => d.dayOffset === selectedOutlookDay);
      if (targetDay) {
        return {
          ...buildScenarioForOutlookDay(targetDay, weather, optConfig.budgetPkr, {
            operationalMode,
            monsoonStressMode,
          }),
          threshold_mm: activeThresholdMm,
        };
      }
    }
    if (operationalMode === 'demo_2001') {
      if (demo2001DayOffset === 7 && demo2001Hour <= 15 && !monsoonStressMode) {
        return {
          rainfall_mm_per_hr: 62,
          duration_hr: 10,
          budget_pkr: optConfig.budgetPkr,
          threshold_mm: 150,
          antecedent_wetness: 'saturated',
          uncertainty_factor: 1.0,
          tag: 'HYPOTHETICAL_STRESS_TEST',
          label: '2001 Cloudburst (620 mm / 10h · 150 mm cutoff)',
        };
      }
      return {
        ...buildForecastScenario(weather, forecastHorizon, optConfig.budgetPkr, 'LIVE_FORECAST'),
        tag: 'HYPOTHETICAL_STRESS_TEST',
        threshold_mm: activeThresholdMm,
      };
    }
    if (
      engineMode === 'api' &&
      apiHealthy &&
      backendForecast &&
      !monsoonStressMode &&
      backendForecast.forecast_status !== 'unavailable' &&
      (!backendForecast.fetched_at_utc ||
        (Date.now() - new Date(backendForecast.fetched_at_utc).getTime()) / 3600_000 <= 12)
    ) {
      return buildScenarioFromBackendForecast(
        backendForecast,
        optConfig.budgetPkr,
        forecastHorizon
      );
    }
    return {
      ...buildForecastScenario(weather, forecastHorizon, optConfig.budgetPkr, 'LIVE_FORECAST'),
      threshold_mm: 50,
    };
  }, [
    operationalMode,
    demo2001DayOffset,
    demo2001Hour,
    activeThresholdMm,
    optConfig.budgetPkr,
    selectedOutlookDay,
    weather,
    engineMode,
    apiHealthy,
    backendForecast,
    monsoonStressMode,
    forecastHorizon,
  ]);

  // Optimizer always evaluates the active operational scenario (no synthetic storm when Live Ops has zero flood risk)
  const optimizerDesignScenario = operationalScenario;

  const highEnvelopeScenario = useMemo(
    () => ({
      ...buildForecastScenario(
        weather,
        forecastHorizon,
        optConfig.budgetPkr,
        'UNCERTAINTY_ENVELOPE'
      ),
      threshold_mm: activeThresholdMm,
    }),
    [weather, forecastHorizon, optConfig.budgetPkr, activeThresholdMm]
  );

  const operationalResult = useMemo(() => {
    if (
      operationalMode === 'demo_2001' &&
      demo2001DayOffset === 7 &&
      demo2001Hour <= 15 &&
      !monsoonStressMode &&
      selectedOutlookDay === null &&
      optResult &&
      optResult.baselineResult.scenario_tag === 'HYPOTHETICAL_STRESS_TEST' &&
      optResult.baselineResult.metrics.exposed_area_km2 >= 4.0
    ) {
      return optResult.baselineResult;
    }
    return runScenarioLocal(
      twin,
      operationalScenario,
      { interventions: [] },
      undefined,
      officialAgencyOverride
    );
  }, [
    operationalMode,
    demo2001DayOffset,
    demo2001Hour,
    monsoonStressMode,
    selectedOutlookDay,
    optResult,
    twin,
    operationalScenario,
    officialAgencyOverride,
  ]);

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
    rainfall_mm_per_hr: 62,
    duration_hr: 10,
    budget_pkr: 200_000_000,
    threshold_mm: 150,
    antecedent_wetness: 'saturated',
    uncertainty_factor: 1.0,
    tag: 'HYPOTHETICAL_STRESS_TEST',
    label: '2001 Cloudburst (620 mm / 10h)',
  });
  const [isSimulating, setIsSimulating] = useState(false);
  const [hasCustomSimRun, setHasCustomSimRun] = useState(true);
  const [simBaselineResult, setSimBaselineResult] = useState<SimResult>(() =>
    runScenarioLocal(
      buildNullahLaiTwin('nullah_lai_basin', 42),
      {
        rainfall_mm_per_hr: 18,
        duration_hr: 4,
        budget_pkr: 200_000_000,
        threshold_mm: 50,
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
        rainfall_mm_per_hr: 62,
        duration_hr: 10,
        budget_pkr: 200_000_000,
        threshold_mm: 150,
        antecedent_wetness: 'saturated',
        uncertainty_factor: 1.0,
        tag: 'HYPOTHETICAL_STRESS_TEST',
      },
      { interventions: [] }
    )
  );

  const simScenarioRef = useRef(simScenario);
  simScenarioRef.current = simScenario;

  // Re-run simulation baseline when studyArea or operational baseline changes
  useEffect(() => {
    setSimBaselineResult(operationalResult);
    setSimActiveResult(
      runScenarioLocal(
        twin,
        simScenarioRef.current,
        { interventions: [] },
        operationalResult,
        officialAgencyOverride
      )
    );
  }, [twin, operationalResult, officialAgencyOverride]);

  const runCloudburstSimulation = useCallback(
    async (custom?: Scenario) => {
      simAbortRef.current?.abort();
      const ctrl = new AbortController();
      simAbortRef.current = ctrl;
      const reqId = ++simSeqRef.current;

      const target = custom ?? simScenario;
      if (custom) setSimScenario(custom);
      setIsSimulating(true);
      try {
        const base = operationalResult;
        const { result, usedFallback } = await executeSimulation(
          engineMode,
          apiUrl,
          twin,
          target,
          { interventions: [] },
          base,
          officialAgencyOverride,
          ctrl.signal
        );
        if (ctrl.signal.aborted || reqId !== simSeqRef.current) return;
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
      } catch (err) {
        if (!(ctrl.signal.aborted || (err instanceof DOMException && err.name === 'AbortError'))) {
          pushToast('Simulation Failed', 'Unable to execute cloudburst scenario.', 'warning');
        }
      } finally {
        if (reqId === simSeqRef.current) {
          setIsSimulating(false);
        }
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

  // Reactively recompute mitigation portfolio on full configuration/storm changes with bounded LRU cache
  const designRain = optimizerDesignScenario.rainfall_mm_per_hr;
  const designDur = optimizerDesignScenario.duration_hr;
  const designWetness = optimizerDesignScenario.antecedent_wetness ?? 'normal';
  const designUncertainty = optimizerDesignScenario.uncertainty_factor ?? 1.0;
  const enabledTypesKey = useMemo(
    () => [...optConfig.enabledTypes].sort().join(','),
    [optConfig.enabledTypes]
  );
  const weightsKey = `${optConfig.weights.population},${optConfig.weights.buildings},${optConfig.weights.roads},${optConfig.weights.facilities},${optConfig.weights.area}`;
  const optMemoCacheRef = useRef<Map<string, OptimizationResult>>(new Map());
  const setBoundedOptCache = useCallback((key: string, val: OptimizationResult) => {
    const cache = optMemoCacheRef.current;
    if (cache.has(key)) cache.delete(key);
    cache.set(key, val);
    while (cache.size > 16) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
      else break;
    }
  }, []);

  useEffect(() => {
    if (studyAreaId === 'nullah_lai_basin' && !realBasinTwin) return;
    if (optConfig.enabledTypes.length === 0) {
      autoOptAbortRef.current?.abort();
      ++autoOptSeqRef.current;
      setIsAutoSyncingOpt(false);
      setIsOptStale(true);
      setOptError('Select at least one intervention type to update mitigation metrics.');
      return;
    }

    const effectiveMode: EngineMode =
      engineMode === 'api' &&
      !hasUserInteractedWithRoiRef.current &&
      operationalMode === 'live_ops'
        ? 'local'
        : engineMode;
    const effectiveUrlKey = effectiveMode === 'api' ? apiUrl.trim() : '';
    const cacheKey = `${twin.studyAreaId}:${twin.rows}:${realBasinTwin ? 'real' : 'syn'}:${operationalMode}:${forecastHorizon}:${selectedOutlookDay ?? 'cur'}:${designRain}:${designDur}:${designWetness}:${designUncertainty}:${activeThresholdMm}:${optConfig.budgetPkr}:${enabledTypesKey}:${weightsKey}:${effectiveMode}:${effectiveUrlKey}:${officialAgencyOverride}`;

    const cached = optMemoCacheRef.current.get(cacheKey);
    if (cached) {
      optMemoCacheRef.current.delete(cacheKey);
      optMemoCacheRef.current.set(cacheKey, cached);
      autoOptAbortRef.current?.abort();
      ++autoOptSeqRef.current;
      ++appliedOptEpochRef.current;
      setOptResult(cached);
      setIsOptStale(false);
      setOptError(null);
      setIsAutoSyncingOpt(false);
      return;
    }

    let active = true;
    autoOptAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    autoOptAbortRef.current = abortCtrl;
    const reqId = ++autoOptSeqRef.current;
    const startEpoch = ++appliedOptEpochRef.current;

    setIsOptStale(true);
    setOptError(null);
    setIsAutoSyncingOpt(true);

    const timer = setTimeout(() => {
      if (!active || reqId !== autoOptSeqRef.current) return;
      executeOptimization(
        effectiveMode,
        apiUrl,
        twin,
        optimizerDesignScenario,
        optConfig,
        officialAgencyOverride,
        abortCtrl.signal
      )
        .then((res) => {
          if (!active || abortCtrl.signal.aborted || reqId !== autoOptSeqRef.current) return;
          setBoundedOptCache(cacheKey, res.result);
          if (startEpoch >= appliedOptEpochRef.current) {
            appliedOptEpochRef.current = startEpoch;
            setOptResult(res.result);
            setIsOptStale(false);
            setOptError(null);
          }
        })
        .catch((err) => {
          if (active && !(abortCtrl.signal.aborted || (err instanceof DOMException && err.name === 'AbortError'))) {
            setIsOptStale(true);
            setOptError(err instanceof Error ? err.message : 'Optimization request failed.');
          }
        })
        .finally(() => {
          if (reqId === autoOptSeqRef.current) {
            setIsAutoSyncingOpt(false);
          }
        });
    }, 100);
    return () => {
      active = false;
      abortCtrl.abort();
      clearTimeout(timer);
      if (reqId === autoOptSeqRef.current) {
        setIsAutoSyncingOpt(false);
      }
    };
  }, [
    studyAreaId,
    twin,
    realBasinTwin,
    operationalMode,
    forecastHorizon,
    selectedOutlookDay,
    designRain,
    designDur,
    designWetness,
    designUncertainty,
    activeThresholdMm,
    optConfig,
    optimizerDesignScenario,
    enabledTypesKey,
    weightsKey,
    engineMode,
    apiUrl,
    officialAgencyOverride,
    setBoundedOptCache,
  ]);

  const runOptimization = useCallback(
    async (overrideConfig?: OptimizationConfig) => {
      const cfg = overrideConfig ?? optConfig;
      if (cfg.enabledTypes.length === 0) {
        setIsOptStale(true);
        setOptError('Select at least one intervention type before optimizing.');
        pushToast(
          'Validation Error',
          'Select at least one intervention type before optimizing.',
          'warning'
        );
        return;
      }

      manualOptAbortRef.current?.abort();
      autoOptAbortRef.current?.abort();
      const ctrl = new AbortController();
      manualOptAbortRef.current = ctrl;
      const reqId = ++manualOptSeqRef.current;
      const runEpoch = ++appliedOptEpochRef.current;

      setIsOptimizing(true);
      setIsOptStale(true);
      setOptError(null);
      setOptProgressStage('Evaluating D8 screening & multi-budget Pareto frontier...');

      try {
        const designStorm: Scenario = {
          ...optimizerDesignScenario,
          budget_pkr: cfg.budgetPkr,
        };
        const { result, usedFallback } = await executeOptimization(
          engineMode,
          apiUrl,
          twin,
          designStorm,
          cfg,
          officialAgencyOverride,
          ctrl.signal
        );
        if (ctrl.signal.aborted || reqId !== manualOptSeqRef.current) return;
        if (runEpoch >= appliedOptEpochRef.current) {
          appliedOptEpochRef.current = runEpoch;
          setOptResult(result);
          setIsOptStale(false);
          setOptError(null);
        }

        const cEnabledKey = [...cfg.enabledTypes].sort().join(',');
        const cWeightsKey = `${cfg.weights.population},${cfg.weights.buildings},${cfg.weights.roads},${cfg.weights.facilities},${cfg.weights.area}`;
        const cUrlKey = engineMode === 'api' ? apiUrl.trim() : '';
        const cacheKey = `${twin.studyAreaId}:${twin.rows}:${realBasinTwin ? 'real' : 'syn'}:${operationalMode}:${forecastHorizon}:${selectedOutlookDay ?? 'cur'}:${designRain}:${designDur}:${designWetness}:${designUncertainty}:${activeThresholdMm}:${cfg.budgetPkr}:${cEnabledKey}:${cWeightsKey}:${engineMode}:${cUrlKey}:${officialAgencyOverride}`;
        setBoundedOptCache(cacheKey, result);

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
      } catch (err) {
        if (!(ctrl.signal.aborted || (err instanceof DOMException && err.name === 'AbortError'))) {
          setIsOptStale(true);
          const msg = err instanceof Error ? err.message : 'Unable to complete optimization run.';
          setOptError(msg);
          pushToast('Optimization Failed', msg, 'warning');
        }
      } finally {
        if (reqId === manualOptSeqRef.current) {
          setIsOptimizing(false);
          setOptProgressStage('');
        }
      }
    },
    [
      optConfig,
      optimizerDesignScenario,
      engineMode,
      apiUrl,
      twin,
      realBasinTwin,
      operationalMode,
      forecastHorizon,
      selectedOutlookDay,
      designRain,
      designDur,
      designWetness,
      designUncertainty,
      activeThresholdMm,
      officialAgencyOverride,
      setBoundedOptCache,
      addEvent,
      pushToast,
    ]
  );

  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  const monitoringStations = useMemo(
    () => buildMonitoringStations(twin, operationalResult, weather, operationalScenario),
    [twin, operationalResult, weather, operationalScenario]
  );

  const areaSafetySummary = useMemo(
    () => computeAreaSafetySummary(twin, operationalResult, monitoringStations),
    [twin, operationalResult, monitoringStations]
  );

  const dataSources = useMemo(
    () => buildDataSourceHealth(weather, engineMode, apiHealthy),
    [weather, engineMode, apiHealthy]
  );

  const modelDiagnostics = useMemo(
    () =>
      buildModelDiagnostics(
        twin,
        simActiveResult,
        optResult,
        Boolean(realBasinTwin) || (engineMode === 'api' && apiHealthy)
      ),
    [twin, simActiveResult, optResult, realBasinTwin, engineMode, apiHealthy]
  );

  const resetWeatherCache = useCallback(() => {
    clearWeatherCache();
    pushToast('Cache Cleared', 'Cleared archived Open-Meteo browser cache.', 'info');
  }, [pushToast]);

  const value: FloodForgeContextValue = {
    studyAreaId,
    setStudyAreaId,
    operationalMode,
    setOperationalMode,
    activeThresholdMm,
    backendForecast,
    forecastHorizon,
    setForecastHorizon,
    twin,
    weather,
    hasLoadedInitialWeather,
    isSyncingWeather,
    refreshWeather,
    selectedOutlookDay,
    setSelectedOutlookDay,
    demo2001DayOffset,
    demo2001Hour,
    setDemo2001DayOffset,
    setDemo2001Hour,
    monsoonStressMode,
    toggleMonsoonStressMode,
    browserAlertsEnabled,
    enableBrowserNotifications,
    areaSafetySummary,
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
    setPitchBudgetPkr,
    optResult,
    isOptimizing,
    isAutoSyncingOpt,
    isOptStale,
    optError,
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
