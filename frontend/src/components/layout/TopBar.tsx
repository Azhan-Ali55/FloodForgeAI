import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  Clock,
  MapPin,
  Menu,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useFloodForge } from '../../context/FloodForgeContext';
import { cn } from '../../utils/cn';

interface SlimTopBarProps {
  onMobileMenuOpen: () => void;
  onExpandSidebar: () => void;
  sidebarCollapsed: boolean;
}

export function SlimTopBar({ onMobileMenuOpen, onExpandSidebar, sidebarCollapsed }: SlimTopBarProps) {
  const {
    operationalMode,
    setOperationalMode,
    monsoonStressMode,
    weather,
    isSyncingWeather,
    refreshWeather,
    notifications,
    markAllNotificationsRead,
    monitoringStations,
    setSelectedStationId,
  } = useFloodForge();

  const navigate = useNavigate();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const filteredStations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return monitoringStations
      .filter(
        (st) =>
          st.name.toLowerCase().includes(q) ||
          st.location.toLowerCase().includes(q) ||
          st.sector.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [monitoringStations, searchQuery]);

  const handleSelectSearchStation = (stationId: string) => {
    setSelectedStationId(stationId);
    setSearchQuery('');
    setSearchFocused(false);
    if (location.pathname !== '/' && location.pathname !== '/map') {
      navigate('/map');
    }
  };
  const unreadCount = notifications.filter((n) => !n.read).length;
  const isHistoric2001 = operationalMode === 'demo_2001' && !monsoonStressMode;
  const isLiveWeather = !isHistoric2001 && weather.source === 'OPEN_METEO_LIVE';

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 h-13"
      style={{
        background: 'rgba(241, 246, 251, 0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #E2E8F0',
        minHeight: '52px',
      }}
    >
      {/* Left: mobile menu + sidebar expand + live status */}
      <div className="flex items-center gap-2">
        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={onMobileMenuOpen}
          aria-label="Open navigation"
          className="lg:hidden p-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[#10223D] hover:bg-[#F1F6FB] transition-colors cursor-pointer"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Expand sidebar on desktop when collapsed */}
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={onExpandSidebar}
            aria-label="Expand sidebar"
            className="hidden lg:flex p-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[#10223D] hover:bg-[#F1F6FB] transition-colors cursor-pointer items-center gap-1"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Live data pill */}
        <button
          type="button"
          onClick={() => !isHistoric2001 && refreshWeather()}
          disabled={isSyncingWeather || isHistoric2001}
          title={
            isHistoric2001
              ? 'July 23, 2001 Islamabad-Rawalpindi historical cloudburst archive active'
              : 'Synchronize Open-Meteo telemetry for Nullah Lai (33.65°N, 73.06°E)'
          }
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap transition-colors',
            isHistoric2001
              ? 'bg-red-50 border-red-200 text-red-700 cursor-default'
              : isLiveWeather
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 cursor-pointer'
                : monsoonStressMode
                  ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 cursor-pointer'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 cursor-pointer'
          )}
        >
          <RefreshCw className={cn('w-3 h-3', !isHistoric2001 && isSyncingWeather && 'animate-spin')} />
          <span className="hidden sm:inline">
            {isHistoric2001
              ? '2001 Archive'
              : isSyncingWeather
                ? 'Syncing…'
                : isLiveWeather
                  ? 'Open-Meteo Live'
                  : monsoonStressMode
                    ? 'Stress Test'
                    : 'Fallback'}
          </span>
        </button>

        {/* Timestamp */}
        <div
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#E2E8F0] text-[11px] font-mono text-[#64748B] whitespace-nowrap"
          title="Last sync (Asia/Karachi)"
        >
          <Clock className="w-3 h-3 text-[#0F766E]" />
          <span>{weather.fetchedAtPkt}</span>
        </div>

        {/* Station & Location Search */}
        <div className="relative hidden md:block">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#E2E8F0] focus-within:border-[#38BDF8] transition-colors w-44 xl:w-56">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] flex-shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Search station or sector…"
              aria-label="Search monitoring station or basin location"
              className="w-full bg-transparent text-xs text-[#10223D] placeholder:text-[#94A3B8] focus:outline-none"
            />
          </div>
          {searchFocused && searchQuery.trim().length > 0 && (
            <div
              className="absolute left-0 top-full mt-1.5 w-72 rounded-xl bg-white border border-[#E2E8F0] z-50 overflow-hidden"
              style={{ boxShadow: '0 8px 24px rgba(16,34,61,0.12)' }}
            >
              {filteredStations.length > 0 ? (
                <div className="divide-y divide-[#F1F6FB] max-h-60 overflow-y-auto">
                  {filteredStations.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onMouseDown={() => handleSelectSearchStation(st.id)}
                      className="w-full px-3 py-2 text-left hover:bg-[#F1F6FB] flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-[#0F766E] flex-shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-[#10223D] truncate">
                            {st.name}
                          </span>
                          <span className="block text-[11px] text-[#64748B] truncate">
                            {st.location} · {st.sector}
                          </span>
                        </span>
                      </span>
                      <span className="text-[10px] font-mono font-semibold text-[#0F766E] flex-shrink-0">
                        {st.riskLevel}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-2.5 text-xs text-[#64748B]">
                  No basin stations matching &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center: Mode selector */}
      <div
        role="group"
        aria-label="Operational mode"
        className="flex items-center rounded-full bg-white border border-[#E2E8F0] p-0.5 text-xs font-medium shadow-sm"
        style={{ boxShadow: '0 1px 4px rgba(16,34,61,0.06)' }}
      >
        <button
          type="button"
          aria-pressed={operationalMode === 'live_ops'}
          onClick={() => setOperationalMode('live_ops')}
          className={cn(
            'px-3 py-1 rounded-full transition-all cursor-pointer whitespace-nowrap',
            operationalMode === 'live_ops'
              ? 'bg-[#12345B] text-white font-semibold shadow-sm'
              : 'text-[#64748B] hover:text-[#10223D]'
          )}
        >
          Live Ops
        </button>
        <button
          type="button"
          aria-pressed={operationalMode === 'demo_2001'}
          onClick={() => setOperationalMode('demo_2001')}
          className={cn(
            'px-3 py-1 rounded-full transition-all cursor-pointer whitespace-nowrap',
            operationalMode === 'demo_2001'
              ? 'bg-[#DC2626] text-white font-semibold shadow-sm'
              : 'text-[#64748B] hover:text-[#DC2626]'
          )}
        >
          2001 Demo
        </button>
      </div>

      {/* Right: notification bell */}
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => setNotifOpen((v) => !v)}
          aria-label="System notifications"
          className="relative p-1.5 rounded-lg bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F6FB] hover:text-[#10223D] transition-colors cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#DC2626] text-[10px] font-bold text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setNotifOpen(false)}
              aria-hidden="true"
            />
            <div
              className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl bg-white border border-[#E2E8F0] z-50 overflow-hidden"
              style={{ boxShadow: '0 8px 24px rgba(16,34,61,0.12)' }}
            >
              <div className="px-4 py-2.5 bg-[#F1F6FB] border-b border-[#E2E8F0] flex items-center justify-between">
                <span className="text-xs font-semibold text-[#10223D]">
                  System Activity ({notifications.length})
                </span>
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  className="flex items-center gap-1 text-[11px] font-medium text-[#0F766E] hover:underline cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark read
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-[#F1F6FB]">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn('p-3 text-xs space-y-1', !n.read && 'bg-blue-50/40')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#10223D] flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-[#0F766E]" />
                        {n.title}
                      </span>
                      <span className="text-[11px] font-mono text-[#94A3B8]">
                        {n.timestamp.split(',').pop()?.trim()}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] leading-relaxed">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

// Legacy export kept for compatibility — now only used in AppShell via SlimTopBar
export function TopBar() {
  return <SlimTopBar onMobileMenuOpen={() => {}} onExpandSidebar={() => {}} sidebarCollapsed={false} />;
}
