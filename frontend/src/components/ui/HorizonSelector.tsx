import type { ForecastHorizon } from '../../types/floodforge';
import { cn } from '../../utils/cn';
import { Tooltip } from './Tooltip';

const HORIZON_DESCRIPTIONS: Record<ForecastHorizon, string> = {
  24: '24-hour operational rainfall accumulation horizon.',
  48: '48-hour operational rainfall accumulation horizon.',
  72: '72-hour extended operational rainfall accumulation horizon.',
};

interface ForecastHorizonSelectorProps {
  value: ForecastHorizon;
  onChange: (h: ForecastHorizon) => void;
  layout?: 'row' | 'col';
  className?: string;
}

export function ForecastHorizonSelector({
  value,
  onChange,
  layout = 'row',
  className,
}: ForecastHorizonSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Forecast horizon"
      className={cn(
        'flex gap-1.5',
        layout === 'col' ? 'flex-row sm:flex-col' : 'flex-row items-center',
        className
      )}
    >
      {([24, 48, 72] as ForecastHorizon[]).map((h) => (
        <Tooltip key={h} content={HORIZON_DESCRIPTIONS[h]}>
          <button
            type="button"
            aria-pressed={value === h}
            onClick={() => onChange(h)}
            className={cn(
              'min-w-[46px] min-h-[32px] px-2.5 py-1 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer',
              value === h
                ? 'bg-[#12345B] text-white shadow-sm'
                : 'bg-[#F1F6FB] text-[#475569] hover:text-[#10223D] border border-[#E2E8F0]'
            )}
          >
            {h}h
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
