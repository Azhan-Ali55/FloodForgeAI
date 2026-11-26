import type {
  AlertTier,
  InterventionType,
  LandCoverCode,
  StudyAreaId,
} from '../types/floodforge';

/**
 * Pilot configuration aligned with configs/pilot.yaml and Nullah Lai basin specs.
 * All cost/unit figures are screening-level placeholders unless connected to official BoQ rates.
 */
export const PILOT_CONFIG = {
  studyAreas: {
    nullah_lai_basin: {
      id: 'nullah_lai_basin' as StudyAreaId,
      name: 'Nullah Lai Full Sub-Catchment',
      shortName: 'Nullah Lai Basin',
      region: 'Rawalpindi–Islamabad',
      bbox_wgs84: { west: 73.028, south: 33.588, east: 73.088, north: 33.662 },
      center: [33.625, 73.058] as [number, number],
      defaultZoom: 13,
      rows: 96,
      cols: 96,
    },
    katarian_gawalmandi: {
      id: 'katarian_gawalmandi' as StudyAreaId,
      name: 'Katarian–Gawalmandi Urban Reach',
      shortName: 'Katarian–Gawalmandi',
      region: 'Rawalpindi Central',
      bbox_wgs84: { west: 73.038, south: 33.592, east: 73.074, north: 33.634 },
      center: [33.613, 73.056] as [number, number],
      defaultZoom: 14,
      rows: 96,
      cols: 96,
    },
    upper_islamabad_tributaries: {
      id: 'upper_islamabad_tributaries' as StudyAreaId,
      name: 'Upper Islamabad Tributaries (I-9 / I-10)',
      shortName: 'Upper Tributaries',
      region: 'Islamabad–IJP Corridor',
      bbox_wgs84: { west: 73.030, south: 33.628, east: 73.084, north: 33.668 },
      center: [33.648, 73.057] as [number, number],
      defaultZoom: 13,
      rows: 96,
      cols: 96,
    },
  },
  grid: {
    crs: 'EPSG:32643',
    cell_size_m: 30,
    flood_depth_threshold_m: 0.15,
    exposure_threshold_mm: 50,
  },
  weather: {
    lat: 33.65,
    lon: 73.06,
    timezone: 'Asia/Karachi',
    horizon_hours: 72,
    past_days: 7,
    api_decay_k: 0.85,
  },
  scenario_limits: {
    rainfall_mm_per_hr: { min: 10, max: 160, default: 52, step: 2 },
    duration_hr: { min: 1, max: 12, default: 3, step: 0.5 },
    budget_pkr: { min: 10_000_000, max: 400_000_000, default: 100_000_000, step: 5_000_000 },
  },
  runoff_coefficients: {
    10: 0.15, // Tree cover
    20: 0.25, // Shrubland
    30: 0.30, // Grassland
    40: 0.35, // Cropland
    50: 0.85, // Built-up urban
    60: 0.50, // Bare / sparse
    80: 1.00, // Water / channel
  } as Record<LandCoverCode, number>,
  land_cover_labels: {
    10: 'Tree Cover',
    20: 'Shrubland',
    30: 'Grassland',
    40: 'Cropland',
    50: 'Built-Up Impervious',
    60: 'Bare / Sparse Soil',
    80: 'Water / Nullah Channel',
  } as Record<LandCoverCode, string>,
  interventions: {
    retention_pond: {
      type: 'retention_pond' as InterventionType,
      label: 'Retention Pond',
      pluralLabel: 'Retention Ponds',
      unitCostPkr: 7_500_000, // Municipal detention basin (placeholder BoQ)
      defaultSize: 18_000,
      unit: 'm³',
      color: '#16B8D4',
      description: 'Excavated urban detention basin capturing peak overland inflow upstream of choke points.',
    },
    permeable_surface: {
      type: 'permeable_surface' as InterventionType,
      label: 'Permeable Surface',
      pluralLabel: 'Permeable Surfaces',
      unitCostPkr: 4_800_000, // ~2 ha ward-scale permeable block (placeholder BoQ)
      defaultSize: 18_000,
      unit: 'm²',
      color: '#18B981',
      description: 'Porous pavements, bioswales, and green strips reducing impervious runoff coefficient by ~40%.',
    },
    drainage_upgrade: {
      type: 'drainage_upgrade' as InterventionType,
      label: 'Drainage Upgrade',
      pluralLabel: 'Drainage Upgrades',
      unitCostPkr: 6_400_000, // Storm conduit rehabilitation (placeholder BoQ)
      defaultSize: 12_000,
      unit: 'm³/hr',
      color: '#F59E0B',
      description: 'Storm-drain conduit rehabilitation & surcharge relief; audited for downstream risk transfer.',
    },
  } satisfies Record<
    InterventionType,
    {
      type: InterventionType;
      label: string;
      pluralLabel: string;
      unitCostPkr: number;
      defaultSize: number;
      unit: string;
      color: string;
      description: string;
    }
  >,
  alerts: {
    pmd_gauge_verified: false,
    thresholds_area_km2: {
      normal: 0.4,
      advisory: 0.9,
      watch: 1.6,
      warning: 2.5,
    },
  },
} as const;

