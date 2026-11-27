/**
 * Centralized Design Tokens for FloodForgeAI
 * Linear / Vercel / Mapbox inspired geospatial intelligence aesthetic:
 * Clean white/off-white surfaces, deep navy typography, restrained blue/teal accents,
 * and strict semantic risk colors.
 */
export const FF_TOKENS = {
  colors: {
    canvas: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F5F9',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
    navy: '#0F172A',
    navySecondary: '#334155',
    textMuted: '#64748B',
    accentBlue: '#1D4ED8',
    accentBlueSoft: '#EFF6FF',
    accentTeal: '#0F766E',
    accentTealSoft: '#F0FDFA',
    risk: {
      low: { text: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', hex: '#059669' },
      moderate: { text: '#92400E', bg: '#FFFBEB', border: '#FDE68A', hex: '#D97706' },
      high: { text: '#9A3412', bg: '#FFF7ED', border: '#FED7AA', hex: '#EA580C' },
      critical: { text: '#991B1B', bg: '#FEF2F2', border: '#FECACA', hex: '#DC2626' },
    },
  },
  radii: {
    sm: '4px',
    md: '6px',
    lg: '8px',
  },
  shadows: {
    card: '0 1px 2px rgba(15, 23, 42, 0.04)',
    popover: '0 8px 24px rgba(15, 23, 42, 0.12)',
  },
  typography: {
    minMetaPx: 11,
    bodySmPx: 12,
    bodyPx: 14,
  },
} as const;
