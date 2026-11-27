import type { MapRasterLayer, Scenario, SimResult, TwinGrid } from '../types/floodforge';

function lerpColor(
  c1: [number, number, number, number],
  c2: [number, number, number, number],
  t: number
): [number, number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * k),
    Math.round(c1[1] + (c2[1] - c1[1]) * k),
    Math.round(c1[2] + (c2[2] - c1[2]) * k),
    Math.round(c1[3] + (c2[3] - c1[3]) * k),
  ];
}

function sampleStops(
  stops: Array<[number, [number, number, number, number]]>,
  t: number
): [number, number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (x >= t0 && x <= t1) {
      return lerpColor(c0, c1, (x - t0) / Math.max(1e-9, t1 - t0));
    }
  }
  return stops[stops.length - 1][1];
}

// Municipal 4-tier environmental flood risk ramp (transparent -> Green -> Yellow -> Orange -> Red)
const FLOOD_STOPS: Array<[number, [number, number, number, number]]> = [
  [0.0, [220, 234, 213, 0]],
  [0.18, [85, 168, 95, 75]],   // #55A85F Safe Green
  [0.42, [242, 201, 76, 135]], // #F2C94C Moderate Yellow
  [0.7, [239, 135, 53, 175]],  // #EF8735 High Risk Orange
  [1.0, [217, 67, 67, 210]],   // #D94343 Critical Red
];

const RAINFALL_STOPS: Array<[number, [number, number, number, number]]> = [
  [0.0, [240, 244, 248, 20]],
  [0.35, [85, 168, 95, 110]],
  [0.7, [36, 77, 143, 155]],   // #244D8F Secondary Blue
  [1.0, [23, 60, 121, 195]],   // #173C79 Primary Navy Blue
];

const DEM_STOPS: Array<[number, [number, number, number, number]]> = [
  [0.0, [36, 77, 143, 165]],
  [0.35, [85, 168, 95, 150]],
  [0.7, [212, 198, 152, 145]],
  [1.0, [145, 122, 92, 165]],
];

const POP_STOPS: Array<[number, [number, number, number, number]]> = [
  [0.0, [255, 255, 255, 0]],
  [0.3, [242, 201, 76, 95]],
  [0.65, [239, 135, 53, 155]],
  [1.0, [217, 67, 67, 205]],
];

/**
 * Converts a 2D raster layer into a crisp PNG DataURL for Leaflet ImageOverlay.
 */
