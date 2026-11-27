import { cn } from '../../utils/cn';
import { formatPKR } from '../../utils/formatters';

const BUDGET_PRESETS = [50_000_000, 150_000_000, 200_000_000, 300_000_000] as const;

/**
 * Shared municipal budget slider (PKR 50M-300M) and preset buttons.
 */
export function BudgetControlCard({
  budgetPkr,
  spentPkr,
  onBudgetChange,
  ariaLabel = 'Dashboard Budget Slider',
  inputId = 'money-slide-budget',
  showNumericInput = false,
  className,
}: {
  budgetPkr: number;
  spentPkr?: number;
  onBudgetChange: (budget: number) => void;
  ariaLabel?: string;
  inputId?: string;
  showNumericInput?: boolean;
  className?: string;
}) {
  const clamped = Math.min(300_000_000, Math.max(50_000_000, budgetPkr));

  return (
    <div className={cn('p-3 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] space-y-2', className)}>
      <div className="flex items-center justify-between text-xs gap-2">
        <label htmlFor={inputId} className="font-semibold text-[#0F172A]">
          Budget Slider (PKR 50M → 300M)
        </label>
        <span className="font-mono font-semibold text-[#0F172A]">
          {spentPkr !== undefined
            ? `PKR ${(spentPkr / 1_000_000).toFixed(2)}M / ${(budgetPkr / 1_000_000).toFixed(0)}M`
            : formatPKR(budgetPkr)}
        </span>
      </div>

      <input
        id={inputId}
        aria-label={ariaLabel}
        type="range"
        min={50_000_000}
        max={300_000_000}
        step={5_000_000}
        value={clamped}
        onChange={(e) => onBudgetChange(Number(e.target.value))}
        className="w-full accent-[#0F766E] cursor-pointer"
      />

      <div className="flex items-center justify-between gap-1.5">
        {BUDGET_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onBudgetChange(preset)}
            className={cn(
              'flex-1 py-1 rounded text-[11px] font-mono font-semibold border transition-colors cursor-pointer',
              budgetPkr === preset
                ? 'bg-[#0F172A] border-[#0F172A] text-white'
                : 'bg-white border-[#CBD5E1] text-[#475569] hover:border-[#0F172A]'
            )}
          >
            {preset / 1_000_000}M
          </button>
        ))}
      </div>

      {showNumericInput && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="number"
            min={50_000_000}
            max={300_000_000}
            step={5_000_000}
            value={budgetPkr}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (Number.isFinite(val) && val >= 0) {
                onBudgetChange(val);
              }
            }}
            onBlur={(e) => onBudgetChange(Number(e.target.value) || 50_000_000)}
            className="flex-1 px-2.5 py-1.5 rounded-sm bg-white border border-[#D6DCE4] font-mono text-xs text-[#26364A]"
          />
          <span className="text-[11px] font-mono text-[#5A6A7E]">PKR</span>
        </div>
      )}
    </div>
  );
}
