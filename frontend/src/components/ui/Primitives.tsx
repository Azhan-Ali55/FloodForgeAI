import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ALERT_TIER_META, PILOT_CONFIG, STATION_RISK_META } from '../../engine/pilotConfig';
import type { AlertTier, ScenarioTag, StationRiskLevel } from '../../types/floodforge';
import { cn } from '../../utils/cn';

/**
 * Clean workspace page header with navy title, muted description, and right action slot.
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
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div className="min-w-0">
        <h1
          className="font-heading font-semibold text-[#10223D] tracking-tight"
          style={{ fontSize: 'clamp(18px, 2.5vw, 26px)', letterSpacing: '-0.025em' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-[#64748B] mt-0.5 leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {rightSlot && <div className="flex flex-wrap items-center gap-2 flex-shrink-0">{rightSlot}</div>}
    </div>
  );
}

/**
 * Minimal off-white surface card with subtle border and hairline shadow.
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
        'bg-white border border-[#E2E8F0] rounded-xl',
        padding,
        className
      )}
      style={{ boxShadow: '0 1px 3px rgba(16,34,61,0.06), 0 1px 2px rgba(16,34,61,0.04)' }}
    >
      {children}
    </div>
  );
}

/**
 * Compact quantitative stat tile adhering to >= 11px label typography.
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
      card: 'bg-white border-[#E2E8F0]',
      label: 'text-[#64748B]',
      value: 'text-[#10223D]',
    },
    primary: {
      card: 'bg-[#EFF9FF] border-[#BAE6FD]',
      label: 'text-[#0369A1]',
      value: 'text-[#10223D]',
    },
    success: {
      card: 'bg-[#ECFDF5] border-[#A7F3D0]',
      label: 'text-[#065F46]',
      value: 'text-[#065F46]',
    },
    warning: {
      card: 'bg-[#FFF7ED] border-[#FED7AA]',
      label: 'text-[#9A3412]',
      value: 'text-[#C2410C]',
    },
    danger: {
      card: 'bg-[#FEF2F2] border-[#FECACA]',
      label: 'text-[#991B1B]',
      value: 'text-[#B91C1C]',
    },
  };
  const st = toneStyles[tone];

  return (
    <div
      className={cn('p-3.5 rounded-xl border', st.card, className)}
      style={{ boxShadow: '0 1px 3px rgba(16,34,61,0.05)' }}
    >
      <div className={cn('flex items-center justify-between text-[11px] font-semibold tracking-wide uppercase', st.label)}>
        <span>{label}</span>
        {icon}
      </div>
      <div className={cn('text-xl sm:text-2xl font-semibold font-mono mt-1.5 flex items-center gap-2', st.value)}>
        {value}
      </div>
      {subtext && (
        <div className="text-[11px] font-mono text-[#94A3B8] mt-1 truncate">
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
    ? 'No flood risk modeled: mitigation interventions are not required under current conditions.'
    : isWarning
      ? 'Risk transfer warning: downstream Rawalpindi building exposure rose above 2%.'
      : PILOT_CONFIG.equity_pass_banner;

  return (
    <div
      role="status"
      className={cn(
        'px-3.5 py-2.5 rounded-md border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs',
        isWarning
          ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
          : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]',
        className
      )}
    >
      <div className="flex items-start sm:items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5 sm:mt-0" />
        <div className="min-w-0">
          <div className="font-semibold leading-snug">{title}</div>
          {description && (
            <p className="text-[11px] text-[#334155] mt-0.5 leading-snug">{description}</p>
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
 * Minimal platform card panel with clean white header, hairline border, and navy title.
 * Named MunicipalPanel for backwards compatibility across all secondary routes.
 */
export function MunicipalPanel({
  title,
  subtitle,
  icon,
  rightSlot,
  children,
  className,
  bodyClassName = 'p-4',
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden',
        className
      )}
      style={{ boxShadow: '0 1px 3px rgba(16,34,61,0.06), 0 1px 2px rgba(16,34,61,0.04)' }}
    >
      <div
        className="px-4 py-3 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2"
        style={{ background: 'linear-gradient(135deg, #12345B 0%, #0F766E 100%)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="flex-shrink-0 text-white/80">{icon}</span>}
          <div className="min-w-0">
            <h2 className="font-heading text-sm font-semibold text-white leading-snug truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[11px] text-white/60 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {rightSlot && <div className="flex-shrink-0 max-w-full">{rightSlot}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function ScenarioTagBadge({ tag }: { tag: ScenarioTag }) {
  const meta: Record<ScenarioTag, { label: string; cls: string }> = {
    LIVE_FORECAST: {
      label: 'Live Forecast',
      cls: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]',
    },
    UNCERTAINTY_ENVELOPE: {
      label: 'Uncertainty Envelope',
      cls: 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]',
    },
    HYPOTHETICAL_STRESS_TEST: {
      label: 'Simulated Scenario',
      cls: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
    },
  };
  const m = meta[tag];
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap',
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
        'inline-flex items-center gap-1.5 rounded border font-semibold whitespace-nowrap',
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'
      )}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
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
        'inline-flex items-center gap-1.5 rounded border font-semibold whitespace-nowrap',
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
