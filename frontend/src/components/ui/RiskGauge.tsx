import React from 'react';
import type { AlertTier } from '../../types/floodforge';

const TIER_CONFIG: Record<AlertTier, { color: string; trackColor: string; label: string; score: number }> = {
  Normal:    { color: '#0F766E', trackColor: '#D1FAE5', label: 'Normal',    score: 12 },
  Advisory:  { color: '#38BDF8', trackColor: '#E0F2FE', label: 'Advisory',  score: 36 },
  Watch:     { color: '#F59E0B', trackColor: '#FEF3C7', label: 'Watch',     score: 55 },
  Warning:   { color: '#EA580C', trackColor: '#FEE2E2', label: 'Warning',   score: 74 },
  Emergency: { color: '#DC2626', trackColor: '#FEE2E2', label: 'Emergency', score: 92 },
};

const UNAVAILABLE_CONFIG = {
  color: '#94A3B8',
  trackColor: '#F1F5F9',
  label: 'No Data',
  score: null as null,
};

interface RiskGaugeProps {
  tier: AlertTier;
  exposedKm2?: number;
  hasValidData?: boolean;
  size?: number;
  className?: string;
}

export const RiskGauge = React.memo(function RiskGauge({
  tier,
  exposedKm2,
  hasValidData = true,
  size = 160,
  className = '',
}: RiskGaugeProps) {
  const cfg = hasValidData ? TIER_CONFIG[tier] : UNAVAILABLE_CONFIG;

  // Semicircle arc: 180° span from 180° (left) up through 270° (top) to 360° (right)
  const cx = size / 2;
  const cy = size * 0.54;
  const R = size * 0.38;
  const strokeW = size * 0.075;

  // Score pct (0-1) for arc fill
  const scorePct = hasValidData ? (TIER_CONFIG[tier].score / 100) : 0;

  const startAngle = 180;
  const sweepAngle = 180;
  const fillSweep = sweepAngle * scorePct;

  function polarToXY(angleDeg: number, r: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  function describeArc(startDeg: number, endDeg: number, r: number) {
    const start = polarToXY(startDeg, r);
    const end = polarToXY(endDeg, r);
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
  }

  const trackPath = describeArc(startAngle, startAngle + sweepAngle, R);
  const fillPath = hasValidData && fillSweep > 0
    ? describeArc(startAngle, startAngle + fillSweep, R)
    : null;

  // Tick marks at every 20%
  const ticks = [0, 25, 50, 75, 100].map((pct) => {
    const a = startAngle + (pct / 100) * sweepAngle;
    const inner = polarToXY(a, R - strokeW / 2 - 2);
    const outer = polarToXY(a, R + strokeW / 2 + 2);
    return { inner, outer, pct };
  });

  const displayValue = hasValidData
    ? (exposedKm2 !== undefined ? `${exposedKm2.toFixed(1)}` : cfg.label)
    : '—';
  const displayUnit = hasValidData && exposedKm2 !== undefined ? 'km²' : '';

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      role="img"
      aria-label={`Flood risk gauge: ${cfg.label}${exposedKm2 !== undefined ? `, ${exposedKm2.toFixed(1)} km² exposed` : ''}`}
    >
      <svg
        width={size}
        height={size * 0.65}
        viewBox={`0 0 ${size} ${size * 0.65}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background track */}
        <path
          d={trackPath}
          stroke={cfg.trackColor}
          strokeWidth={strokeW}
          strokeLinecap="round"
          fill="none"
        />

        {/* Filled arc */}
        {fillPath && (
          <path
            d={fillPath}
            stroke={cfg.color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            fill="none"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        )}

        {/* Tick marks */}
        {ticks.map(({ inner, outer, pct }) => (
          <line
            key={pct}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke={cfg.color}
            strokeWidth={1}
            strokeOpacity={0.4}
          />
        ))}

        {/* Needle dot at current position */}
        {hasValidData && fillSweep > 0 && (() => {
          const needlePt = polarToXY(startAngle + fillSweep, R);
          return (
            <circle
              cx={needlePt.x}
              cy={needlePt.y}
              r={strokeW * 0.4}
              fill={cfg.color}
            />
          );
        })()}

        {/* Center text */}
        <text
          x={cx}
          y={cy - R * 0.16}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.18}
          fontWeight="700"
          fontFamily="'Inter', system-ui, sans-serif"
          fill={cfg.color}
          letterSpacing="-0.03em"
        >
          {displayValue}
        </text>
        {displayUnit && (
          <text
            x={cx}
            y={cy + size * 0.04}
            textAnchor="middle"
            fontSize={size * 0.08}
            fontFamily="'Inter', system-ui, sans-serif"
            fill="#64748B"
            fontWeight="500"
          >
            {displayUnit}
          </text>
        )}
      </svg>

      {/* Tier badge */}
      <div
        className="mt-1 px-3 py-1 rounded-full text-xs font-semibold tracking-wide"
        style={{
          background: `${cfg.color}18`,
          color: cfg.color,
          border: `1px solid ${cfg.color}30`,
        }}
      >
        {cfg.label}
      </div>
    </div>
  );
});
