// Scene drawing: sky and sun, the water plane, the heightfield terrain mesh,
// the aircraft model built from boxes, target rings with light beams,
// runways with markings and PAPI lights, service pads, trees, buildings, the
// lighthouse and its rotating beam, drifting clouds and burst particles.
// Everything goes through the renderer's polygon queue except the sky.

import { VIEW_W, VIEW_H } from './config.js';
import { terrainHeight, terrainColor, FLATS } from './terrain.js';
import { BUILDINGS, TOWER, LIGHTHOUSE, PAD_PROPS, treesNear } from './world.js';
import { hexToRgb, shadeColor } from './renderer.js';
import { clamp, lerp, hash2 } from './rng.js';

const particles = [];

export function spawnBurst(x, y, z, rgb, count, spread) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 3 + Math.random() * spread;
    particles.push({
      x, y, z,
      vx: Math.cos(a) * v, vy: Math.random() * v * 0.9, vz: Math.sin(a) * v,
      life: 0.9 + Math.random() * 0.7, age: 0, rgb, size: 0.5 + Math.random() * 0.7, gravity: -3.5,
    });
  }
}

export function spawnPuff(x, y, z, rgb, size) {
  particles.push({ x, y, z, vx: 0, vy: 1.2, vz: 0, life: 1.4, age: 0, rgb, size, gravity: 0.6 });
}

function stepParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
  }
}

