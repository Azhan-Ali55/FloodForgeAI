import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useFloodForge } from '../../context/FloodForgeContext';
import { cn } from '../../utils/cn';
import { MobileSidebarDrawer, Sidebar } from './Sidebar';
import { SlimTopBar } from './TopBar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activeToasts, dismissToast } = useFloodForge();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mobileMenuBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="min-h-screen flex relative"
      style={{
        background:
          'radial-gradient(circle at 18% 0%, rgba(56, 189, 248, 0.08) 0%, transparent 45%), radial-gradient(circle at 92% 14%, rgba(15, 118, 110, 0.06) 0%, transparent 40%), #F1F6FB',
        color: '#10223D',
      }}
    >
      {/* Desktop sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Mobile sidebar drawer */}
      <MobileSidebarDrawer
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        returnFocusRef={mobileMenuBtnRef}
      />

      {/* Main content area */}
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 transition-all duration-200 ml-0',
          !sidebarCollapsed && 'lg:ml-56'
        )}
      >
        {/* Slim header bar */}
        <SlimTopBar
          onMobileMenuOpen={() => setSidebarOpen(true)}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          sidebarCollapsed={sidebarCollapsed}
          mobileMenuButtonRef={mobileMenuBtnRef}
        />

        {/* Screening notice */}
        <div
          className="bg-white/90 border-b border-[#E2E8F0] px-3 sm:px-4 py-2"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-1.5 md:gap-3 text-xs text-[#475569]">
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] flex-shrink-0 mt-0.5 sm:mt-0" />
              <span className="leading-relaxed">
                <strong className="text-[#10223D] font-semibold">Decision-Support Platform:</strong>{' '}
                30 m basin runoff &amp; mitigation planning. Cross-verify operational alerts with official PMD &amp; NDMA bulletins.
              </span>
            </div>
            <span className="self-start md:self-auto font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#F1F6FB] border border-[#E2E8F0] text-[#64748B] flex-shrink-0 whitespace-nowrap">
              Rawalpindi–Islamabad · 33.65°N 73.06°E
            </span>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-5 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Floating toast notifications */}
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
                ? 'border-l-4 border-l-[#059669]'
                : t.severity === 'warning'
                  ? 'border-l-4 border-l-[#F59E0B]'
                  : t.severity === 'critical'
                    ? 'border-l-4 border-l-[#DC2626]'
                    : 'border-l-4 border-l-[#38BDF8]';
            const iconCls =
              t.severity === 'success'
                ? 'text-[#059669]'
                : t.severity === 'warning'
                  ? 'text-[#F59E0B]'
                  : t.severity === 'critical'
                    ? 'text-[#DC2626]'
                    : 'text-[#38BDF8]';

            return (
              <div
                key={t.id}
                className={`pointer-events-auto rounded-xl bg-white ${borderCls} p-3 shadow-lg flex items-start gap-2.5`}
                style={{ border: '1px solid #E2E8F0' }}
              >
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconCls}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[#12345B]">{t.title}</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5 leading-snug">{t.message}</div>
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="text-[#94A3B8] hover:text-[#10223D] cursor-pointer transition-colors"
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
