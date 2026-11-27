import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useFloodForge } from '../../context/FloodForgeContext';
import { TopBar } from './TopBar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activeToasts, dismissToast } = useFloodForge();

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <TopBar />

      {/* Screening Notice Strip */}
      <div className="bg-[#FFFFFF] border-b border-[#E2E8F0] px-3 sm:px-5 py-1.5">
        <div className="max-w-[1760px] mx-auto flex items-center justify-between gap-3 text-xs text-[#475569]">
          <div className="flex items-start sm:items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] flex-shrink-0 mt-0.5 sm:mt-0" />
            <span className="leading-snug">
              <strong className="text-[#0F172A] font-semibold">
                Screening Decision-Support Platform:
              </strong>{' '}
              30 m basin runoff &amp; mitigation planning. Cross-verify operational alerts with official PMD &amp; NDMA bulletins.
            </span>
          </div>
          <span className="hidden md:inline-block font-mono text-[11px] px-2 py-0.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-[#334155] flex-shrink-0">
            Rawalpindi–Islamabad Basin
          </span>
        </div>
      </div>

      <main className="flex-1 p-3 sm:p-4 lg:p-5 max-w-[1760px] w-full mx-auto">
        {children}
      </main>

      {/* Floating Municipal Toast Notifications */}
      {activeToasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
          {activeToasts.map((t) => {
            const Icon =
              t.severity === 'success'
                ? CheckCircle2
                : t.severity === 'warning' || t.severity === 'critical'
                  ? AlertTriangle
                  : Info;
            const borderCls =
              t.severity === 'success'
                ? 'border-l-4 border-l-[#55A85F]'
                : t.severity === 'warning'
                  ? 'border-l-4 border-l-[#EF8735]'
                  : t.severity === 'critical'
                    ? 'border-l-4 border-l-[#D94343]'
                    : 'border-l-4 border-l-[#173C79]';
            const iconCls =
              t.severity === 'success'
                ? 'text-[#55A85F]'
                : t.severity === 'warning'
                  ? 'text-[#EF8735]'
                  : t.severity === 'critical'
                    ? 'text-[#D94343]'
                    : 'text-[#173C79]';

            return (
              <div
                key={t.id}
                className={`pointer-events-auto rounded bg-white border border-[#CBD5E1] ${borderCls} p-3 shadow-lg flex items-start gap-2.5`}
              >
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconCls}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[#173C79]">{t.title}</div>
                  <div className="text-[11px] text-[#5A6A7E] mt-0.5 leading-snug">
                    {t.message}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="text-[#5A6A7E] hover:text-[#26364A] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