export function drawSky(ctx, renderer, camera, palette) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, palette.skyTop);
  grad.addColorStop(0.55, palette.skyHorizon);
  grad.addColorStop(1, palette.skyHorizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const sun = palette.sunDir;
  const sunPoint = {
    x: camera.x + sun[0] * 3000,
    y: camera.y + sun[1] * 3000,
    z: camera.z + sun[2] * 3000,
  };
  const s = renderer.projectWorld(sunPoint);
  if (s) {
    const glow = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, 150);
    glow.addColorStop(0, palette.sun);
    glow.addColorStop(0.25, 'rgba(255,240,200,0.55)');
    glow.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(s.x - 150, s.y - 150, 300, 300);
    ctx.fillStyle = palette.sun;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 17, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWater(renderer, camera, palette, time) {
  // A grid of quads so distance fog shades the sea gradually instead of
  // washing one huge polygon to the horizon colour.
  const deep = hexToRgb(palette.waterDeep);
  const cell = 420;
  const span = 6;
  const x0 = Math.floor(camera.x / cell) * cell - span * cell;
  const z0 = Math.floor(camera.z / cell) * cell - span * cell;
  for (let j = 0; j < span * 2; j++) {
    for (let i = 0; i < span * 2; i++) {
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      const vary = 0.97 + hash2(i + Math.floor(camera.x / cell), j + Math.floor(camera.z / cell), 777) * 0.06;
      renderer.poly([
        { x, y: 0, z },
        { x: x + cell, y: 0, z },
        { x: x + cell, y: 0, z: z + cell },
        { x, y: 0, z: z + cell },
      ], shadeColor(deep, vary));
    }
  }
  // Sun glints: deterministic sparkle points drifting on the surface.
  const water = hexToRgb(palette.water);
  const glintCell = 90;
  const gx0 = Math.floor((camera.x - 900) / glintCell);
  const gz0 = Math.floor((camera.z - 900) / glintCell);
  for (let gz = gz0; gz < gz0 + 20; gz++) {
    for (let gx = gx0; gx < gx0 + 20; gx++) {
      const r = hash2(gx, gz, 4242);
      if (r > 0.3) continue;
      const x = gx * glintCell + hash2(gx, gz, 4243) * glintCell;
      const z = gz * glintCell + hash2(gx, gz, 4244) * glintCell;
      if (terrainHeight(x, z) > 0.5) continue;
      const twinkle = 0.5 + 0.5 * Math.sin(time * 2.1 + r * 40);
      renderer.billboard({ x, y: 0.4, z }, 7, 1.1, (c, sx, sy, w, h) => {
        c.fillStyle = `rgba(${water[0] + 90},${water[1] + 90},${water[2] + 80},${0.35 * twinkle})`;
        c.fillRect(sx - w / 2, sy - h / 2, w, h);
      });
    }
  }
}

function terrainMesh(renderer, camera, palette, time, cell, extent, skipInner, yOffset = 0) {
  const sun = palette.sunDir;
  const x0 = Math.floor((camera.x - extent) / cell) * cell;
  const z0 = Math.floor((camera.z - extent) / cell) * cell;
  const n = Math.floor((extent * 2) / cell);
  const heights = [];
  for (let j = 0; j <= n; j++) {
    heights[j] = [];
    for (let i = 0; i <= n; i++) {
      heights[j][i] = terrainHeight(x0 + i * cell, z0 + j * cell);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * cell;
      const cz = z0 + (j + 0.5) * cell;
      if (skipInner && Math.abs(cx - camera.x) < skipInner && Math.abs(cz - camera.z) < skipInner) continue;
      const h00 = heights[j][i];
      const h10 = heights[j][i + 1];
      const h01 = heights[j + 1][i];
      const h11 = heights[j + 1][i + 1];
      const hAvg = (h00 + h10 + h01 + h11) / 4;
      if (hAvg < -1.2) continue; // under water: the water plane covers it
      const gx = (h10 + h11 - h00 - h01) / (2 * cell);
      const gz = (h01 + h11 - h00 - h10) / (2 * cell);
      const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      const dot = (-gx * sun[0] + sun[1] - gz * sun[2]) * inv;
      const shade = 0.72 + 0.5 * clamp(dot, 0, 1);
      let rgb = terrainColor(Math.max(hAvg, 0.2), shade, palette);
      const hMin = Math.min(h00, h10, h01, h11);
      if (hMin < -0.5) rgb = terrainColor(0.7, shade, palette); // shoreline triangle: sand, never grass teeth
      if (hAvg < 1.1) {
        const foam = 0.45 + 0.3 * Math.sin(time * 1.4 + cx * 0.04 + cz * 0.03);
        rgb = [
          Math.round(lerp(rgb[0], 245, foam * 0.6)),
          Math.round(lerp(rgb[1], 250, foam * 0.6)),
          Math.round(lerp(rgb[2], 248, foam * 0.6)),
        ];
      }
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      const d00 = Math.max(h00, -0.4) + yOffset;
      const d10 = Math.max(h10, -0.4) + yOffset;
      const d01 = Math.max(h01, -0.4) + yOffset;
      const d11 = Math.max(h11, -0.4) + yOffset;
      renderer.poly([
        { x, y: d00, z },
        { x: x + cell, y: d10, z },
        { x: x + cell, y: d11, z: z + cell },
      ], rgb);
      renderer.poly([
        { x, y: d00, z },
        { x: x + cell, y: d11, z: z + cell },
        { x, y: d01, z: z + cell },
      ], rgb);
    }
  }
}

function aircraftBasis(plane) {
  const cy = Math.cos(plane.heading);
  const sy = Math.sin(plane.heading);
  const cp = Math.cos(plane.pitch);
  const sp = Math.sin(plane.pitch);
  const forward = { x: sy * cp, y: sp, z: -cy * cp };
  let right = { x: cy, y: 0, z: sy };
  let up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const cr = Math.cos(plane.roll);
  const sr = Math.sin(plane.roll);
  const rr = { x: right.x * cr - up.x * sr, y: right.y * cr - up.y * sr, z: right.z * cr - up.z * sr };
  const uu = { x: right.x * sr + up.x * cr, y: right.y * sr + up.y * cr, z: right.z * sr + up.z * cr };
  right = rr;
  up = uu;
  return { forward, right, up };
}

// Local aircraft space: x right, y up, z toward the tail (nose at z=-3.4).
function localToWorld(plane, basis, lx, ly, lz) {
  return {
    x: plane.x + basis.right.x * lx + basis.up.x * ly - basis.forward.x * lz,
    y: plane.y + basis.right.y * lx + basis.up.y * ly - basis.forward.y * lz,
    z: plane.z + basis.right.z * lx + basis.up.z * ly - basis.forward.z * lz,
  };
}

function box(renderer, plane, basis, cx, cy, cz, w, h, d, rgb, shadeTop = 1.08) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  const p = (x, y, z) => localToWorld(plane, basis, x, y, z);
  renderer.poly([p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], shadeColor(rgb, shadeTop));
  renderer.poly([p(x0, y0, z0), p(x0, y0, z1), p(x1, y0, z1), p(x1, y0, z0)], shadeColor(rgb, 0.62));
  renderer.poly([p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)], shadeColor(rgb, 0.92));
  renderer.poly([p(x0, y0, z1), p(x0, y1, z1), p(x1, y1, z1), p(x1, y0, z1)], shadeColor(rgb, 0.8));
  renderer.poly([p(x0, y0, z0), p(x0, y1, z0), p(x0, y1, z1), p(x0, y0, z1)], shadeColor(rgb, 0.85));
  renderer.poly([p(x1, y0, z0), p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0)], shadeColor(rgb, 0.98));
}

