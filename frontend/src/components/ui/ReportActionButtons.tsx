import { Download, FileBarChart2, Printer } from 'lucide-react';
import { useFloodForge } from '../../context/FloodForgeContext';
import { formatSoilMoistureStatus } from '../../services/forecastService';
import { downloadMitigationReportCsv } from '../../utils/reportExport';
import { Tooltip } from './Tooltip';

/**
 * Reusable report export and navigation toolbar shared between Dashboard and Reports views.
 */
export function ReportActionButtons({
  onOpenFullReport,
  compact = false,
  activeTab,
}: {
  onOpenFullReport?: () => void;
  compact?: boolean;
  activeTab?: 'optimizer' | 'equity' | 'diagnostics';
}) {
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

  const handleDownloadCsv = () => {
    if (!optResult) return;
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
      'Saved municipal budget, population impact & equity CSV report.',
      'success'
    );
  };

  const sizeCls = compact ? 'px-2.5 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs';
  const showCsvExport = Boolean(optResult) && activeTab !== 'diagnostics';
  const csvLabel =
    activeTab === 'equity'
      ? 'Export Portfolio & Equity (CSV)'
      : 'Export Mitigation Report (CSV)';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {onOpenFullReport && (
        <button
          type="button"
          onClick={onOpenFullReport}
          className={`inline-flex items-center gap-1.5 ${sizeCls} rounded-lg bg-[#12345B] hover:bg-[#0F2A4A] text-white font-semibold cursor-pointer transition-colors`}
        >
          <FileBarChart2 className="w-3.5 h-3.5" />
          Open Full Report
        </button>
      )}
      {showCsvExport && (
        <Tooltip content="Download modeled portfolio allocation, exposure deltas, and zone equity audit as CSV.">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className={`inline-flex items-center gap-1.5 ${sizeCls} rounded-lg bg-white hover:bg-[#EEF3FA] border border-[#12345B]/35 text-[#12345B] font-semibold cursor-pointer transition-colors`}
          >
            <Download className="w-3.5 h-3.5" />
            {csvLabel}
          </button>
        </Tooltip>
      )}
      <Tooltip content="Print or save the current report summary as PDF.">
        <button
          type="button"
          onClick={() => window.print()}
          className={`inline-flex items-center gap-1.5 ${sizeCls} rounded-lg bg-white hover:bg-[#EEF3FA] border border-[#CBD5E1] text-[#10223D] font-semibold cursor-pointer transition-colors`}
        >
          <Printer className="w-3.5 h-3.5" />
          Print Brief
        </button>
      </Tooltip>
    </div>
  );
}
