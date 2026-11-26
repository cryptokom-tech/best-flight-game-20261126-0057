// World objects placed on the terrain: runways with markings and lights,
// fuel and cargo pads, ring courses, trees, buildings and the lighthouse.
// Everything is derived deterministically from the terrain, so the world is
// the same on every load.

import { FLATS, terrainHeight } from './terrain.js';
import { hash2, clamp } from './rng.js';

export const HOME_RUNWAY = FLATS[0];
export const HARBOR_PAD = FLATS[1];
export const LIGHTHOUSE_STRIP = FLATS[2];

export const LIGHTHOUSE = { x: 1720, z: -1560 };

// Ring courses per mission. Each ring: centre and the heading the pilot
// should be flying when passing through (the ring faces that way).
const BAY_COURSE = [
  { x: -680, y: 130, z: -360, heading: -0.75 },
  { x: -1020, y: 125, z: -620, heading: -0.85 },
  { x: -1280, y: 105, z: -1280, heading: -0.25 },
  { x: -620, y: 95, z: -1080, heading: 1.85 },
];

const STORM_COURSE = [
  { x: 520, y: 95, z: -420, heading: 0.8 },
  { x: 1150, y: 130, z: -950, heading: 0.7 },
  { x: 2050, y: 120, z: -1750, heading: 1.6 },
  { x: 2350, y: 105, z: -900, heading: 2.9 },
  { x: 1850, y: 90, z: -1250, heading: -2.2 },
];

export function buildCourse(courseName) {
  if (courseName === 'bay') return BAY_COURSE.map((r) => ({ ...r, passed: false }));
  if (courseName === 'storm') return STORM_COURSE.map((r) => ({ ...r, passed: false }));
  return [];
}

// A free-flight course: six rings scattered over the archipelago.
export function buildFreeCourse(rng) {
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const x = (rng() - 0.5) * 4200;
    const z = (rng() - 0.5) * 4200;
    rings.push({ x, y: 80 + rng() * 70, z, heading: rng() * Math.PI * 2, passed: false });
  }
  return rings;
}

// Trees near a point: deterministic scatter on grassy slopes. Returns at
// most `limit` trees within `radius` metres of (cx, cz).
export function treesNear(cx, cz, radius, limit) {
  const trees = [];
  const cell = 55;
  const gx0 = Math.floor((cx - radius) / cell);
  const gz0 = Math.floor((cz - radius) / cell);
  const gx1 = Math.floor((cx + radius) / cell);
  const gz1 = Math.floor((cz + radius) / cell);
  for (let gz = gz0; gz <= gz1 && trees.length < limit; gz++) {
    for (let gx = gx0; gx <= gx1 && trees.length < limit; gx++) {
      const r = hash2(gx, gz, 991);
      if (r > 0.42) continue;
      const x = gx * cell + hash2(gx, gz, 992) * cell;
      const z = gz * cell + hash2(gx, gz, 993) * cell;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz > radius * radius) continue;
      const h = terrainHeight(x, z);
      if (h < 3 || h > 58) continue;
      const slope = Math.abs(terrainHeight(x + 8, z) - h) + Math.abs(terrainHeight(x, z + 8) - h);
      if (slope > 7) continue;
      trees.push({ x, z, h, size: 5 + hash2(gx, gz, 994) * 5, hue: hash2(gx, gz, 995) });
    }
  }
  return trees;
}

// Buildings: the home airfield cluster and harbor sheds. Each building is a
// box with a prism roof; `lit` windows glow in the dusk palette.
export const BUILDINGS = [
  { x: 95, z: 300, w: 26, d: 16, h: 9, roof: '#a8503c', wall: '#e8e0cc', heading: 0 },
  { x: 130, z: 360, w: 20, d: 14, h: 8, roof: '#7a4a38', wall: '#ded2b8', heading: 0 },
  { x: 88, z: 520, w: 30, d: 18, h: 10, roof: '#5d7d8a', wall: '#e8e0cc', heading: 0 },
  { x: -110, z: 350, w: 18, d: 12, h: 7, roof: '#a8503c', wall: '#e2d6bc', heading: 0.2 },
  { x: -95, z: 470, w: 22, d: 15, h: 8, roof: '#8a6a48', wall: '#ece2c8', heading: -0.1 },
  { x: -1580, z: -760, w: 24, d: 14, h: 8, roof: '#6a7d8a', wall: '#ddd2ba', heading: 0.5 },
  { x: -1720, z: -880, w: 20, d: 12, h: 7, roof: '#a8503c', wall: '#e8e0cc', heading: 0.5 },
  { x: 1405, z: -1195, w: 16, d: 11, h: 6, roof: '#7a4a38', wall: '#ece2c8', heading: 0.9 },
];

// Control tower beside the home runway.
export const TOWER = { x: 70, z: 430, h: 22 };

// Fuel drums and cargo crates that mark the service pads.
export const PAD_PROPS = [
  { x: 46, z: 250, kind: 'fuel' },
  { x: -1600, z: -790, kind: 'fuel' },
  { x: -1700, z: -850, kind: 'cargo' },
  { x: 1385, z: -1200, kind: 'fuel' },
];

// Is the aircraft close enough to a service pad to refuel / load cargo?
export function servicePadAt(x, z) {
  const pads = [
    { id: 'home', x: 0, z: 250, r: 90 },
    { id: 'harbor', x: HARBOR_PAD.x, z: HARBOR_PAD.z, r: 95 },
    { id: 'lighthouse', x: LIGHTHOUSE_STRIP.x, z: LIGHTHOUSE_STRIP.z, r: 110 },
  ];
  for (const pad of pads) {
    const dx = x - pad.x;
    const dz = z - pad.z;
    if (dx * dx + dz * dz < pad.r * pad.r) return pad.id;
  }
  return null;
}

// Runway end points in world space, for threshold lights and landing checks.
export function runwayEnds(flat) {
  const fx = Math.sin(flat.heading);
  const fz = -Math.cos(flat.heading);
  return {
    a: { x: flat.x - fx * flat.halfLen, z: flat.z - fz * flat.halfLen },
    b: { x: flat.x + fx * flat.halfLen, z: flat.z + fz * flat.halfLen },
  };
}

export function clampToWorld(v) {
  return clamp(v, -3400, 3400);
}
