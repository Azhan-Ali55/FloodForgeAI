import type {
  FacilityRecord,
  LandCoverCode,
  RoadCorridor,
  StudyAreaId,
  TwinGrid,
  ZoneMeta,
} from '../types/floodforge';
import { cellToLatLon, PILOT_CONFIG } from './pilotConfig';

function createRng(seed: number) {
  let state = (seed + 0x6d2b79f5) >>> 0;
  const uniform01 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (mean = 0, std = 1): number => {
    const u1 = Math.max(1e-12, uniform01());
    const u2 = uniform01();
    return mean + Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2) * std;
  };
  const poisson = (lambda: number): number => {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= uniform01();
    } while (p > L);
    return k - 1;
  };
  return { uniform01, normal, poisson };
}

interface ZoneBlueprint {
  id: number;
  name: string;
  sector: 'Islamabad' | 'Rawalpindi';
  rRange: [number, number]; // normalized [0..1]
  cRange: [number, number];
  density: string;
}

const ZONE_BLUEPRINTS: ZoneBlueprint[] = [
  { id: 1, name: 'I-10 Sector & Nullah Head', sector: 'Islamabad', rRange: [0.0, 0.25], cRange: [0.0, 0.34], density: 'Medium-High Urban' },
  { id: 2, name: 'I-9 Industrial & IJP North', sector: 'Islamabad', rRange: [0.0, 0.25], cRange: [0.34, 0.67], density: 'Industrial / Impervious' },
  { id: 3, name: 'Faizabad & Shakrial North', sector: 'Islamabad', rRange: [0.0, 0.25], cRange: [0.67, 1.0], density: 'Mixed Urban' },
  { id: 4, name: 'Pir Wadhai & Carriage Corridor', sector: 'Rawalpindi', rRange: [0.25, 0.5], cRange: [0.0, 0.34], density: 'Dense Commercial' },
  { id: 5, name: 'Katarian Bridge Sector', sector: 'Rawalpindi', rRange: [0.25, 0.5], cRange: [0.34, 0.67], density: 'High-Density Riparian' },
  { id: 6, name: 'Pandora & Satellite Town West', sector: 'Rawalpindi', rRange: [0.25, 0.5], cRange: [0.67, 1.0], density: 'Dense Residential' },
  { id: 7, name: 'Dhoke Hassu', sector: 'Rawalpindi', rRange: [0.5, 0.75], cRange: [0.0, 0.34], density: 'Very High Density' },
  { id: 8, name: 'Khayaban-e-Sir Syed', sector: 'Rawalpindi', rRange: [0.5, 0.75], cRange: [0.34, 0.67], density: 'Critical Floodplain' },
  { id: 9, name: 'Satellite Town East & Murree Rd', sector: 'Rawalpindi', rRange: [0.5, 0.75], cRange: [0.67, 1.0], density: 'Urban Arterial' },
  { id: 10, name: 'Ratta Amral', sector: 'Rawalpindi', rRange: [0.75, 1.0], cRange: [0.0, 0.34], density: 'Very High Density' },
  { id: 11, name: 'Gawalmandi & Arya Mohalla', sector: 'Rawalpindi', rRange: [0.75, 1.0], cRange: [0.34, 0.67], density: 'Historic Flood Trough' },
  { id: 12, name: 'Naya Mohalla & Liaquat Bagh', sector: 'Rawalpindi', rRange: [0.75, 1.0], cRange: [0.67, 1.0], density: 'Dense Old City' },
];