export function drawAircraft(renderer, plane, time, cockpitView) {
  const basis = aircraftBasis(plane);
  const cream = [242, 236, 220];
  const teal = [23, 128, 138];
  const orange = [232, 116, 44];
  const dark = [38, 48, 58];
  const glass = [30, 58, 84];
  const p = (x, y, z) => localToWorld(plane, basis, x, y, z);

  if (!cockpitView) {
    // Fuselage: nose, cabin and a tapered tail cone.
    box(renderer, plane, basis, 0, 0.1, -2.2, 0.95, 0.95, 1.7, cream);
    box(renderer, plane, basis, 0, 0.25, -0.4, 1.15, 1.25, 2.1, cream);
    const tailTop = 0.55;
    renderer.poly([p(-0.5, 0.8, 0.6), p(0.5, 0.8, 0.6), p(0.16, tailTop, 3.1), p(-0.16, tailTop, 3.1)], shadeColor(cream, 1.05));
    renderer.poly([p(-0.5, -0.3, 0.6), p(-0.16, 0.2, 3.1), p(0.16, 0.2, 3.1), p(0.5, -0.3, 0.6)], shadeColor(cream, 0.66));
    renderer.poly([p(-0.5, -0.3, 0.6), p(-0.5, 0.8, 0.6), p(-0.16, tailTop, 3.1), p(-0.16, 0.2, 3.1)], shadeColor(cream, 0.85));
    renderer.poly([p(0.5, -0.3, 0.6), p(0.16, 0.2, 3.1), p(0.16, tailTop, 3.1), p(0.5, 0.8, 0.6)], shadeColor(cream, 0.97));
    // Canopy and livery stripe.
    box(renderer, plane, basis, 0, 0.92, -0.7, 0.92, 0.5, 1.5, glass, 1.25);
    box(renderer, plane, basis, -0.59, 0.05, -0.6, 0.04, 0.3, 3.4, orange);
    box(renderer, plane, basis, 0.59, 0.05, -0.6, 0.04, 0.3, 3.4, orange);
    // High wing with teal tips, tailplane and fin.
    box(renderer, plane, basis, 0, 1.05, -0.5, 10.6, 0.16, 1.5, cream);
    box(renderer, plane, basis, -5.05, 1.05, -0.5, 0.9, 0.18, 1.5, teal);
    box(renderer, plane, basis, 5.05, 1.05, -0.5, 0.9, 0.18, 1.5, teal);
    box(renderer, plane, basis, 0, 0.55, 3.0, 3.4, 0.12, 0.9, teal);
    box(renderer, plane, basis, 0, 1.15, 3.05, 0.12, 1.15, 0.95, teal);
    box(renderer, plane, basis, 0, 1.55, 3.2, 0.14, 0.4, 0.5, orange);
    // Fixed gear: two legs, wheels and a tail wheel.
    box(renderer, plane, basis, -0.85, -0.85, -0.9, 0.14, 0.9, 0.14, dark);
    box(renderer, plane, basis, 0.85, -0.85, -0.9, 0.14, 0.9, 0.14, dark);
    box(renderer, plane, basis, -0.85, -1.35, -0.9, 0.3, 0.55, 0.55, dark);
    box(renderer, plane, basis, 0.85, -1.35, -0.9, 0.3, 0.55, 0.55, dark);
    box(renderer, plane, basis, 0, -0.1, 3.05, 0.16, 0.3, 0.16, dark);
    // Navigation lights: red left, green right, white tail (blinking).
    const blink = Math.sin(time * 5.2) > 0 ? 1 : 0.35;
    renderer.billboard(p(-5.5, 1.05, -0.5), 0.5, 0.5, (c, sx, sy, w, h) => {
      c.fillStyle = `rgba(255,60,50,${blink})`;
      c.fillRect(sx - w / 2, sy - h / 2, w, h);
    });
    renderer.billboard(p(5.5, 1.05, -0.5), 0.5, 0.5, (c, sx, sy, w, h) => {
      c.fillStyle = `rgba(60,255,120,${blink})`;
      c.fillRect(sx - w / 2, sy - h / 2, w, h);
    });
  } else {
    // From the pilot's seat: the nose cowl and spinner stay in frame.
    box(renderer, plane, basis, 0, 0.28, -2.3, 0.95, 0.72, 1.7, cream);
    box(renderer, plane, basis, 0, 0.52, -2.9, 0.6, 0.3, 0.7, teal);
  }
  // Propeller: translucent disc plus two blades at the nose.
  const hub = p(0, 0.1, -3.15);
  const disc = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    disc.push(p(Math.cos(a) * 1.25, 0.1 + Math.sin(a) * 1.25, -3.15));
  }
  renderer.poly(disc, [200, 205, 210], 0.22);
  const ba = plane.propAngle;
  const tipA = p(Math.cos(ba) * 1.2, 0.1 + Math.sin(ba) * 1.2, -3.18);
  const tipB = p(Math.cos(ba + Math.PI) * 1.2, 0.1 + Math.sin(ba + Math.PI) * 1.2, -3.18);
  renderer.poly([hub, tipA, p(Math.cos(ba) * 0.12, 0.1 + Math.sin(ba) * 0.12, -3.18)], dark, 0.85);
  renderer.poly([hub, tipB, p(Math.cos(ba + Math.PI) * 0.12, 0.1 + Math.sin(ba + Math.PI) * 0.12, -3.18)], dark, 0.85);
}

