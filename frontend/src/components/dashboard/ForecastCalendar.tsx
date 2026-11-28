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
  demo2001DayOffset: number;
  demo2001Hour: number;
  onDemo2001DayChange: (day: number) => void;
  onDemo2001HourChange: (hour: number) => void;
}

const PAGE_SIZE = 7;

export const ForecastCalendar = React.memo(function ForecastCalendar({
  weather,
  operationalMode,
  monsoonStressMode,
  selectedOutlookDay,
  onSelectOutlookDay,
  demo2001DayOffset,
  demo2001Hour,
  onDemo2001DayChange,
  onDemo2001HourChange,
}: ForecastCalendarProps) {
  const days = weather.outlook30d;
  const totalPages = Math.max(1, Math.ceil(days.length / PAGE_SIZE));
  const [pageIdx, setPageIdx] = useState(0);

  // Reset pagination when outlook source changes or jump to selected day
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

  return (
    <MunicipalPanel
      title="Flood Outlook"
      subtitle={`Calendar forecast (${availableCount}/${days.length} days available) · Synced ${weather.fetchedAtPkt}`}
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
            className="px-2 py-1 rounded border border-[#CBD5E1] bg-[#FFFFFF] text-xs font-medium text-[#0F172A]"
          >
            <option value="">Active Horizon ({days[0]?.dateLabel ?? 'Current'})</option>
            {days.map((d) => (
              <option key={d.dayOffset} value={d.dayOffset} disabled={!d.isAvailable}>
                {d.dateLabel} ({d.monthYearLabel}) · {d.isAvailable && d.rainfallMm !== null ? `${d.rainfallMm.toFixed(1)} mm` : 'Unavailable'}
              </option>
            ))}
          </select>

          {selectedOutlookDay !== null && (
            <button
              type="button"
              onClick={() => onSelectOutlookDay(null)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#CBD5E1] bg-[#F1F6FB] hover:bg-[#F1F5F9] text-xs font-medium text-[#0F172A] cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      }
      bodyClassName="p-3.5 space-y-3"
    >
      {/* 2001 Time-Machine Hour Scrub (shown only in 2001 Demo mode) */}
      {operationalMode === 'demo_2001' && !monsoonStressMode && (
        <div className="p-2.5 rounded-md border border-[#FECACA] bg-[#FEF2F2] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="font-medium text-[#991B1B]">
            July 2001 Cloudburst Replay: Jul {16 + demo2001DayOffset}, 2001 · {String(demo2001Hour).padStart(2, '0')}:00 PKT
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[#7F1D1D]">
              <span>Day:</span>
              <input
                type="range"
                aria-label="2001 archive day selector"
                min={0}
                max={11}
                value={demo2001DayOffset}
                onChange={(e) => onDemo2001DayChange(Number(e.target.value))}
                className="w-24 accent-[#DC2626] cursor-pointer"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[#7F1D1D]">
              <span>Hour:</span>
              <input
                type="range"
                aria-label="2001 archive hour selector"
                min={0}
                max={23}
                value={demo2001Hour}
                onChange={(e) => onDemo2001HourChange(Number(e.target.value))}
                className="w-24 accent-[#DC2626] cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* Month span + 7-Day Window Pagination */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="font-semibold text-[#0F172A]">
          {monthSpanLabel || 'Forecast Timeline'}
          <span className="ml-2 font-normal text-[#64748B]">
            Showing {visibleDays[0]?.dateLabel} – {visibleDays[visibleDays.length - 1]?.dateLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
            disabled={pageIdx === 0}
            aria-label="Previous 7 forecast dates"
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#CBD5E1] bg-[#FFFFFF] text-xs font-medium text-[#0F172A] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#F1F6FB]"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev 7d
          </button>
          <span className="font-mono text-[11px] text-[#64748B] px-1">
            {pageIdx + 1}/{totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPageIdx((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageIdx >= totalPages - 1}
            aria-label="Next 7 forecast dates"
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#CBD5E1] bg-[#FFFFFF] text-xs font-medium text-[#0F172A] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#F1F6FB]"
          >
            Next 7d
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 7-Date Card Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {visibleDays.map((day) => {
          const isSelected = selectedOutlookDay === day.dayOffset;
          const rain = day.rainfallMm;
          const meta = STATION_RISK_META[day.riskLevel];
          const isExperimental = day.confidenceTier === 'EXPERIMENTAL';
          const barPct =
            day.isAvailable && rain !== null
              ? Math.min(100, Math.max(8, Math.round((rain / 120) * 100)))
              : 0;

          return (
            <button
              key={day.dateIso}
              type="button"
              disabled={!day.isAvailable}
              aria-pressed={isSelected}
              title={
                day.isAvailable && rain !== null
                  ? `${day.dateLabel} (${day.monthYearLabel}): ${rain.toFixed(1)} mm (P90: ${day.p90RainfallMm !== null ? `${day.p90RainfallMm.toFixed(1)} mm` : 'N/A'}, ${day.probabilityPct !== null ? `${day.probabilityPct}% prob` : 'prob N/A'}) · ${day.confidenceLabel}`
                  : `${day.dateLabel}: Rainfall data unavailable`
              }
              onClick={() => {
                if (!day.isAvailable) return;
                onSelectOutlookDay(isSelected ? null : day.dayOffset);
              }}
              className={cn(
                'p-2.5 rounded-md border text-left transition-colors flex flex-col justify-between gap-2',
                !day.isAvailable
                  ? 'bg-[#F1F6FB] border-[#E2E8F0] text-[#94A3B8] opacity-65 cursor-not-allowed'
                  : isSelected
                    ? 'bg-[#EFF6FF] border-[#1D4ED8] ring-1 ring-[#1D4ED8] cursor-pointer'
                    : 'bg-[#FFFFFF] border-[#E2E8F0] hover:border-[#94A3B8] hover:bg-[#F1F6FB] cursor-pointer'
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold text-xs text-[#0F172A] truncate">
                  {day.dateLabel}
                </span>
                {isExperimental && (
                  <span className="text-[11px] font-medium px-1 rounded bg-[#F1F5F9] text-[#475569]">
                    Exp
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <div className="font-mono text-xs font-semibold text-[#0F172A]">
                  {day.isAvailable && rain !== null ? `${rain.toFixed(1)} mm` : 'Unavailable'}
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
                  {day.isAvailable && (
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: (rain ?? 0) < 2 ? '#94A3B8' : meta.hex,
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="text-[11px] text-[#64748B] truncate">
                {day.isAvailable
                  ? day.p90RainfallMm !== null
                    ? `P90 ${day.p90RainfallMm.toFixed(0)} mm`
                    : day.tier === 'HIGH_PRECISION_5D'
                      ? 'Short-range'
                      : 'Medium-range'
                  : 'Missing rain'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Day Provenance & Uncertainty Bar + Honest Accuracy Disclosure */}
      <div className="pt-2 border-t border-[#F1F5F9] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[#64748B]">
        <div>
          {selectedDayObj ? (
            <span>
              Selected: <strong className="text-[#0F172A]">{selectedDayObj.dateLabel} ({selectedDayObj.monthYearLabel})</strong> —{' '}
              {selectedDayObj.confidenceLabel}
              {selectedDayObj.p90RainfallMm !== null && ` · P90 upper: ${selectedDayObj.p90RainfallMm.toFixed(1)} mm`}
            </span>
          ) : (
            <span>
              Coverage: Days 1–16 deterministic daily{days.length > 16 ? `, Days 17–${days.length} experimental GFS ensemble` : ''}.
            </span>
          )}
        </div>
        <div className="text-[#64748B]">
          Forecast accuracy vs. local river gauges unverified (confidence intervals unavailable).
        </div>
      </div>
    </MunicipalPanel>
  );
});
