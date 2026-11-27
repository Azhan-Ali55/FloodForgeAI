import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  Bell,
  CheckCheck,
  Clock,
  CloudRain,
  FileBarChart2,
  FlaskConical,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  RefreshCw,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useFloodForge } from '../../context/FloodForgeContext';
import { cn } from '../../utils/cn';

const PRIMARY_NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/map', label: 'Flood Map', icon: MapIcon },
  { to: '/forecast', label: 'Forecast', icon: CloudRain },
  { to: '/simulation', label: 'Simulation', icon: FlaskConical },
  { to: '/mitigation', label: 'Mitigation', icon: SlidersHorizontal },
  { to: '/reports', label: 'Reports', icon: FileBarChart2 },
];

const UTILITY_NAV_ITEMS = [
  { to: '/monitoring', label: 'Sensors', icon: Activity },
  { to: '/health', label: 'Health', icon: ShieldAlert },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function FloodForgeLogo() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 min-w-0 flex-shrink-0">
      <div className="w-8 h-8 rounded-md bg-[#0F172A] flex items-center justify-center">
        <svg
          viewBox="0 0 32 32"
          className="w-5 h-5"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M16 4C16 4 7.5 13.5 7.5 19.2C7.5 23.9 11.3 27.5 16 27.5C20.7 27.5 24.5 23.9 24.5 19.2C24.5 13.5 16 4 16 4Z"
            stroke="#FFFFFF"
            strokeWidth="2"
            fill="rgba(20,184,166,0.35)"
          />
          <path
            d="M10.5 20.5C12.2 18.8 14.1 18.8 16 20.2C17.9 21.6 19.8 21.4 21.5 19.8"
            stroke="#2DD4BF"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="leading-tight min-w-0">
        <div className="font-heading font-semibold text-[15px] text-[#0F172A] tracking-tight truncate">
          FloodForgeAI
        </div>
        <div className="text-[11px] font-medium text-[#64748B] hidden 2xl:block truncate">
          Nullah Lai Hydrological Twin
        </div>
      </div>
    </NavLink>
  );
}