function drawRing(renderer, ring, state, time) {
  const radius = 17;
  const right = { x: Math.cos(ring.heading), z: Math.sin(ring.heading) };
  const colors = {
    active: [255, 176, 32],
    next: [64, 196, 196],
    passed: [96, 220, 130],
  };
  const rgb = colors[state];
  const pulse = state === 'active' ? 1 + Math.sin(time * 3.4) * 0.05 : 1;
  const segments = 22;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const pt = (a, r) => ({
      x: ring.x + right.x * Math.cos(a) * r,
      y: ring.y + Math.sin(a) * r,
      z: ring.z + right.z * Math.cos(a) * r,
    });
    const alpha = state === 'passed' ? 0.35 : 0.95;
    renderer.poly([pt(a0, radius * pulse - 1.7), pt(a1, radius * pulse - 1.7), pt(a1, radius * pulse + 1.7), pt(a0, radius * pulse + 1.7)], rgb, alpha);
  }
  if (state === 'active') {
    // A pillar of light so the active ring reads from kilometres away.
    const beam = [
      { x: ring.x - 2.2, y: ring.y, z: ring.z },
      { x: ring.x + 2.2, y: ring.y, z: ring.z },
      { x: ring.x + 2.2, y: ring.y + 260, z: ring.z },
      { x: ring.x - 2.2, y: ring.y + 260, z: ring.z },
    ];
    renderer.poly(beam, [255, 196, 80], 0.13);
    renderer.billboard({ x: ring.x, y: ring.y, z: ring.z }, radius * 2.6, radius * 2.6, (c, sx, sy, w, h) => {
      const g = c.createRadialGradient(sx, sy, 2, sx, sy, w / 2);
      g.addColorStop(0, 'rgba(255,200,90,0.20)');
      g.addColorStop(1, 'rgba(255,200,90,0)');
      c.fillStyle = g;
      c.fillRect(sx - w / 2, sy - h / 2, w, h);
    });
  }
}

function runwayPoint(flat, along, across, lift = 0.25) {
  const fx = Math.sin(flat.heading);
  const fz = -Math.cos(flat.heading);
  const rx = Math.cos(flat.heading);
  const rz = Math.sin(flat.heading);
  return {
    x: flat.x + fx * along + rx * across,
    y: flat.elev + lift,
    z: flat.z + fz * along + rz * across,
  };
}

