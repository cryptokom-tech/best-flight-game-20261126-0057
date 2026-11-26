// The archipelago: an analytic height field built from island domes plus
// fractal detail, flattened where runways and pads sit. Height and surface
// colour are pure functions of (x, z), so physics, rendering and collision
// always agree.

import { fbm, clamp, lerp } from './rng.js';

export const WORLD_SEED = 20261126;

// Islands: centre, radius, peak height. Names show on the briefing map.
export const ISLANDS = [
  { name: 'Pulau Induk', x: 0, z: 0, radius: 950, peak: 118 },
  { name: 'Harbor Island', x: -1650, z: -950, radius: 520, peak: 62 },
  { name: 'Lighthouse Island', x: 1550, z: -1450, radius: 460, peak: 96 },
  { name: 'Turtle Cay', x: 2300, z: 750, radius: 700, peak: 150 },
  { name: 'Whaleback', x: -2450, z: 1250, radius: 820, peak: 185 },
  { name: 'North Reef', x: 350, z: -2650, radius: 620, peak: 104 },
  { name: 'South Palm', x: -950, z: 2650, radius: 680, peak: 112 },
];

// Flat areas carved into the height field: runways and pads.
// Each: centre, half-length (along heading), half-width, elevation, heading.
export const FLATS = [
  { id: 'home-runway', x: 0, z: 430, halfLen: 230, halfWid: 26, elev: 7, heading: 0 },
  { id: 'harbor-pad', x: -1650, z: -820, halfLen: 70, halfWid: 40, elev: 5, heading: 0.5 },
  { id: 'lighthouse-strip', x: 1345, z: -1245, halfLen: 130, halfWid: 20, elev: 16, heading: 0.9 },
];

function islandHeight(island, x, z) {
  const dx = x - island.x;
  const dz = z - island.z;
  const d = Math.sqrt(dx * dx + dz * dz) / island.radius;
  if (d >= 1.25) return -6;
  // Dome with a soft shoulder: broad beaches, a rounded summit.
  const dome = Math.pow(Math.max(0, 1 - d * d), 1.35);
  const detail = fbm(x, z, WORLD_SEED + island.x) * 14 * dome;
  return island.peak * dome + detail - 4;
}

function flatBlend(flat, x, z) {
  const cos = Math.cos(flat.heading);
  const sin = Math.sin(flat.heading);
  const dx = x - flat.x;
  const dz = z - flat.z;
  const along = dx * sin - dz * cos;
  const across = dx * cos + dz * sin;
  const da = Math.abs(along) - flat.halfLen;
  const dc = Math.abs(across) - flat.halfWid;
  const outside = Math.max(da, dc);
  if (outside <= 0) return 1;
  if (outside >= 90) return 0;
  const t = 1 - outside / 90;
  return t * t * (3 - 2 * t);
}

const heightCache = new Map();

export function terrainHeight(x, z) {
  // The height field is static; quantise to half-metre steps and cache so
  // the per-frame terrain mesh reuses samples instead of recomputing them.
  const qx = Math.round(x * 2) / 2;
  const qz = Math.round(z * 2) / 2;
  const key = `${qx},${qz}`;
  const cached = heightCache.get(key);
  if (cached !== undefined) return cached;
  let h = -6;
  for (const island of ISLANDS) {
    const ih = islandHeight(island, qx, qz);
    if (ih > h) h = ih;
  }
  for (const flat of FLATS) {
    const blend = flatBlend(flat, qx, qz);
    if (blend > 0) h = lerp(h, flat.elev, blend);
  }
  if (heightCache.size > 160000) heightCache.clear();
  heightCache.set(key, h);
  return h;
}

// Surface kind at a point, used for landing quality and colouring.
export function surfaceAt(x, z) {
  for (const flat of FLATS) {
    if (flatBlend(flat, x, z) >= 0.98) {
      return flat.id === 'harbor-pad' ? 'pad' : 'runway';
    }
  }
  const h = terrainHeight(x, z);
  if (h <= 0.4) return 'water';
  if (h < 2.2) return 'sand';
  return 'grass';
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixColor(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

export function rgbString(rgb) {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

// Flat-shaded terrain colour for a triangle with average height `h` and
// slope factor `shade` (0..1.3 from the sun direction).
export function terrainColor(h, shade, palette) {
  const sand = hexToRgb(palette.sand);
  const grass = hexToRgb(palette.grass);
  const dry = hexToRgb(palette.grassDry);
  const rock = hexToRgb(palette.rock);
  const peak = hexToRgb(palette.peak);
  let base;
  if (h < 1.6) base = sand;
  else if (h < 34) base = mixColor(grass, dry, clamp((h - 4) / 30, 0, 1));
  else if (h < 74) base = mixColor(dry, rock, clamp((h - 34) / 40, 0, 1));
  else base = mixColor(rock, peak, clamp((h - 74) / 60, 0, 1));
  const lit = clamp(shade * palette.ambient, 0.35, 1.25);
  return [
    clamp(Math.round(base[0] * lit), 0, 255),
    clamp(Math.round(base[1] * lit), 0, 255),
    clamp(Math.round(base[2] * lit), 0, 255),
  ];
}