const FACILITY_BLUEPRINTS: Array<{
  id: string;
  name: string;
  type: FacilityRecord['type'];
  rNorm: number;
  cNorm: number;
}> = [
  { id: 'fac-01', name: 'FG Polyclinic & Health Unit I-10', type: 'hospital', rNorm: 0.14, cNorm: 0.22 },
  { id: 'fac-02', name: 'IESCO 132kV Substation I-9', type: 'substation', rNorm: 0.17, cNorm: 0.51 },
  { id: 'fac-03', name: 'Rescue 1122 IJP Staging Post', type: 'rescue_1122', rNorm: 0.27, cNorm: 0.44 },
  { id: 'fac-04', name: 'WASA Pumping Station Katarian', type: 'wasa_station', rNorm: 0.38, cNorm: 0.49 },
  { id: 'fac-05', name: 'Holy Family Hospital Rawalpindi', type: 'hospital', rNorm: 0.44, cNorm: 0.77 },
  { id: 'fac-06', name: 'Govt. High School Dhoke Hassu', type: 'school', rNorm: 0.61, cNorm: 0.24 },
  { id: 'fac-07', name: 'Khayaban-e-Sir Syed Girls College', type: 'school', rNorm: 0.58, cNorm: 0.52 },
  { id: 'fac-08', name: 'Benazir Bhutto Hospital', type: 'hospital', rNorm: 0.64, cNorm: 0.83 },
  { id: 'fac-09', name: 'WASA Tube Well & Sump Ratta Amral', type: 'wasa_station', rNorm: 0.80, cNorm: 0.29 },
  { id: 'fac-10', name: 'Rescue 1122 Gawalmandi Command', type: 'rescue_1122', rNorm: 0.82, cNorm: 0.48 },
  { id: 'fac-11', name: 'DHQ Hospital Rawalpindi', type: 'hospital', rNorm: 0.88, cNorm: 0.62 },
  { id: 'fac-12', name: 'Gordon College & Civic Shelter', type: 'school', rNorm: 0.85, cNorm: 0.78 },
];

const twinCache = new Map<string, TwinGrid>();

/**
 * Generates a deterministic, geospatially anchored 30 m screening-level digital twin
 * for the selected Nullah Lai sub-catchment (EPSG:32643).
 */