function drawRunway(renderer, flat, plane, palette, time) {
  const asphalt = [52, 56, 62];
  const white = [238, 240, 242];
  const L = flat.halfLen;
  const W = flat.halfWid;
  renderer.poly([runwayPoint(flat, -L, -W), runwayPoint(flat, L, -W), runwayPoint(flat, L, W), runwayPoint(flat, -L, W)], asphalt);
  // White edge stripes so the strip outline reads from the air.
  for (const side of [-1, 1]) {
    renderer.poly([
      runwayPoint(flat, -L, side * (W - 1.6), 0.38),
      runwayPoint(flat, L, side * (W - 1.6), 0.38),
      runwayPoint(flat, L, side * (W - 0.4), 0.38),
      runwayPoint(flat, -L, side * (W - 0.4), 0.38),
    ], white);
  }
  // Threshold piano keys at both ends.
  for (const endSign of [-1, 1]) {
    for (let i = -2; i <= 2; i++) {
      const a0 = endSign * (L - 16);
      const a1 = endSign * (L - 4);
      renderer.poly([
        runwayPoint(flat, a0, i * 6 - 1.6, 0.4),
        runwayPoint(flat, a1, i * 6 - 1.6, 0.4),
        runwayPoint(flat, a1, i * 6 + 1.6, 0.4),
        runwayPoint(flat, a0, i * 6 + 1.6, 0.4),
      ], white);
    }
  }
  // Centreline dashes.
  for (let a = -L + 26; a < L - 20; a += 26) {
    renderer.poly([
      runwayPoint(flat, a, -0.8, 0.4),
      runwayPoint(flat, a + 12, -0.8, 0.4),
      runwayPoint(flat, a + 12, 0.8, 0.4),
      runwayPoint(flat, a, 0.8, 0.4),
    ], white);
  }
  // Edge lights, brighter at dusk.
  const dusk = palette.ambient < 0.9;
  for (let a = -L; a <= L; a += 38) {
    for (const side of [-1, 1]) {
      const pos = runwayPoint(flat, a, side * (W + 2.5), 0.7);
      renderer.billboard(pos, 2.3, 2.3, (c, sx, sy, w, h) => {
        c.fillStyle = dusk ? 'rgba(255,214,120,0.95)' : 'rgba(255,230,160,0.75)';
        c.fillRect(sx - w / 2, sy - h / 2, w, h);
      });
    }
  }
  // PAPI lights by the nearer threshold: white when high, red when low.
  const ends = [runwayPoint(flat, -L, 0), runwayPoint(flat, L, 0)];
  let near = ends[0];
  let nearDist = Infinity;
  for (const end of ends) {
    const d = (plane.x - end.x) ** 2 + (plane.z - end.z) ** 2;
    if (d < nearDist) {
      nearDist = d;
      near = end;
    }
  }
  const dist = Math.sqrt(nearDist);
  const angle = Math.atan2(Math.max(0, plane.y - flat.elev), Math.max(dist, 1)) * (180 / Math.PI);
  const whites = angle > 3.6 ? 4 : angle > 3.1 ? 3 : angle > 2.7 ? 2 : angle > 2.3 ? 1 : 0;
  for (let i = 0; i < 4; i++) {
    const pos = { x: near.x + 14 + i * 3.2, y: flat.elev + 0.8, z: near.z };
    const isWhite = i < whites;
    renderer.billboard(pos, 2.5, 2.5, (c, sx, sy, w, h) => {
      c.fillStyle = isWhite ? 'rgba(255,255,245,0.95)' : 'rgba(255,70,50,0.95)';
      c.fillRect(sx - w / 2, sy - h / 2, w, h);
    });
  }
  void time;
}

function drawPad(renderer, flat, kind, time) {
  const ringRgb = kind === 'cargo' ? [255, 176, 32] : [64, 220, 190];
  const segments = 20;
  const r = 26;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const pt = (a, rr) => ({ x: flat.x + Math.cos(a) * rr, y: flat.elev + 0.35, z: flat.z + Math.sin(a) * rr });
    renderer.poly([pt(a0, r - 1.6), pt(a1, r - 1.6), pt(a1, r + 1.6), pt(a0, r + 1.6)], ringRgb, 0.9);
  }
  void time;
}