export const ALERT_TIER_META: Record<
  AlertTier,
  { label: string; color: string; bg: string; border: string; summary: string }
> = {
  Normal: {
    label: 'LOW / NORMAL',
    color: '#55A85F',
    bg: 'rgba(85, 168, 95, 0.14)',
    border: 'rgba(85, 168, 95, 0.45)',
    summary: 'Routine basin monitoring; modeled accumulation within drainage baseline.',
  },
  Advisory: {
    label: 'MODERATE',
    color: '#B8860B',
    bg: 'rgba(242, 201, 76, 0.22)',
    border: 'rgba(242, 201, 76, 0.75)',
    summary: 'Localized street-ponding possible in low-lying impervious sectors.',
  },
  Watch: {
    label: 'HIGH',
    color: '#C75E10',
    bg: 'rgba(239, 135, 53, 0.16)',
    border: 'rgba(239, 135, 53, 0.55)',
    summary: 'Elevated runoff volume modeled along Nullah Lai mid-reach corridors.',
  },
  Warning: {
    label: 'CRITICAL',
    color: '#D94343',
    bg: 'rgba(217, 67, 67, 0.14)',
    border: 'rgba(217, 67, 67, 0.5)',
    summary: 'High screening-level exposure across dense Rawalpindi wards; verify PMD bulletins.',
  },
  Emergency: {
    label: 'CRITICAL (AUTHORIZED)',
    color: '#D94343',
    bg: 'rgba(217, 67, 67, 0.22)',
    border: 'rgba(217, 67, 67, 0.75)',
    summary: 'Agency-authorized Emergency tier enabled via PMD/NDMA override.',
  },
};

export const STATION_RISK_META: Record<
  'Low' | 'Moderate' | 'High' | 'Critical',
  { label: string; hex: string; textHex: string; bgHex: string; borderHex: string }
> = {
  Low: {
    label: 'Low Risk',
    hex: '#55A85F',
    textHex: '#2F6F37',
    bgHex: '#EDF7EE',
    borderHex: '#55A85F',
  },
  Moderate: {
    label: 'Moderate Risk',
    hex: '#F2C94C',
    textHex: '#8A6700',
    bgHex: '#FEF9E7',
    borderHex: '#E0B422',
  },
  High: {
    label: 'High Risk',
    hex: '#EF8735',
    textHex: '#A64D0B',
    bgHex: '#FDF1E7',
    borderHex: '#EF8735',
  },
  Critical: {
    label: 'Critical Risk',
    hex: '#D94343',
    textHex: '#A12323',
    bgHex: '#FBEBEB',
    borderHex: '#D94343',
  },
};

export function cellToLatLon(
  row: number,
  col: number,
  rows: number,
  cols: number,
  bbox: { west: number; south: number; east: number; north: number }
): { lat: number; lon: number } {
  const lat = bbox.north - ((row + 0.5) / rows) * (bbox.north - bbox.south);
  const lon = bbox.west + ((col + 0.5) / cols) * (bbox.east - bbox.west);
  return { lat, lon };
}

export function latLonToUtm43N(lat: number, lon: number): string {
  // Lightweight linear projection around Rawalpindi (33.62N, 73.06E -> ~320000E, 3722000N)
  const easting = Math.round(320000 + (lon - 73.06) * 92600);
  const northing = Math.round(3722000 + (lat - 33.62) * 110900);
  return `43N ${easting}E ${northing}N`;
}
