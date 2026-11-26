import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  Bell,
  CheckCheck,
  Clock,
  CloudRain,
  FileBarChart2,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  RefreshCw,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useFloodForge } from '../../context/FloodForgeContext';
import { cn } from '../../utils/cn';

const TOP_NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/monitoring', label: 'Live Monitoring', icon: Activity },
  { to: '/map', label: 'Flood Risk Map', icon: MapIcon },
  { to: '/prediction', label: 'Predictions', icon: CloudRain },
  { to: '/reports', label: 'Reports', icon: FileBarChart2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function FloodForgeMunicipalLogo() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 min-w-0 flex-shrink-0">
      <div className="w-8 h-8 rounded bg-[#173C79] flex items-center justify-center shadow-xs">
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
            fill="rgba(85,168,95,0.35)"
          />
          <path
            d="M10.5 20.5C12.2 18.8 14.1 18.8 16 20.2C17.9 21.6 19.8 21.4 21.5 19.8"
            stroke="#55A85F"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="leading-tight min-w-0">
        <div className="font-heading font-bold text-[15px] text-[#173C79] tracking-tight truncate">
          FloodForgeAI
        </div>
        <div className="text-[10px] font-medium text-[#5A6A7E] hidden sm:block truncate">
          Municipal Environmental &amp; Flood Portal
        </div>
      </div>
    </NavLink>
  );
}

export function TopBar() {
  const {
    weather,
    isSyncingWeather,
    refreshWeather,
    notifications,
    markAllNotificationsRead,
  } = useFloodForge();

  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const isLiveWeather = weather.source === 'OPEN_METEO_LIVE';

  return (
    <header className="sticky top-0 z-40 bg-[#FFFFFF] border-b border-[#D6DCE4] shadow-[0_1px_3px_rgba(23,60,121,0.06)]">
      <div className="max-w-[1760px] mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-3">
        {/* Left: Branding + Horizontal Municipal Navigation */}
        <div className="flex items-center gap-5 min-w-0">
          <FloodForgeMunicipalLogo />

          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-1"
          >
            {TOP_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors whitespace-nowrap border-b-2',
                      isActive
                        ? 'text-[#173C79] bg-[#EEF3FA] border-[#173C79]'
                        : 'text-[#26364A] border-transparent hover:text-[#173C79] hover:bg-[#F5F6F7]'
                    )
                  }
                >
                  <Icon className="w-3.5 h-3.5 text-[#173C79]" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Right: Sync Status, Timestamp, Notifications, Mobile Menu */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshWeather()}
            disabled={isSyncingWeather}
            title="Synchronize Open-Meteo telemetry for Nullah Lai (33.65°N, 73.06°E)"
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border text-[11px] font-semibold transition-colors cursor-pointer',
              isLiveWeather
                ? 'bg-[#EDF7EE] border-[#55A85F]/60 text-[#2F6F37] hover:bg-[#E1F2E3]'
                : 'bg-[#FEF9E7] border-[#E0B422]/70 text-[#8A6700] hover:bg-[#FCF3CF]'
            )}
          >
            <RefreshCw
              className={cn('w-3.5 h-3.5', isSyncingWeather && 'animate-spin')}
            />
            <span className="hidden sm:inline">
              {isSyncingWeather
                ? 'Syncing...'
                : isLiveWeather
                  ? 'Open-Meteo Live'
                  : 'Fallback Data'}
            </span>
          </button>

          <div
            title="Last synchronization timestamp (Asia/Karachi)"
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] text-[11px] font-mono text-[#26364A]"
          >
            <Clock className="w-3 h-3 text-[#173C79]" />
            <span>{weather.fetchedAtPkt}</span>
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="System notifications"
              className="relative p-1.5 rounded-sm bg-[#F5F6F7] border border-[#D6DCE4] text-[#173C79] hover:bg-[#EEF3FA] transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#D94343] text-[10px] font-mono font-bold text-white flex items-center justify-center">
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
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded bg-white border border-[#CBD5E1] shadow-xl z-50 overflow-hidden">
                  <div className="px-3.5 py-2 bg-[#173C79] text-white flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Monitoring Log ({notifications.length})
                    </span>
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      className="flex items-center gap-1 text-[11px] text-white/90 hover:underline cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark read
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[#E6EAEF]">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          'p-3 text-xs space-y-1',
                          !n.read && 'bg-[#EEF3FA]/60'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#173C79] flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 text-[#244D8F]" />
                            {n.title}
                          </span>
                          <span className="text-[10px] font-mono text-[#5A6A7E]">
                            {n.timestamp.split(',').pop()?.trim()}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5A6A7E] leading-relaxed">
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
            className="lg:hidden p-1.5 rounded-sm border border-[#D6DCE4] bg-[#F5F6F7] text-[#173C79] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <nav className="lg:hidden border-t border-[#D6DCE4] bg-white px-3 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {TOP_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-2.5 py-2 rounded-sm text-xs font-semibold border',
                    isActive
                      ? 'bg-[#173C79] text-white border-[#173C79]'
                      : 'bg-[#F5F6F7] text-[#173C79] border-[#D6DCE4]'
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