function drawTrees(renderer, camera, palette) {
  const trees = treesNear(camera.x, camera.z, 1150, 240);
  const trunk = [96, 70, 48];
  for (const tree of trees) {
    const green = [
      Math.round(lerp(46, 92, tree.hue)),
      Math.round(lerp(118, 160, tree.hue)),
      Math.round(lerp(58, 74, tree.hue)),
    ];
    const lit = shadeColor(green, palette.ambient);
    const base = { x: tree.x, y: tree.h, z: tree.z };
    renderer.poly([
      { x: tree.x - 0.4, y: tree.h, z: tree.z },
      { x: tree.x + 0.4, y: tree.h, z: tree.z },
      { x: tree.x + 0.3, y: tree.h + tree.size * 0.45, z: tree.z },
      { x: tree.x - 0.3, y: tree.h + tree.size * 0.45, z: tree.z },
    ], trunk);
    for (const [lift, rad] of [[0.35, 0.34], [0.62, 0.24]]) {
      const cy = tree.h + tree.size * lift;
      const top = { x: tree.x, y: tree.h + tree.size * (lift + 0.42), z: tree.z };
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        renderer.poly([
          { x: tree.x + Math.cos(a0) * tree.size * rad, y: cy, z: tree.z + Math.sin(a0) * tree.size * rad },
          { x: tree.x + Math.cos(a1) * tree.size * rad, y: cy, z: tree.z + Math.sin(a1) * tree.size * rad },
          top,
        ], shadeColor(lit, i % 2 ? 0.88 : 1.05));
      }
    }
    void base;
  }
  return trees;
}

function drawBuilding(renderer, b, palette) {
  const ground = terrainHeight(b.x, b.z);
  const cos = Math.cos(b.heading);
  const sin = Math.sin(b.heading);
  const pt = (lx, ly, lz) => ({
    x: b.x + lx * cos + lz * sin,
    y: ground + ly,
    z: b.z - lx * sin + lz * cos,
  });
  const wall = hexToRgb(b.wall);
  const roof = hexToRgb(b.roof);
  const w = b.w / 2;
  const d = b.d / 2;
  renderer.poly([pt(-w, 0, -d), pt(w, 0, -d), pt(w, b.h, -d), pt(-w, b.h, -d)], shadeColor(wall, 0.9));
  renderer.poly([pt(-w, 0, d), pt(-w, b.h, d), pt(w, b.h, d), pt(w, 0, d)], shadeColor(wall, 0.78));
  renderer.poly([pt(-w, 0, -d), pt(-w, b.h, -d), pt(-w, b.h, d), pt(-w, 0, d)], shadeColor(wall, 0.84));
  renderer.poly([pt(w, 0, -d), pt(w, 0, d), pt(w, b.h, d), pt(w, b.h, -d)], shadeColor(wall, 0.97));
  const ridge = b.h + b.d * 0.32;
  renderer.poly([pt(-w - 1, b.h, -d - 1), pt(w + 1, b.h, -d - 1), pt(w + 1, ridge, 0), pt(-w - 1, ridge, 0)], shadeColor(roof, 1.02));
  renderer.poly([pt(-w - 1, b.h, d + 1), pt(-w - 1, ridge, 0), pt(w + 1, ridge, 0), pt(w + 1, b.h, d + 1)], shadeColor(roof, 0.82));
  // Windows: lit amber at dusk, dark glass by day.
  const lit = palette.ambient < 0.9;
  const winRgb = lit ? [255, 196, 96] : [52, 72, 92];
  for (let i = -1; i <= 1; i++) {
    renderer.poly([pt(i * w * 0.55 - 1.1, b.h * 0.42, -d - 0.06), pt(i * w * 0.55 + 1.1, b.h * 0.42, -d - 0.06), pt(i * w * 0.55 + 1.1, b.h * 0.72, -d - 0.06), pt(i * w * 0.55 - 1.1, b.h * 0.72, -d - 0.06)], winRgb);
  }
}

