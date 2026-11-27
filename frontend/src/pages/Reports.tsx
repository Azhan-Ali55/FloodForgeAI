import { useState } from 'react';
import { Activity, Download, Printer, Scale, Sliders } from 'lucide-react';
import { useFloodForge } from '../context/FloodForgeContext';
import { formatSoilMoistureStatus } from '../services/forecastService';
import { cn } from '../utils/cn';
import { downloadMitigationReportCsv } from '../utils/reportExport';
import { EquityImpact } from './EquityImpact';
import { MitigationOptimizer } from './MitigationOptimizer';
import { ModelHealth } from './ModelHealth';

type ReportTab = 'optimizer' | 'equity' | 'diagnostics';

export function Reports() {
  const [tab, setTab] = useState<ReportTab>('optimizer');
  const {
    operationalMode,
    weather,
    backendForecast,
    activeThresholdMm,
    optResult,
    pushToast,
  } = useFloodForge();

  const soilMoisture = formatSoilMoistureStatus(
    weather,
    operationalMode === 'demo_2001' ? null : backendForecast
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D6DCE4] rounded p-2 flex flex-wrap items-center justify-between gap-2 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'optimizer', label: 'Mitigation Portfolio Report', icon: Sliders },
              { id: 'equity', label: 'Zone Equity & Risk-Transfer Audit', icon: Scale },
              { id: 'diagnostics', label: 'Model & Data Diagnostics', icon: Activity },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors cursor-pointer',
                  active
                    ? 'bg-[#173C79] text-white'
                    : 'text-[#26364A] hover:bg-[#F5F6F7]'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          {optResult && (
            <button
              type="button"
              onClick={() => {
                downloadMitigationReportCsv({
                  modeLabel:
                    operationalMode === 'demo_2001'
                      ? '2001 Cloudburst Weather Replay'
                      : 'Live Operations Forecast',
                  timestampPkt: weather.fetchedAtPkt,
                  thresholdMm: activeThresholdMm,
                  soilMoistureLabel: soilMoisture.combinedLabel,
                  optResult,
                  weather,
                });
                pushToast(
                  'Report Downloaded',
                  'Exported full budget, population, buildings & zone equity report (CSV).',
                  'success'
                );
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-[#EEF3FA] hover:bg-[#173C79] hover:text-white border border-[#173C79]/35 text-[#173C79] text-xs font-semibold cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Report (CSV)
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-[#F5F6F7] hover:bg-[#EEF3FA] border border-[#D6DCE4] text-[#26364A] text-xs font-semibold cursor-pointer transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Brief
          </button>
        </div>
      </div>

      {tab === 'optimizer' && <MitigationOptimizer />}
      {tab === 'equity' && <EquityImpact />}
      {tab === 'diagnostics' && <ModelHealth />}
    </div>
  );
}
