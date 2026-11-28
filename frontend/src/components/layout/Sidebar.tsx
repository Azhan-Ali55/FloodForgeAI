import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  FileBarChart2,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  Settings,
  Shield,
  X,
} from 'lucide-react';
import { cn } from '../../utils/cn';

const PRIMARY_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/monitoring', label: 'Live Monitoring', icon: Activity, end: false },
  { to: '/map', label: 'Flood Map', icon: MapIcon, end: false },
  { to: '/simulation', label: 'Simulation', icon: FlaskConical, end: false },
  { to: '/mitigation', label: 'Mitigation', icon: Shield, end: false },
  { to: '/reports', label: 'Reports', icon: FileBarChart2, end: false },
];

const BOTTOM_NAV = [
  { to: '/health', label: 'Model Health', icon: HeartPulse, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

/** Islamabad landscape: Margalla Hills + Nullah Lai water + vegetation */
function IslamabadLandscape() {
  return (
    <svg
      viewBox="0 0 220 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="w-full"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* Sky fade */}
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B2039" stopOpacity="0" />
          <stop offset="100%" stopColor="#0B2039" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#104C5C" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="hillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F4C3A" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#063B2F" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* Far mountains (Margalla) */}
      <path
        d="M0 68 L18 44 L36 55 L54 32 L72 50 L90 28 L108 46 L126 24 L144 42 L162 30 L180 48 L198 22 L220 40 L220 100 L0 100Z"
        fill="url(#hillGrad)"
        opacity="0.5"
      />

      {/* Mid hills */}
      <path
        d="M0 80 L28 60 L50 72 L76 54 L100 68 L128 50 L152 65 L176 52 L200 62 L220 55 L220 100 L0 100Z"
        fill="#063B2F"
        opacity="0.65"
      />

      {/* Foreground ridge */}
      <path
        d="M0 88 L40 76 L80 82 L120 70 L160 80 L200 72 L220 78 L220 100 L0 100Z"
        fill="#042E24"
        opacity="0.8"
      />

      {/* Nullah Lai water */}
      <path
        d="M0 92 Q28 88 55 91 Q82 94 110 90 Q138 86 165 90 Q192 94 220 92 L220 100 L0 100Z"
        fill="url(#waterGrad)"
      />

      {/* Water shimmer lines */}
      <path d="M20 93 Q45 91 70 93" stroke="#38BDF8" strokeWidth="0.5" strokeOpacity="0.5" />
      <path d="M90 91.5 Q115 89.5 140 91.5" stroke="#38BDF8" strokeWidth="0.5" strokeOpacity="0.4" />
      <path d="M160 92.5 Q185 90.5 210 92.5" stroke="#38BDF8" strokeWidth="0.5" strokeOpacity="0.4" />

      {/* Trees left */}
      <rect x="8" y="77" width="2" height="8" fill="#0A4A30" opacity="0.8" />
      <ellipse cx="9" cy="75" rx="5" ry="6" fill="#0A4A30" opacity="0.75" />
      <rect x="22" y="79" width="2" height="6" fill="#0A4A30" opacity="0.7" />
      <ellipse cx="23" cy="77" rx="4" ry="5" fill="#0A4A30" opacity="0.65" />

      {/* Trees right */}
      <rect x="192" y="75" width="2" height="9" fill="#0A4A30" opacity="0.75" />
      <ellipse cx="193" cy="73" rx="5" ry="6" fill="#0A4A30" opacity="0.7" />
      <rect x="206" y="77" width="2" height="7" fill="#0A4A30" opacity="0.65" />
      <ellipse cx="207" cy="75" rx="4" ry="5" fill="#0A4A30" opacity="0.6" />

      {/* Sky overlay */}
      <rect x="0" y="0" width="220" height="100" fill="url(#skyGrad)" />
    </svg>
  );
}

/** Waveform decoration */
function WaveformDecor() {
  return (
    <svg viewBox="0 0 200 24" fill="none" aria-hidden="true" className="w-full opacity-20">
      <path
        d="M0 12 Q10 4 20 12 Q30 20 40 12 Q50 4 60 12 Q70 20 80 12 Q90 4 100 12 Q110 20 120 12 Q130 4 140 12 Q150 20 160 12 Q170 4 180 12 Q190 20 200 12"
        stroke="#38BDF8"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn('sidebar-nav-item', isActive && 'active')
      }
    >
      <Icon className="nav-icon" />
      <span>{label}</span>
    </NavLink>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();
  void location; // used implicitly via NavLink

  return (
    <aside
      className={cn(
        'hidden lg:flex fixed left-0 top-0 z-30 h-screen h-dvh flex-col transition-all duration-200',
        collapsed ? 'w-0 overflow-hidden' : 'w-56'
      )}
      aria-hidden={collapsed}
      style={{
        background: 'linear-gradient(180deg, #0B2039 0%, #104C5C 55%, #0B2039 100%)',
        borderRight: '1px solid rgba(56, 189, 248, 0.08)',
        boxShadow: '2px 0 24px rgba(11, 32, 57, 0.4)',
      }}
      aria-label="Primary navigation"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4 border-b border-white/8 flex-shrink-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(56,189,248,0.18)', border: '1px solid rgba(56,189,248,0.3)' }}
        >
          <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none" aria-hidden="true">
            <path
              d="M16 4C16 4 7.5 13.5 7.5 19.2C7.5 23.9 11.3 27.5 16 27.5C20.7 27.5 24.5 23.9 24.5 19.2C24.5 13.5 16 4 16 4Z"
              stroke="#38BDF8"
              strokeWidth="1.8"
              fill="rgba(15,118,110,0.4)"
            />
            <path
              d="M10.5 20.5C12.2 18.8 14.1 18.8 16 20.2C17.9 21.6 19.8 21.4 21.5 19.8"
              stroke="#38BDF8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-white font-semibold text-[14px] tracking-tight truncate">
            FloodForgeAI
          </div>
          <div className="text-[11px] text-white/45 truncate">Nullah Lai Intelligence</div>
        </div>
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 px-2.5 pt-3 space-y-0.5 overflow-y-auto min-h-0">
        {PRIMARY_NAV.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <div className="my-2 mx-2 border-t border-white/8" />

        {BOTTOM_NAV.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Landscape illustration */}
      <div className="flex-shrink-0">
        <div className="px-3 pb-1 opacity-60">
          <WaveformDecor />
        </div>
        <IslamabadLandscape />
      </div>

      {/* Collapse button for desktop */}
      <button
        type="button"
        onClick={onToggle}
        aria-label="Collapse sidebar"
        className="hidden lg:flex absolute -right-3 top-16 w-6 h-6 rounded-full items-center justify-center cursor-pointer z-10 transition-colors"
        style={{
          background: '#104C5C',
          border: '1px solid rgba(56,189,248,0.3)',
          color: 'rgba(255,255,255,0.7)',
        }}
      >
        <X className="w-3 h-3" />
      </button>
    </aside>
  );
}

/** Mobile overlay sidebar drawer */
export function MobileSidebarDrawer({
  open,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      closeButtonRef.current?.focus();

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', onKeyDown);
      };
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusRef?.current?.focus();
    }
  }, [open, onClose, returnFocusRef]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        className="fixed left-0 top-0 z-50 h-screen h-dvh flex flex-col lg:hidden"
        style={{
          width: 'min(260px, 82vw)',
          background: 'linear-gradient(180deg, #0B2039 0%, #104C5C 55%, #0B2039 100%)',
          borderRight: '1px solid rgba(56,189,248,0.1)',
          boxShadow: '4px 0 32px rgba(11,32,57,0.5)',
        }}
      >
        {/* Logo + Close */}
        <div className="flex items-center justify-between px-4 pt-5 pb-4 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(56,189,248,0.18)', border: '1px solid rgba(56,189,248,0.3)' }}
            >
              <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none" aria-hidden="true">
                <path
                  d="M16 4C16 4 7.5 13.5 7.5 19.2C7.5 23.9 11.3 27.5 16 27.5C20.7 27.5 24.5 23.9 24.5 19.2C24.5 13.5 16 4 16 4Z"
                  stroke="#38BDF8" strokeWidth="1.8" fill="rgba(15,118,110,0.4)"
                />
                <path
                  d="M10.5 20.5C12.2 18.8 14.1 18.8 16 20.2C17.9 21.6 19.8 21.4 21.5 19.8"
                  stroke="#38BDF8" strokeWidth="2" strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <div className="text-white font-semibold text-[14px]">FloodForgeAI</div>
              <div className="text-[11px] text-white/45">Nullah Lai Intelligence</div>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-2.5 pt-3 space-y-0.5 overflow-y-auto">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) => cn('sidebar-nav-item', isActive && 'active')}
            >
              <item.icon className="nav-icon" />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <div className="my-2 mx-2 border-t border-white/8" />
          {BOTTOM_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) => cn('sidebar-nav-item', isActive && 'active')}
            >
              <item.icon className="nav-icon" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex-shrink-0 hidden sm:block">
          <div className="px-3 pb-1 opacity-50">
            <WaveformDecor />
          </div>
          <IslamabadLandscape />
        </div>
      </aside>
    </>
  );
}

export function SidebarToggleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open navigation menu"
      className="p-2 rounded-lg border border-[#E2E8F0] bg-white text-[#10223D] hover:bg-[#F1F6FB] transition-colors cursor-pointer lg:hidden"
    >
      <Menu className="w-4 h-4" />
    </button>
  );
}