function drawTowerAndProps(renderer, palette, time, wind) {
  const ground = terrainHeight(TOWER.x, TOWER.z);
  const shaft = [226, 220, 204];
  const glass = palette.ambient < 0.9 ? [255, 200, 110] : [46, 76, 100];
  const boxAt = (x, y, z, w, h, d, rgb) => {
    renderer.poly([{ x: x - w / 2, y, z: z - d / 2 }, { x: x + w / 2, y, z: z - d / 2 }, { x: x + w / 2, y: y + h, z: z - d / 2 }, { x: x - w / 2, y: y + h, z: z - d / 2 }], shadeColor(rgb, 0.9));
    renderer.poly([{ x: x - w / 2, y, z: z + d / 2 }, { x: x - w / 2, y: y + h, z: z + d / 2 }, { x: x + w / 2, y: y + h, z: z + d / 2 }, { x: x + w / 2, y, z: z + d / 2 }], shadeColor(rgb, 0.78));
    renderer.poly([{ x: x - w / 2, y: y + h, z: z - d / 2 }, { x: x + w / 2, y: y + h, z: z - d / 2 }, { x: x + w / 2, y: y + h, z: z + d / 2 }, { x: x - w / 2, y: y + h, z: z + d / 2 }], shadeColor(rgb, 1.08));
    renderer.poly([{ x: x + w / 2, y, z: z - d / 2 }, { x: x + w / 2, y, z: z + d / 2 }, { x: x + w / 2, y: y + h, z: z + d / 2 }, { x: x + w / 2, y: y + h, z: z - d / 2 }], shadeColor(rgb, 0.97));
  };
  boxAt(TOWER.x, ground, TOWER.z, 7, TOWER.h, 7, shaft);
  boxAt(TOWER.x, ground + TOWER.h, TOWER.z, 10, 4.5, 10, glass);
  boxAt(TOWER.x, ground + TOWER.h + 4.5, TOWER.z, 11, 1.2, 11, [70, 70, 76]);
  // Windsock: pole plus an orange cone that streams with the wind.
  const wx = 34;
  const wz = 300;
  const wg = terrainHeight(wx, wz);
  renderer.poly([{ x: wx - 0.2, y: wg, z: wz }, { x: wx + 0.2, y: wg, z: wz }, { x: wx + 0.2, y: wg + 7, z: wz }, { x: wx - 0.2, y: wg + 7, z: wz }], [200, 200, 205]);
  const windLen = Math.hypot(wind.x, wind.z) || 1;
  const flap = Math.sin(time * 3.1) * 0.4;
  const tipX = wx + (wind.x / windLen) * (3.6 + flap);
  const tipZ = wz + (wind.z / windLen) * (3.6 + flap);
  renderer.poly([
    { x: wx, y: wg + 7.4, z: wz },
    { x: wx, y: wg + 6.4, z: wz },
    { x: tipX, y: wg + 6.9 + flap * 0.3, z: tipZ },
  ], [240, 128, 40]);
  // Pad props: fuel drums and cargo crates.
  for (const prop of PAD_PROPS) {
    const g = terrainHeight(prop.x, prop.z);
    if (prop.kind === 'fuel') {
      boxAt(prop.x, g, prop.z, 2.2, 3, 2.2, [196, 60, 48]);
      boxAt(prop.x + 3, g, prop.z + 1, 2.2, 3, 2.2, [226, 220, 204]);
    } else {
      boxAt(prop.x, g, prop.z, 4, 3, 4, [150, 110, 66]);
      boxAt(prop.x + 1, g + 3, prop.z, 3, 2.2, 3, [168, 126, 76]);
    }
  }
}

function drawLighthouse(renderer, palette, time) {
  const ground = terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
  const bands = 5;
  const height = 30;
  const segs = 10;
  for (let b = 0; b < bands; b++) {
    const y0 = ground + (b / bands) * height;
    const y1 = ground + ((b + 1) / bands) * height;
    const r0 = lerp(4.6, 3.1, b / bands);
    const r1 = lerp(4.6, 3.1, (b + 1) / bands);
    const rgb = b % 2 ? [204, 62, 52] : [240, 238, 230];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      renderer.poly([
        { x: LIGHTHOUSE.x + Math.cos(a0) * r0, y: y0, z: LIGHTHOUSE.z + Math.sin(a0) * r0 },
        { x: LIGHTHOUSE.x + Math.cos(a1) * r0, y: y0, z: LIGHTHOUSE.z + Math.sin(a1) * r0 },
        { x: LIGHTHOUSE.x + Math.cos(a1) * r1, y: y1, z: LIGHTHOUSE.z + Math.sin(a1) * r1 },
        { x: LIGHTHOUSE.x + Math.cos(a0) * r1, y: y1, z: LIGHTHOUSE.z + Math.sin(a0) * r1 },
      ], shadeColor(rgb, i % 2 ? 0.88 : 1.0));
    }
  }
  const lampY = ground + height + 2.4;
  renderer.billboard({ x: LIGHTHOUSE.x, y: lampY, z: LIGHTHOUSE.z }, 7, 7, (c, sx, sy, w, h) => {
    const g = c.createRadialGradient(sx, sy, 1, sx, sy, w / 2);
    g.addColorStop(0, 'rgba(255,240,180,0.95)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    c.fillStyle = g;
    c.fillRect(sx - w / 2, sy - h / 2, w, h);
  });
  // Rotating beam, strongest at dusk.
  const beamAlpha = palette.ambient < 0.9 ? 0.16 : 0.05;
  const angle = time * 0.45;
  for (const dir of [0, Math.PI]) {
    const a = angle + dir;
    const ex = LIGHTHOUSE.x + Math.cos(a) * 620;
    const ez = LIGHTHOUSE.z + Math.sin(a) * 620;
    renderer.poly([
      { x: LIGHTHOUSE.x, y: lampY, z: LIGHTHOUSE.z },
      { x: ex, y: lampY - 26, z: ez },
      { x: ex, y: lampY + 26, z: ez },
    ], [255, 240, 180], beamAlpha);
  }
}

