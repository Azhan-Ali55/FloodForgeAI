import { Download, FileBarChart2, Printer } from 'lucide-react';
import { useFloodForge } from '../../context/FloodForgeContext';
import { formatSoilMoistureStatus } from '../../services/forecastService';
import { downloadMitigationReportCsv } from '../../utils/reportExport';

/**
 * Reusable report export and navigation toolbar shared between Dashboard ROI and Reports views.
 */
export function ReportActionButtons({
  onOpenFullReport,
  compact = false,
}: {
  onOpenFullReport?: () => void;
  compact?: boolean;
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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {onOpenFullReport && (
        <button
          type="button"
          onClick={onOpenFullReport}
          className={`inline-flex items-center gap-1.5 ${sizeCls} rounded-sm bg-[#173C79] hover:bg-[#244D8F] text-white font-semibold cursor-pointer transition-colors`}
        >
          <FileBarChart2 className="w-3.5 h-3.5" />
          Open Full Report
        </button>
      )}
      {optResult && (
        <button
          type="button"
          onClick={handleDownloadCsv}
          className={`inline-flex items-center gap-1.5 ${sizeCls} rounded-sm bg-white hover:bg-[#EEF3FA] border border-[#173C79]/40 text-[#173C79] font-semibold cursor-pointer transition-colors`}
        >
          <Download className="w-3.5 h-3.5" />
          Download Report (CSV)
        </button>
      )}
      <button
        type="button"
        onClick={() => window.print()}
        className={`inline-flex items-center gap-1.5 ${sizeCls} rounded-sm bg-white hover:bg-[#EEF3FA] border border-[#CBD5E1] text-[#26364A] font-semibold cursor-pointer transition-colors`}
      >
        <Printer className="w-3.5 h-3.5" />
        Print Brief
      </button>
    </div>
  );
}
