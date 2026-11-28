import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Scale, Sliders } from 'lucide-react';
import { ReportActionButtons } from '../components/ui/ReportActionButtons';
import { cn } from '../utils/cn';
import { EquityImpact } from './EquityImpact';
import { MitigationOptimizer } from './MitigationOptimizer';
import { ModelHealth } from './ModelHealth';

type ReportTab = 'optimizer' | 'equity' | 'diagnostics';

export function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as ReportTab) || 'optimizer';
  const [tab, setTab] = useState<ReportTab>(
    ['optimizer', 'equity', 'diagnostics'].includes(initialTab) ? initialTab : 'optimizer'
  );

  useEffect(() => {
    const paramTab = searchParams.get('tab') as ReportTab | null;
    if (paramTab && ['optimizer', 'equity', 'diagnostics'].includes(paramTab)) {
      setTab(paramTab);
    }
  }, [searchParams]);

  const handleTabChange = (next: ReportTab) => {
    setTab(next);
    setSearchParams(next === 'optimizer' ? {} : { tab: next }, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-2 flex flex-wrap items-center justify-between gap-2 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'optimizer', label: 'Mitigation Portfolio', icon: Sliders },
              { id: 'equity', label: 'Zone Equity & Risk-Transfer', icon: Scale },
              { id: 'diagnostics', label: 'Model Diagnostics', icon: Activity },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                  active
                    ? 'bg-[#12345B] text-white'
                    : 'text-[#10223D] hover:bg-[#F1F6FB]'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <ReportActionButtons />
      </div>

      {tab === 'optimizer' && <MitigationOptimizer />}
      {tab === 'equity' && <EquityImpact />}
      {tab === 'diagnostics' && <ModelHealth />}
    </div>
  );
}
