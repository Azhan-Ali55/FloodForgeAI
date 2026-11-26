import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { ALERT_TIER_META, STATION_RISK_META } from '../../engine/pilotConfig';
import type { AlertTier, ScenarioTag, StationRiskLevel } from '../../types/floodforge';
import { cn } from '../../utils/cn';

/**
 * Municipal white panel card with thin grey border and subtle elevation.
 */
export function PanelCard({
  children,
  className,
  padding = 'p-4',
}: {
  children: React.ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={cn(
        'bg-[#FFFFFF] border border-[#D6DCE4] rounded shadow-[0_1px_4px_rgba(23,60,121,0.06)]',
        padding,
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Municipal panel with a rectangular navy-blue (#173C79) section header bar.
 */
export function MunicipalPanel({
  title,
  icon,
  rightSlot,
  children,
  className,
  bodyClassName = 'p-3.5',
}: {
  title: string;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'bg-[#FFFFFF] border border-[#D6DCE4] rounded shadow-[0_1px_4px_rgba(23,60,121,0.07)] overflow-hidden',
        className
      )}
    >
      <div className="bg-[#173C79] text-white px-3.5 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="flex-shrink-0 text-white/90">{icon}</span>}
          <h2 className="font-heading text-xs font-semibold uppercase tracking-wider leading-snug">
            {title}
          </h2>
        </div>
        {rightSlot && <div className="flex-shrink-0">{rightSlot}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Metric explanation"
        className="text-[#5A6A7E] hover:text-[#173C79] transition-colors cursor-pointer"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 p-2.5 rounded bg-[#FFFFFF] border border-[#CBD5E1] text-[11px] leading-relaxed text-[#26364A] shadow-lg pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

export function ScenarioTagBadge({ tag }: { tag: ScenarioTag }) {
  const meta: Record<ScenarioTag, { label: string; cls: string }> = {
    LIVE_FORECAST: {
      label: 'LIVE FORECAST',
      cls: 'bg-[#EDF7EE] text-[#2F6F37] border-[#55A85F]/60',
    },
    UNCERTAINTY_ENVELOPE: {
      label: 'UNCERTAINTY ENVELOPE',
      cls: 'bg-[#FEF9E7] text-[#8A6700] border-[#E0B422]/70',
    },
    HYPOTHETICAL_STRESS_TEST: {
      label: 'STRESS TEST SCENARIO',
      cls: 'bg-[#EEF3FA] text-[#173C79] border-[#244D8F]/40',
    },
  };
  const m = meta[tag];
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-mono font-semibold tracking-wider border',
        m.cls
      )}
    >
      {m.label}
    </span>
  );
}

export function AlertTierBadge({
  tier,
  size = 'sm',
}: {
  tier: AlertTier;
  size?: 'sm' | 'md';
}) {
  const meta = ALERT_TIER_META[tier];
  return (
    <span
      style={{
        color: meta.color,
        backgroundColor: meta.bg,
        borderColor: meta.border,
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border font-mono font-semibold tracking-wide',
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
      )}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
    </span>
  );
}

export function StationRiskBadge({
  level,
  size = 'sm',
}: {
  level: StationRiskLevel;
  size?: 'sm' | 'md';
}) {
  const meta = STATION_RISK_META[level];
  return (
    <span
      style={{
        color: meta.textHex,
        backgroundColor: meta.bgHex,
        borderColor: meta.borderHex,
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border font-semibold',
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'
      )}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: meta.hex }}
      />
      {meta.label}
    </span>
  );
}

