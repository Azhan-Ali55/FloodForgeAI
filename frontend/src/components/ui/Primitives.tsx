import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ALERT_TIER_META, PILOT_CONFIG, STATION_RISK_META } from '../../engine/pilotConfig';
import type { AlertTier, ScenarioTag, StationRiskLevel } from '../../types/floodforge';
import { cn } from '../../utils/cn';

/**
 * Standardized municipal page header with title, concise subtitle, and optional actions.
 */
export function PageHeader({
  title,
  subtitle,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading text-xl font-bold text-[#173C79] tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-[#5A6A7E] mt-0.5 leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {rightSlot && <div className="flex flex-wrap items-center gap-2 flex-shrink-0">{rightSlot}</div>}
    </div>
  );
}

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
 * Standardized KPI stat card used across dashboards, telemetry, and reports.
 */
export function StatCard({
  label,
  value,
  subtext,
  icon,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const toneStyles: Record<typeof tone, { card: string; label: string; value: string }> = {
    neutral: {
      card: 'bg-white border-[#D6DCE4]',
      label: 'text-[#5A6A7E]',
      value: 'text-[#26364A]',
    },
    primary: {
      card: 'bg-[#EEF3FA] border-[#173C79]/35',
      label: 'text-[#173C79]',
      value: 'text-[#173C79]',
    },
    success: {
      card: 'bg-[#EDF7EE] border-[#55A85F]/50',
      label: 'text-[#2F6F37]',
      value: 'text-[#2F6F37]',
    },
    warning: {
      card: 'bg-[#FDF1E7] border-[#EF8735]/50',
      label: 'text-[#A64D0B]',
      value: 'text-[#C75E10]',
    },
    danger: {
      card: 'bg-[#FBEBEB] border-[#D94343]/50',
      label: 'text-[#A12323]',
      value: 'text-[#D94343]',
    },
  };
  const st = toneStyles[tone];

  return (
    <div className={cn('p-3 rounded-sm border', st.card, className)}>
      <div className={cn('flex items-center justify-between text-[10px] font-bold uppercase tracking-wider', st.label)}>
        <span>{label}</span>
        {icon}
      </div>
      <div className={cn('text-xl sm:text-2xl font-bold font-mono mt-0.5 flex items-center gap-2', st.value)}>
        {value}
      </div>
      {subtext && (
        <div className="text-[11px] font-mono text-[#5A6A7E] mt-0.5 truncate">
          {subtext}
        </div>
      )}
    </div>
  );
}

/**
 * Unified Equity Audit & No-Flood-Risk status banner (uses Lucide icons, no emojis).
 */
export function EquityStatusBanner({
  hasFloodRisk,
  equityFlagged,
  rightSlot,
  description,
  className,
}: {
  hasFloodRisk: boolean;
  equityFlagged: boolean;
  rightSlot?: React.ReactNode;
  description?: string;
  className?: string;
}) {
  const isWarning = hasFloodRisk && equityFlagged;
  const Icon = isWarning ? AlertTriangle : CheckCircle2;
  const title = !hasFloodRisk
    ? 'No Flood Risk Modeled: Mitigation solutions are not required under current conditions.'
    : isWarning
      ? 'Risk Transfer Warning: Downstream Rawalpindi building exposure rose >2%.'
      : PILOT_CONFIG.equity_pass_banner;

  return (
    <div
      role="status"
      className={cn(
        'px-3.5 py-2 rounded-sm border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs',
        isWarning
          ? 'bg-[#FBEBEB] border-[#D94343] text-[#A12323]'
          : 'bg-[#EDF7EE] border-[#55A85F] text-[#2F6F37]',
        className
      )}
    >
      <div className="flex items-start sm:items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5 sm:mt-0" />
        <div className="min-w-0">
          <div className="font-semibold leading-snug">{title}</div>
          {description && (
            <p className="text-[11px] text-[#26364A] mt-0.5 leading-snug">{description}</p>
          )}
        </div>
      </div>
      {rightSlot && (
        <div className="font-mono text-[11px] font-semibold flex-shrink-0">{rightSlot}</div>
      )}
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