export function buildNullahLaiTwin(
  studyAreaId: StudyAreaId = 'nullah_lai_basin',
  seed = 42
): TwinGrid {
  const cacheKey = `${studyAreaId}:${seed}`;
  const cached = twinCache.get(cacheKey);
  if (cached) return cached;

  const areaCfg = PILOT_CONFIG.studyAreas[studyAreaId];
  const rows = areaCfg.rows;
  const cols = areaCfg.cols;
  const bbox = areaCfg.bbox_wgs84;
  const cellSizeM = PILOT_CONFIG.grid.cell_size_m;
  const total = rows * cols;
  const rng = createRng(seed + studyAreaId.length * 17);

  const dem = new Float64Array(total);
  const land_cover = new Int32Array(total);
  const f_imp = new Float64Array(total);
  const population = new Float64Array(total);
  const buildings = new Int32Array(total);
  const roads = new Uint8Array(total);
  const road_segments = new Int32Array(total);
  const zones = new Int32Array(total);

  // Build ZoneMeta with real WGS84 rectangles
  const zone_meta: ZoneMeta[] = ZONE_BLUEPRINTS.map((zb) => {
    const south = bbox.north - zb.rRange[1] * (bbox.north - bbox.south);
    const north = bbox.north - zb.rRange[0] * (bbox.north - bbox.south);
    const west = bbox.west + zb.cRange[0] * (bbox.east - bbox.west);
    const east = bbox.west + zb.cRange[1] * (bbox.east - bbox.west);
    return {
      id: zb.id,
      name: zb.name,
      sector: zb.sector,
      bounds: { south, west, north, east },
      polygon: [
        [north, west],
        [north, east],
        [south, east],
        [south, west],
      ],
      populationDensityLabel: zb.density,
    };
  });

  // Main Nullah Lai channel centerline column by normalized row
  const channelColNorm = (rNorm: number) =>
    0.46 + 0.08 * Math.sin(rNorm * Math.PI * 1.65) + 0.04 * rNorm;

  for (let r = 0; r < rows; r++) {
    const rNorm = r / (rows - 1);
    const mainC = channelColNorm(rNorm);
    // Tributary 1 (West: I-10 / Pir Wadhai branch joining near rNorm = 0.36)
    const tribWestC = rNorm < 0.38 ? 0.18 + (rNorm / 0.38) * (mainC - 0.18) : -1;
    // Tributary 2 (East: I-9 / Pandora branch joining near rNorm = 0.45)
    const tribEastC = rNorm < 0.46 ? 0.78 - (rNorm / 0.46) * (0.78 - mainC) : -1;

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const cNorm = c / (cols - 1);

      // Assign zone ID (1..12)
      let zId = 1;
      for (const zb of ZONE_BLUEPRINTS) {
        if (
          rNorm >= zb.rRange[0] &&
          rNorm <= zb.rRange[1] + 1e-6 &&
          cNorm >= zb.cRange[0] &&
          cNorm <= zb.cRange[1] + 1e-6
        ) {
          zId = zb.id;
          break;
        }
      }
      zones[idx] = zId;

      // Distance to main Nullah Lai thalweg & tributaries
      const distMain = Math.abs(cNorm - mainC);
      const distWest = tribWestC >= 0 ? Math.abs(cNorm - tribWestC) : 99;
      const distEast = tribEastC >= 0 ? Math.abs(cNorm - tribEastC) : 99;
      const distChannel = Math.min(distMain, distWest * 1.35, distEast * 1.45);

      // Realistic North-to-South slope (542m Islamabad -> 493m Rawalpindi) + valley incision + local micro-basins
      const northSouthSlope = 542 - 46 * rNorm;
      const valleyCrossSection = 14.5 * Math.pow(Math.min(1, distChannel / 0.45), 1.35);
      // Gawalmandi & Khayaban low floodplain bowls
      const gawalmandiBowl =
        -2.8 * Math.exp(-((rNorm - 0.82) ** 2 / 0.012 + (cNorm - 0.5) ** 2 / 0.018));
      const khayabanBowl =
        -2.1 * Math.exp(-((rNorm - 0.56) ** 2 / 0.01 + (cNorm - 0.49) ** 2 / 0.015));

      dem[idx] = Number(
        (northSouthSlope + valleyCrossSection + gawalmandiBowl + khayabanBowl + rng.normal(0, 0.25)).toFixed(2)
      );

      // Land cover (ESA WorldCover proxy) + continuous imperviousness f_imp
      const isMainWater = distMain < 0.018;
      const isTribWater = (tribWestC >= 0 && distWest < 0.011) || (tribEastC >= 0 && distEast < 0.011);

      let lc: LandCoverCode = 50;
      let imp = 0.72;

      if (isMainWater || isTribWater) {
        lc = 80;
        imp = 1.0;
      } else if (rNorm < 0.16 && (cNorm < 0.22 || cNorm > 0.78)) {
        // Green belts & Margalla foothills buffer / parks
        lc = rng.uniform01() < 0.55 ? 10 : 30;
        imp = 0.12 + rng.uniform01() * 0.15;
      } else if (distChannel < 0.065 && rNorm < 0.35) {
        // Vegetated nullah banks in upper Islamabad reach
        lc = rng.uniform01() < 0.4 ? 20 : 50;
        imp = lc === 20 ? 0.28 : 0.78;
      } else if (rNorm > 0.35) {
        // Dense Rawalpindi urban wards
        lc = 50;
        imp = Math.min(0.96, 0.76 + (rNorm - 0.35) * 0.24 + rng.normal(0, 0.05));
      } else {
        // Islamabad I-9 / I-10 mixed industrial & sector fabric
        const u = rng.uniform01();
        if (u < 0.76) {
          lc = 50;
          imp = 0.65 + rng.uniform01() * 0.25;
        } else if (u < 0.9) {
          lc = 30;
          imp = 0.22 + rng.uniform01() * 0.12;
        } else {
          lc = 60;
          imp = 0.42 + rng.uniform01() * 0.12;
        }
      }

      land_cover[idx] = lc;
      f_imp[idx] = Math.max(0.05, Math.min(1.0, Number(imp.toFixed(3))));

      // Buildings & Population (higher density in Rawalpindi wards 4..12)
      const densityFactor = rNorm > 0.3 ? 1.0 + (rNorm - 0.3) * 1.15 : 0.75;
      const bCount =
        lc === 80
          ? 0
          : lc === 50
            ? Math.max(1, rng.poisson(4.8 * densityFactor))
            : rng.uniform01() < 0.12
              ? 1
              : 0;
      buildings[idx] = bCount;
      population[idx] = Number((bCount * (4.4 + rng.uniform01() * 2.1)).toFixed(1));
    }
  }

  // Generate authentic road corridors & rasterize onto grid
  const roadCorridorSpecs: Array<{
    id: string;
    name: string;
    classification: RoadCorridor['classification'];
    pointsNorm: Array<[number, number]>;
    zoneNames: string[];
  }> = [
    {
      id: 'rd-ijp',
      name: 'IJP Road (Islamabad–Rawalpindi Boundary)',
      classification: 'Primary Arterial',
      pointsNorm: [
        [0.25, 0.02],
        [0.25, 0.5],
        [0.25, 0.98],
      ],
      zoneNames: ['I-10 Sector & Nullah Head', 'I-9 Industrial & IJP North', 'Katarian Bridge Sector'],
    },
    {
      id: 'rd-murree',
      name: 'Murree Road Corridor',
      classification: 'Primary Arterial',
      pointsNorm: [
        [0.08, 0.88],
        [0.45, 0.82],
        [0.72, 0.74],
        [0.95, 0.66],
      ],
      zoneNames: ['Pandora & Satellite Town West', 'Satellite Town East & Murree Rd', 'Naya Mohalla & Liaquat Bagh'],
    },
    {
      id: 'rd-kss',
      name: 'Khayaban-e-Sir Syed & Katarian Rd',
      classification: 'Urban Corridor',
      pointsNorm: [
        [0.28, 0.42],
        [0.52, 0.46],
        [0.74, 0.44],
        [0.92, 0.50],
      ],
      zoneNames: ['Katarian Bridge Sector', 'Khayaban-e-Sir Syed', 'Gawalmandi & Arya Mohalla'],
    },
    {
      id: 'rd-pirwadhai',
      name: 'Pir Wadhai – Dhoke Hassu Arterial',
      classification: 'Urban Corridor',
      pointsNorm: [
        [0.28, 0.18],
        [0.56, 0.20],
        [0.84, 0.24],
      ],
      zoneNames: ['Pir Wadhai & Carriage Corridor', 'Dhoke Hassu', 'Ratta Amral'],
    },
    {
      id: 'rd-gawalmandi',
      name: 'Gawalmandi – Ratta Amral Bridge Crossing',
      classification: 'Bridge Crossing',
      pointsNorm: [
        [0.78, 0.14],
        [0.80, 0.48],
        [0.82, 0.84],
      ],
      zoneNames: ['Ratta Amral', 'Gawalmandi & Arya Mohalla', 'Naya Mohalla & Liaquat Bagh'],
    },
  ];

  const road_corridors: RoadCorridor[] = roadCorridorSpecs.map((spec, sIdx) => {
    const segId = sIdx + 1;
    const coords: Array<[number, number]> = [];
    for (let k = 0; k < spec.pointsNorm.length - 1; k++) {
      const [r0, c0] = spec.pointsNorm[k];
      const [r1, c1] = spec.pointsNorm[k + 1];
      const steps = 40;
      for (let t = 0; t <= steps; t++) {
        const frac = t / steps;
        const rn = r0 + (r1 - r0) * frac;
        const cn = c0 + (c1 - c0) * frac;
        const rr = Math.min(rows - 1, Math.max(0, Math.round(rn * (rows - 1))));
        const cc = Math.min(cols - 1, Math.max(0, Math.round(cn * (cols - 1))));
        const idx = rr * cols + cc;
        roads[idx] = 1;
        road_segments[idx] = segId;
        if (t === 0 || t === steps || t % 10 === 0) {
          const { lat, lon } = cellToLatLon(rr, cc, rows, cols, bbox);
          coords.push([lat, lon]);
        }
      }
    }
    return {
      id: spec.id,
      name: spec.name,
      classification: spec.classification,
      coords,
      zoneNames: spec.zoneNames,
    };
  });

  // Rasterize facilities & create FacilityRecord list
  const facilities: Record<string, Uint8Array> = {
    hospital: new Uint8Array(total),
    school: new Uint8Array(total),
    rescue_1122: new Uint8Array(total),
    substation: new Uint8Array(total),
    wasa_station: new Uint8Array(total),
  };

  const facility_records: FacilityRecord[] = FACILITY_BLUEPRINTS.map((fb) => {
    const r = Math.min(rows - 2, Math.max(1, Math.round(fb.rNorm * (rows - 1))));
    const c = Math.min(cols - 2, Math.max(1, Math.round(fb.cNorm * (cols - 1))));
    const idx = r * cols + c;
    facilities[fb.type][idx] = 1;
    const { lat, lon } = cellToLatLon(r, c, rows, cols, bbox);
    const zId = zones[idx];
    const zName = zone_meta.find((z) => z.id === zId)?.name ?? `Zone ${zId}`;
    return {
      id: fb.id,
      name: fb.name,
      type: fb.type,
      row: r,
      col: c,
      lat,
      lon,
      zoneId: zId,
      zoneName: zName,
    };
  });

  // Extract waterway polylines for vector overlay
  const mainStreamCoords: Array<[number, number]> = [];
  const westTribCoords: Array<[number, number]> = [];
  const eastTribCoords: Array<[number, number]> = [];

  for (let r = 0; r < rows; r += 3) {
    const rNorm = r / (rows - 1);
    const mc = Math.round(channelColNorm(rNorm) * (cols - 1));
    const pMain = cellToLatLon(r, mc, rows, cols, bbox);
    mainStreamCoords.push([pMain.lat, pMain.lon]);

    if (rNorm <= 0.38) {
      const wc = Math.round((0.18 + (rNorm / 0.38) * (channelColNorm(rNorm) - 0.18)) * (cols - 1));
      const pw = cellToLatLon(r, wc, rows, cols, bbox);
      westTribCoords.push([pw.lat, pw.lon]);
    }
    if (rNorm <= 0.46) {
      const ec = Math.round((0.78 - (rNorm / 0.46) * (0.78 - channelColNorm(rNorm))) * (cols - 1));
      const pe = cellToLatLon(r, ec, rows, cols, bbox);
      eastTribCoords.push([pe.lat, pe.lon]);
    }
  }

  const twin: TwinGrid = {
    studyAreaId,
    rows,
    cols,
    bbox_wgs84: bbox,
    dem,
    land_cover,
    f_imp,
    population,
    buildings,
    roads,
    road_segments,
    zones,
    facilities,
    zone_meta,
    facility_records,
    waterway_paths: [
      { name: 'Nullah Lai Main Channel', coords: mainStreamCoords },
      { name: 'I-10 / Pir Wadhai Tributary', coords: westTribCoords },
      { name: 'I-9 / Katarian Tributary', coords: eastTribCoords },
    ],
    road_corridors,
    cell_size_m: cellSizeM,
    crs: PILOT_CONFIG.grid.crs,
    seed,
  };

  twinCache.set(cacheKey, twin);
  return twin;
}
