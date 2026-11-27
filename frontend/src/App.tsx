import { Suspense, lazy } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { FloodForgeProvider } from './context/FloodForgeContext';
import { CommandCenter } from './pages/CommandCenter';

const EquityImpact = lazy(() =>
  import('./pages/EquityImpact').then((m) => ({ default: m.EquityImpact }))
);
const FloodPrediction = lazy(() =>
  import('./pages/FloodPrediction').then((m) => ({ default: m.FloodPrediction }))
);
const IntelligenceMap = lazy(() =>
  import('./pages/IntelligenceMap').then((m) => ({ default: m.IntelligenceMap }))
);
const LiveMonitoring = lazy(() =>
  import('./pages/LiveMonitoring').then((m) => ({ default: m.LiveMonitoring }))
);
const MitigationOptimizer = lazy(() =>
  import('./pages/MitigationOptimizer').then((m) => ({ default: m.MitigationOptimizer }))
);
const ModelHealth = lazy(() =>
  import('./pages/ModelHealth').then((m) => ({ default: m.ModelHealth }))
);
const NotFound = lazy(() =>
  import('./pages/NotFound').then((m) => ({ default: m.NotFound }))
);
const Reports = lazy(() =>
  import('./pages/Reports').then((m) => ({ default: m.Reports }))
);
const Settings = lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Settings }))
);

const isLocalPreview =
  typeof window !== 'undefined' &&
  (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');

function RouteFallback() {
  return (
    <div className="py-12 text-center text-xs font-medium text-[#64748B]">
      Loading workspace view...
    </div>
  );
}

export function App() {
  return (
    <FloodForgeProvider>
      <BrowserRouter>
        <AppShell>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<CommandCenter />} />
              <Route path="/map" element={<IntelligenceMap />} />
              <Route path="/forecast" element={<FloodPrediction defaultFocus="forecast" />} />
              <Route path="/simulation" element={<FloodPrediction defaultFocus="simulation" />} />
              <Route path="/mitigation" element={<MitigationOptimizer />} />
              <Route path="/reports" element={<Reports />} />
              {/* Legacy route aliases preserved */}
              <Route path="/prediction" element={<FloodPrediction defaultFocus="forecast" />} />
              <Route path="/optimizer" element={<MitigationOptimizer />} />
              <Route path="/equity" element={<EquityImpact />} />
              <Route path="/monitoring" element={<LiveMonitoring />} />
              <Route path="/health" element={<ModelHealth />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AppShell>
        {!isLocalPreview && <Analytics />}
      </BrowserRouter>
    </FloodForgeProvider>
  );
}

export default App;
