import { useState } from 'react';
import { Activity, Scale, Sliders } from 'lucide-react';
import { cn } from '../utils/cn';
import { EquityImpact } from './EquityImpact';
import { MitigationOptimizer } from './MitigationOptimizer';
import { ModelHealth } from './ModelHealth';

type ReportTab = 'optimizer' | 'equity' | 'diagnostics';

export function Reports() {
  const [tab, setTab] = useState<ReportTab>('optimizer');

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D6DCE4] rounded p-2 flex flex-wrap items-center gap-1.5 shadow-xs">
        {(
          [
            { id: 'optimizer', label: 'Mitigation Portfolio Report', icon: Sliders },
            { id: 'equity', label: 'Zone Equity & Risk-Transfer Audit', icon: Scale },
            { id: 'diagnostics', label: 'Model & Data Diagnostics', icon: Activity },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors cursor-pointer',
                active
                  ? 'bg-[#173C79] text-white'
                  : 'text-[#26364A] hover:bg-[#F5F6F7]'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'optimizer' && <MitigationOptimizer />}
      {tab === 'equity' && <EquityImpact />}
      {tab === 'diagnostics' && <ModelHealth />}
    </div>
  );
}