export function renderRasterOverlayDataUrl(
  layer: MapRasterLayer,
  twin: TwinGrid,
  simResult: SimResult,
  scenario: Scenario,
  baselineResult?: SimResult,
  viewMode: 'mitigated' | 'baseline' | 'delta' | 'compare' = 'mitigated'
): string {
  const { rows, cols, dem, population, buildings } = twin;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(cols, rows);
  const data = img.data;

  let minDem = Infinity;
  let maxDem = -Infinity;
  let maxPop = 1;
  if (layer === 'elevation') {
    for (let i = 0; i < dem.length; i++) {
      if (dem[i] < minDem) minDem = dem[i];
      if (dem[i] > maxDem) maxDem = dem[i];
    }
  } else if (layer === 'population') {
    for (let i = 0; i < population.length; i++) {
      if (population[i] > maxPop) maxPop = population[i];
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const p = idx * 4;
      let rgba: [number, number, number, number] = [0, 0, 0, 0];

      if (layer === 'flood_risk') {
        if (viewMode === 'delta' && baselineResult) {
          const delta = simResult.accumulation_mm[idx] - baselineResult.accumulation_mm[idx];
          if (delta < -2) {
            const k = Math.min(1, Math.abs(delta) / 35);
            rgba = [85, 168, 95, Math.round(90 + k * 140)];
          } else if (delta > 1.5) {
            const k = Math.min(1, delta / 25);
            rgba = [217, 67, 67, Math.round(100 + k * 125)];
          } else {
            rgba = [255, 255, 255, 0];
          }
        } else {
          const activeAcc =
            viewMode === 'baseline' && baselineResult
              ? baselineResult.accumulation_mm[idx]
              : simResult.accumulation_mm[idx];
          const norm = Math.max(0, Math.min(1, (activeAcc - 18) / 115));
          rgba = sampleStops(FLOOD_STOPS, norm);
        }
      } else if (layer === 'rainfall') {
        const rNorm = r / (rows - 1);
        const cNorm = c / (cols - 1);
        const core = Math.exp(-((rNorm - 0.55) ** 2 / 0.22 + (cNorm - 0.48) ** 2 / 0.25));
        const localRain = scenario.rainfall_mm_per_hr * (0.72 + 0.45 * core);
        const norm = Math.min(1, localRain / 130);
        rgba = sampleStops(RAINFALL_STOPS, norm);
      } else if (layer === 'elevation') {
        const norm = (dem[idx] - minDem) / Math.max(1, maxDem - minDem);
        rgba = sampleStops(DEM_STOPS, norm);
      } else if (layer === 'population') {
        const score = population[idx] + buildings[idx] * 2.5;
        const norm = Math.min(1, score / Math.max(20, maxPop * 0.85));
        rgba = sampleStops(POP_STOPS, norm);
      }

      data[p] = rgba[0];
      data[p + 1] = rgba[1];
      data[p + 2] = rgba[2];
      data[p + 3] = rgba[3];
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/**
 * Renders a crisp high-ground Safe Zones (<25 mm runoff) overlay for evacuation & staging guidance.
 */
export function renderSafeZonesOverlayDataUrl(
  twin: TwinGrid,
  simResult: SimResult
): string {
  const { rows, cols, dem } = twin;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(cols, rows);
  const data = img.data;
  const acc = simResult.accumulation_mm;

  let minDem = Infinity;
  let maxDem = -Infinity;
  for (let i = 0; i < dem.length; i++) {
    if (dem[i] < minDem) minDem = dem[i];
    if (dem[i] > maxDem) maxDem = dem[i];
  }
  const midDem = minDem + (maxDem - minDem) * 0.35;

  for (let i = 0; i < rows * cols; i++) {
    const p = i * 4;
    if (acc[i] < 25 && dem[i] >= midDem) {
      data[p] = 85;
      data[p + 1] = 168;
      data[p + 2] = 95;
      data[p + 3] = 95;
    } else {
      data[p + 3] = 0;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/**
 * Generates a subtle light-green vegetation base overlay from land cover classes.
 */
export function renderVegetationBaseUrl(twin: TwinGrid): string {
  const { rows, cols, land_cover } = twin;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(cols, rows);
  const data = img.data;

  for (let i = 0; i < rows * cols; i++) {
    const p = i * 4;
    const lc = land_cover[i];
    if (lc === 10) {
      data[p] = 162;
      data[p + 1] = 207;
      data[p + 2] = 148;
      data[p + 3] = 145;
    } else if (lc === 20 || lc === 30) {
      data[p] = 191;
      data[p + 1] = 224;
      data[p + 2] = 175;
      data[p + 3] = 115;
    } else if (lc === 40) {
      data[p] = 212;
      data[p + 1] = 232;
      data[p + 2] = 188;
      data[p + 3] = 90;
    } else {
      data[p + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/**
 * Generates a translucent Zone 1 (Upstream Islamabad Blue) vs. Zone 2 (Downstream Rawalpindi Amber) overlay.
 */
export function renderZoneOverlayDataUrl(twin: TwinGrid): string {
  const { rows, cols, zones } = twin;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(cols, rows);
  const data = img.data;

  for (let i = 0; i < rows * cols; i++) {
    const p = i * 4;
    const z = zones[i];
    if (z === 1) {
      data[p] = 23;
      data[p + 1] = 60;
      data[p + 2] = 121;
      data[p + 3] = 40;
    } else if (z >= 2) {
      data[p] = 239;
      data[p + 1] = 135;
      data[p + 2] = 53;
      data[p + 3] = 40;
    } else {
      data[p + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