export function TopBar() {
  const {
    operationalMode,
    setOperationalMode,
    monsoonStressMode,
    weather,
    isSyncingWeather,
    refreshWeather,
    notifications,
    markAllNotificationsRead,
  } = useFloodForge();

  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const isHistoric2001 = operationalMode === 'demo_2001' && !monsoonStressMode;
  const isLiveWeather = !isHistoric2001 && weather.source === 'OPEN_METEO_LIVE';

  return (
    <header className="sticky top-0 z-40 bg-[#FFFFFF] border-b border-[#E2E8F0]">
      <div className="max-w-[1760px] mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-2.5">
        {/* Left: Brand & Clean Primary Navigation */}
        <div className="flex items-center gap-3 xl:gap-5 min-w-0">
          <FloodForgeLogo />

          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-0.5"
          >
            {PRIMARY_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                      isActive
                        ? 'text-[#0F172A] bg-[#F1F5F9] font-semibold'
                        : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                    )
                  }
                >
                  <Icon className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Right: Single Mode Toggle, Sync Pill, Timestamp, Utility Icons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            role="group"
            aria-label="Operational mode switch"
            className="hidden md:flex items-center rounded-md bg-[#F1F5F9] border border-[#E2E8F0] p-0.5 text-xs font-medium"
          >
            <button
              type="button"
              aria-label="Live Operations (50mm)"
              aria-pressed={operationalMode === 'live_ops'}
              onClick={() => setOperationalMode('live_ops')}
              className={cn(
                'px-2.5 py-1 rounded transition-colors cursor-pointer whitespace-nowrap',
                operationalMode === 'live_ops'
                  ? 'bg-[#FFFFFF] text-[#0F172A] font-semibold shadow-2xs border border-[#CBD5E1]'
                  : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
              )}
            >
              Live Ops
            </button>
            <button
              type="button"
              aria-label="2001 Cloudburst Demo (150mm)"
              aria-pressed={operationalMode === 'demo_2001'}
              onClick={() => setOperationalMode('demo_2001')}
              className={cn(
                'px-2.5 py-1 rounded transition-colors cursor-pointer whitespace-nowrap',
                operationalMode === 'demo_2001'
                  ? 'bg-[#DC2626] text-white font-semibold'
                  : 'text-[#64748B] hover:text-[#DC2626]'
              )}
            >
              2001 Demo
            </button>
          </div>

          <button
            type="button"
            onClick={() => refreshWeather()}
            disabled={isSyncingWeather || isHistoric2001}
            title={
              isHistoric2001
                ? 'July 23, 2001 Islamabad-Rawalpindi historical cloudburst weather archive active'
                : 'Synchronize Open-Meteo telemetry for Nullah Lai (33.65°N, 73.06°E)'
            }
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium whitespace-nowrap transition-colors',
              isHistoric2001
                ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B] cursor-default'
                : isLiveWeather
                  ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46] hover:bg-[#D1FAE5] cursor-pointer'
                  : monsoonStressMode
                    ? 'bg-[#FFF7ED] border-[#FED7AA] text-[#9A3412] hover:bg-[#FFEDD5] cursor-pointer'
                    : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E] hover:bg-[#FEF3C7] cursor-pointer'
            )}
          >
            <RefreshCw
              className={cn('w-3.5 h-3.5', !isHistoric2001 && isSyncingWeather && 'animate-spin')}
            />
            <span className="hidden sm:inline">
              {isHistoric2001
                ? '2001 Archive'
                : isSyncingWeather
                  ? 'Syncing...'
                  : isLiveWeather
                    ? 'Open-Meteo Live'
                    : monsoonStressMode
                      ? 'Stress Test'
                      : 'Fallback'}
            </span>
          </button>

          <div
            title="Last synchronization timestamp (Asia/Karachi)"
            className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] font-mono text-[#334155] whitespace-nowrap"
          >
            <Clock className="w-3 h-3 text-[#0F766E]" />
            <span>{weather.fetchedAtPkt}</span>
          </div>

          <div className="hidden xl:flex items-center gap-1">
            {UTILITY_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    cn(
                      'p-1.5 rounded-md border transition-colors',
                      isActive
                        ? 'bg-[#F1F5F9] border-[#CBD5E1] text-[#0F172A]'
                        : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                    )
                  }
                >
                  <Icon className="w-4 h-4" />
                </NavLink>
              );
            })}
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="System notifications"
              className="relative p-1.5 rounded-md bg-[#FFFFFF] border border-[#E2E8F0] text-[#334155] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#DC2626] text-[11px] font-mono font-semibold text-white flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setNotifOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-md bg-white border border-[#E2E8F0] shadow-[0_8px_24px_rgba(15,23,42,0.12)] z-50 overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0F172A]">
                      System Activity ({notifications.length})
                    </span>
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      className="flex items-center gap-1 text-[11px] font-medium text-[#1D4ED8] hover:underline cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark read
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[#F1F5F9]">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          'p-3 text-xs space-y-1',
                          !n.read && 'bg-[#EFF6FF]/60'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#0F172A] flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 text-[#0F766E]" />
                            {n.title}
                          </span>
                          <span className="text-[11px] font-mono text-[#64748B]">
                            {n.timestamp.split(',').pop()?.trim()}
                          </span>
                        </div>
                        <p className="text-xs text-[#475569] leading-relaxed">
                          {n.message}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Mobile Nav Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-1.5 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] text-[#0F172A] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Mode Sub-bar */}
      <div className="md:hidden border-t border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Mobile operational mode switch"
          className="flex flex-1 items-center rounded-md bg-white border border-[#E2E8F0] p-0.5 text-xs font-medium"
        >
          <button
            type="button"
            aria-label="Live Operations Mobile (50mm)"
            aria-pressed={operationalMode === 'live_ops'}
            onClick={() => setOperationalMode('live_ops')}
            className={cn(
              'flex-1 px-2 py-1 rounded transition-colors cursor-pointer text-center',
              operationalMode === 'live_ops'
                ? 'bg-[#0F172A] text-white font-semibold'
                : 'text-[#64748B]'
            )}
          >
            Live Ops
          </button>
          <button
            type="button"
            aria-label="2001 Cloudburst Demo Mobile (150mm)"
            aria-pressed={operationalMode === 'demo_2001'}
            onClick={() => setOperationalMode('demo_2001')}
            className={cn(
              'flex-1 px-2 py-1 rounded transition-colors cursor-pointer text-center',
              operationalMode === 'demo_2001'
                ? 'bg-[#DC2626] text-white font-semibold'
                : 'text-[#64748B]'
            )}
          >
            2001 Demo
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Mobile navigation drawer"
          className="lg:hidden border-t border-[#E2E8F0] bg-white px-3 py-2.5 grid grid-cols-2 sm:grid-cols-3 gap-1.5"
        >
          {[...PRIMARY_NAV_ITEMS, ...UTILITY_NAV_ITEMS].map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium border',
                    isActive
                      ? 'bg-[#0F172A] text-white border-[#0F172A]'
                      : 'bg-[#F8FAFC] text-[#0F172A] border-[#E2E8F0]'
                  )
                }
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}
    </header>
  );
}
