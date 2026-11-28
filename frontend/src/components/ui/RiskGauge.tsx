import React from 'react';
import type { AlertTier } from '../../types/floodforge';

const TIER_CONFIG: Record<AlertTier, { color: string; trackColor: string; label: string; score: number }> = {
  Normal:    { color: '#0F766E', trackColor: '#D1FAE5', label: 'Normal',    score: 12 },
  Advisory:  { color: '#0284C7', trackColor: '#E0F2FE', label: 'Advisory',  score: 36 },
  Watch:     { color: '#D97706', trackColor: '#FEF3C7', label: 'Watch',     score: 55 },
  Warning:   { color: '#EA580C', trackColor: '#FFEDD5', label: 'Warning',   score: 74 },
  Emergency: { color: '#DC2626', trackColor: '#FEE2E2', label: 'Emergency', score: 92 },
};

const UNAVAILABLE_CONFIG = {
  color: '#64748B',
  trackColor: '#E2E8F0',
  label: 'Unavailable',
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
  size = 156,
  className = '',
}: RiskGaugeProps) {
  const cfg = hasValidData ? TIER_CONFIG[tier] : UNAVAILABLE_CONFIG;

  // Semicircle arc: 180° span from 180° (left) up through 270° (top) to 360° (right)
  const svgW = size;
  const svgH = Math.round(size * 0.58);
  const cx = svgW / 2;
  const cy = svgH - 8;
  const R = svgW * 0.4;
  const strokeW = Math.max(8, Math.round(svgW * 0.07));

  const scorePct = hasValidData ? cfg.score! / 100 : 0;
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
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  const trackPath = describeArc(startAngle, startAngle + sweepAngle, R);
  const fillPath =
    hasValidData && fillSweep > 0 ? describeArc(startAngle, startAngle + fillSweep, R) : null;

  const ticks = [0, 25, 50, 75, 100].map((pct) => {
    const a = startAngle + (pct / 100) * sweepAngle;
    const inner = polarToXY(a, R - strokeW / 2 - 2);
    const outer = polarToXY(a, R + strokeW / 2 + 2);
    return { inner, outer, pct };
  });

  const formattedValue =
    hasValidData && exposedKm2 !== undefined
      ? exposedKm2 >= 1000
        ? exposedKm2.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
        : exposedKm2.toFixed(1)
      : hasValidData
        ? cfg.label
        : '—';

  const displayUnit = hasValidData && exposedKm2 !== undefined ? 'km²' : '';

  // Dynamic font size so long values (e.g., 100,000.0) never collide with the arc
  const valueSizeClass =
    formattedValue.length >= 9
      ? 'text-sm'
      : formattedValue.length >= 6
        ? 'text-lg'
        : 'text-2xl';

  return (
    <div
      className={`flex flex-col items-center select-none ${className}`}
      role="img"
      aria-label={`Flood risk gauge: ${cfg.label}${
        hasValidData && exposedKm2 !== undefined ? `, ${formattedValue} square kilometers exposed` : ''
      }`}
    >
      {/* Gauge arc + centered non-overlapping HTML readout */}
      <div className="relative flex flex-col items-center" style={{ width: `${svgW}px` }}>
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d={trackPath}
            stroke={cfg.trackColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            fill="none"
          />
          {fillPath && (
            <path
              d={fillPath}
              stroke={cfg.color}
              strokeWidth={strokeW}
              strokeLinecap="round"
              fill="none"
            />
          )}
          {ticks.map(({ inner, outer, pct }) => (
            <line
              key={pct}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={cfg.color}
              strokeWidth={1}
              strokeOpacity={0.38}
            />
          ))}
          {hasValidData &&
            fillSweep > 0 &&
            (() => {
              const needlePt = polarToXY(startAngle + fillSweep, R);
              return <circle cx={needlePt.x} cy={needlePt.y} r={strokeW * 0.42} fill={cfg.color} />;
            })()}
        </svg>

        {/* Centered readout inside the lower half of the arc using normal flow (zero overlap) */}
        <div
          data-testid="risk-gauge-readout"
          className="absolute inset-x-4 bottom-0 flex flex-col items-center justify-end text-center pointer-events-none"
        >
          <span
            data-testid="risk-gauge-value"
            className={`font-bold font-mono leading-none tracking-tight ${valueSizeClass}`}
            style={{ color: cfg.color }}
          >
            {formattedValue}
          </span>
          {displayUnit && (
            <span
              data-testid="risk-gauge-unit"
              className="mt-1 text-[11px] font-medium leading-none text-[#64748B]"
            >
              {displayUnit}
            </span>
          )}
        </div>
      </div>

      {/* Tier classification pill */}
      <div
        data-testid="risk-gauge-tier"
        className="mt-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide"
        style={{
          background: `${cfg.color}18`,
          color: cfg.color,
          border: `1px solid ${cfg.color}35`,
        }}
      >
        {cfg.label}
      </div>
    </div>
  );
});
