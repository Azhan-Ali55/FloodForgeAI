import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { STATION_RISK_META } from '../../engine/pilotConfig';
import type { OperationalMode, OutlookDayPoint, WeatherBundle } from '../../types/floodforge';
import { cn } from '../../utils/cn';
import { MunicipalPanel } from '../ui/Primitives';

interface ForecastCalendarProps {
  weather: WeatherBundle;
  operationalMode: OperationalMode;
  monsoonStressMode: boolean;
  selectedOutlookDay: number | null;
  onSelectOutlookDay: (dayOffset: number | null) => void;
}

const PAGE_SIZE = 7;

export const ForecastCalendar = React.memo(function ForecastCalendar({
  weather,
  operationalMode,
  monsoonStressMode,
  selectedOutlookDay,
  onSelectOutlookDay,
}: ForecastCalendarProps) {
  const days = weather.outlook30d;
  const totalPages = Math.max(1, Math.ceil(days.length / PAGE_SIZE));
  const [pageIdx, setPageIdx] = useState(0);

  useEffect(() => {
    if (selectedOutlookDay !== null) {
      const idx = days.findIndex((d) => d.dayOffset === selectedOutlookDay);
      if (idx >= 0) {
        setPageIdx(Math.floor(idx / PAGE_SIZE));
        return;
      }
    }
    setPageIdx((prev) => Math.min(prev, Math.max(0, totalPages - 1)));
  }, [days, selectedOutlookDay, totalPages]);

  const start = pageIdx * PAGE_SIZE;
  const visibleDays = days.slice(start, start + PAGE_SIZE);
  const availableCount = days.filter((d) => d.isAvailable && d.rainfallMm !== null).length;
  const selectedDayObj: OutlookDayPoint | null =
    selectedOutlookDay !== null
      ? days.find((d) => d.dayOffset === selectedOutlookDay) ?? null
      : null;

  const firstMonth = visibleDays[0]?.monthYearLabel ?? '';
  const lastMonth = visibleDays[visibleDays.length - 1]?.monthYearLabel ?? '';
  const monthSpanLabel =
    firstMonth && lastMonth && firstMonth !== lastMonth
      ? `${firstMonth} – ${lastMonth}`
      : firstMonth;

  const subtitle =
    operationalMode === 'demo_2001' && !monsoonStressMode
      ? `July 2001 Archive (${availableCount} days)`
      : `${availableCount}/${days.length} days available · ${weather.fetchedAtPkt}`;

  return (
    <MunicipalPanel
      title="Flood Outlook"
      subtitle={subtitle}
      icon={<CalendarDays className="w-4 h-4" />}
      rightSlot={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Jump to outlook calendar date"
            value={selectedOutlookDay ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              onSelectOutlookDay(v === '' ? null : Number(v));
            }}
            className="px-2.5 py-1 rounded-lg border border-white/20 bg-white/95 text-xs font-medium text-[#10223D]"
          >
            <option value="">Active Horizon ({days[0]?.dateLabel ?? 'Current'})</option>
            {days.map((d) => (
              <option key={d.dayOffset} value={d.dayOffset} disabled={!d.isAvailable}>
                {d.dateLabel} · {d.isAvailable && d.rainfallMm !== null ? `${d.rainfallMm.toFixed(1)} mm` : 'Unavailable'}
              </option>
            ))}
          </select>

          {selectedOutlookDay !== null && (
            <button
              type="button"
              onClick={() => onSelectOutlookDay(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/25 bg-white/15 hover:bg-white/25 text-xs font-medium text-white cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      }
      bodyClassName="p-3.5 space-y-3"
    >
      {/* Month span + 7-Day Window Pagination */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="font-semibold text-[#10223D]">
          {monthSpanLabel || 'Forecast Timeline'}
          {visibleDays.length > 0 && (
            <span className="ml-2 font-normal text-[#64748B]">
              {visibleDays[0]?.dateLabel} – {visibleDays[visibleDays.length - 1]?.dateLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
            disabled={pageIdx === 0}
            aria-label="Previous 7 forecast dates"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#10223D] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#F1F6FB]"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          <span className="font-mono text-[11px] text-[#64748B] px-1">
            {pageIdx + 1}/{totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPageIdx((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageIdx >= totalPages - 1}
            aria-label="Next 7 forecast dates"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#10223D] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#F1F6FB]"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 7-Date Card Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {visibleDays.map((day) => {
          const isSelected = selectedOutlookDay === day.dayOffset;
          const rain = day.rainfallMm;
          const meta = STATION_RISK_META[day.riskLevel];

          return (
            <button
              key={day.dateIso}
              type="button"
              disabled={!day.isAvailable}
              aria-pressed={isSelected}
              title={
                day.isAvailable && rain !== null
                  ? `${day.dateLabel} (${day.monthYearLabel}): ${rain.toFixed(1)} mm${day.p90RainfallMm !== null ? ` · P90 ${day.p90RainfallMm.toFixed(1)} mm` : ''}`
                  : `${day.dateLabel}: Unavailable`
              }
              onClick={() => {
                if (!day.isAvailable) return;
                onSelectOutlookDay(isSelected ? null : day.dayOffset);
              }}
              className={cn(
                'p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5',
                !day.isAvailable
                  ? 'bg-[#F1F6FB] border-[#E2E8F0] text-[#94A3B8] opacity-65 cursor-not-allowed'
                  : isSelected
                    ? 'bg-[#EFF6FF] border-[#12345B] ring-1 ring-[#12345B] cursor-pointer'
                    : 'bg-white border-[#E2E8F0] hover:border-[#94A3B8] hover:bg-[#F1F6FB] cursor-pointer'
              )}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-semibold text-xs text-[#10223D] truncate">
                  {day.dateLabel}
                </span>
                {day.isAvailable && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: (rain ?? 0) < 2 ? '#94A3B8' : meta.hex }}
                    aria-label={`Risk: ${day.riskLevel}`}
                  />
                )}
              </div>

              <div className="font-mono text-sm font-semibold text-[#10223D]">
                {day.isAvailable && rain !== null ? `${rain.toFixed(1)} mm` : '—'}
              </div>

              <div className="text-[11px] text-[#64748B] truncate">
                {day.isAvailable
                  ? day.p90RainfallMm !== null
                    ? `P90 ${day.p90RainfallMm.toFixed(0)} mm`
                    : day.riskLevel
                  : 'Unavailable'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Day Info or Concise Coverage Note */}
      <div className="pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
        {selectedDayObj ? (
          <span>
            Selected: <strong className="text-[#10223D]">{selectedDayObj.dateLabel} ({selectedDayObj.monthYearLabel})</strong>
            {selectedDayObj.p90RainfallMm !== null && ` · P90 upper: ${selectedDayObj.p90RainfallMm.toFixed(1)} mm`}
          </span>
        ) : (
          <span>Select any date to inspect modeled basin impact.</span>
        )}
        <span>Gauge-calibrated accuracy unverified.</span>
      </div>
    </MunicipalPanel>
  );
});