function drawAircraftShadow(renderer, plane) {
  // A soft blob shadow on the surface below: it sells height on approach
  // and makes the touchdown point readable.
  const ground = Math.max(terrainHeight(plane.x, plane.z), 0);
  const height = plane.y - ground;
  if (height > 160) return;
  const fade = clamp(1 - height / 160, 0.12, 0.5);
  const size = 9 + height * 0.05;
  renderer.billboard({ x: plane.x, y: ground + 0.5, z: plane.z }, size * 1.7, size * 0.5, (c, sx, sy, w, h) => {
    c.fillStyle = `rgba(8,18,26,${fade})`;
    c.beginPath();
    c.ellipse(sx, sy, w / 2, Math.max(h / 2, 2), 0, 0, Math.PI * 2);
    c.fill();
  });
}

function drawClouds(renderer, camera, palette, time, wind) {
  const tint = palette.ambient < 0.9 ? 'rgba(255,190,160,' : 'rgba(255,255,255,';
  for (let i = 0; i < 26; i++) {
    const r1 = hash2(i, 77, 5150);
    const r2 = hash2(i, 78, 5150);
    const r3 = hash2(i, 79, 5150);
    const span = 5200;
    const x = ((r1 * span + time * (2 + wind.x * 0.6)) % span) - span / 2 + Math.floor(camera.x / span) * span;
    const z = r2 * span - span / 2 + Math.floor(camera.z / span) * span;
    const y = 290 + r3 * 320;
    const w = 260 + r1 * 340;
    renderer.billboard({ x, y, z }, w, w * 0.32, (c, sx, sy, bw, bh) => {
      c.fillStyle = `${tint}0.5)`;
      c.beginPath();
      c.ellipse(sx, sy, bw / 2, bh / 2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = `${tint}0.65)`;
      c.beginPath();
      c.ellipse(sx - bw * 0.18, sy - bh * 0.16, bw * 0.3, bh * 0.36, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(sx + bw * 0.2, sy - bh * 0.1, bw * 0.26, bh * 0.3, 0, 0, Math.PI * 2);
      c.fill();
    });
  }
}

function drawParticles(renderer) {
  for (const p of particles) {
    const fade = 1 - p.age / p.life;
    renderer.billboard({ x: p.x, y: p.y, z: p.z }, p.size * 2, p.size * 2, (c, sx, sy, w, h) => {
      c.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${0.85 * fade})`;
      c.fillRect(sx - w / 2, sy - h / 2, w, h);
    });
  }
}

// Draw the whole 3D scene. Returns the trees drawn (for strike checks).
export function drawScene(renderer, state) {
  const { plane, camera, palette, time, rings, activeRing, wind, cockpitView, dt } = state;
  stepParticles(dt);
  drawWater(renderer, camera, palette, time);
  terrainMesh(renderer, camera, palette, time, 170, 3300, 1180, -2.2);
  terrainMesh(renderer, camera, palette, time, 38, 1120, 0);
  for (const flat of FLATS) {
    if (flat.id === 'harbor-pad') drawPad(renderer, flat, 'cargo', time);
    else drawRunway(renderer, flat, plane, palette, time);
  }
  drawPad(renderer, { x: 0, z: 252, elev: FLATS[0].elev }, 'fuel', time);
  for (const b of BUILDINGS) drawBuilding(renderer, b, palette);
  drawTowerAndProps(renderer, palette, time, wind);
  drawLighthouse(renderer, palette, time);
  const trees = drawTrees(renderer, camera, palette);
  rings.forEach((ring, i) => {
    const ringState = ring.passed ? 'passed' : i === activeRing ? 'active' : 'next';
    drawRing(renderer, ring, ringState, time);
  });
  drawAircraft(renderer, plane, time, cockpitView);
  drawAircraftShadow(renderer, plane);
  drawClouds(renderer, camera, palette, time, wind);
  drawParticles(renderer);
  return trees;
}
