// A small software 3D renderer on Canvas 2D: world polygons are transformed
// into camera space, clipped against the near plane, sorted far-to-near and
// filled flat with distance fog. Billboards (clouds, glows, particles) ride
// the same queue so everything occludes in the right order.

import { VIEW_W, VIEW_H, FOV_DEG, NEAR_PLANE, FOG_START, FOG_END } from './config.js';
import { clamp, lerp } from './rng.js';

const FOCAL = (VIEW_H / 2) / Math.tan(((FOV_DEG / 2) * Math.PI) / 180);

export function createRenderer(ctx) {
  const queue = [];
  let basis = null;
  let camPos = { x: 0, y: 0, z: 0 };
  let fogColor = [207, 232, 242];

  function setCamera(camera, palette) {
    camPos = { x: camera.x, y: camera.y, z: camera.z };
    fogColor = hexToRgb(palette.fog);
    // Forward from yaw/pitch, then roll the right/up pair around it.
    const cy = Math.cos(camera.yaw);
    const sy = Math.sin(camera.yaw);
    const cp = Math.cos(camera.pitch);
    const sp = Math.sin(camera.pitch);
    const forward = { x: sy * cp, y: sp, z: -cy * cp };
    let right = { x: cy, y: 0, z: sy };
    // Up is right × forward; roll then rotates right/up about the forward
    // axis so a positive roll banks the view to the right.
    let up = {
      x: right.y * forward.z - right.z * forward.y,
      y: right.z * forward.x - right.x * forward.z,
      z: right.x * forward.y - right.y * forward.x,
    };
    const cr = Math.cos(camera.roll);
    const sr = Math.sin(camera.roll);
    const rolledRight = {
      x: right.x * cr - up.x * sr,
      y: right.y * cr - up.y * sr,
      z: right.z * cr - up.z * sr,
    };
    const rolledUp = {
      x: right.x * sr + up.x * cr,
      y: right.y * sr + up.y * cr,
      z: right.z * sr + up.z * cr,
    };
    right = rolledRight;
    up = rolledUp;
    basis = { right, up, forward };
    queue.length = 0;
  }

  function toCamera(p) {
    const dx = p.x - camPos.x;
    const dy = p.y - camPos.y;
    const dz = p.z - camPos.z;
    return {
      x: dx * basis.right.x + dy * basis.right.y + dz * basis.right.z,
      y: dx * basis.up.x + dy * basis.up.y + dz * basis.up.z,
      z: dx * basis.forward.x + dy * basis.forward.y + dz * basis.forward.z,
    };
  }

  function project(c) {
    return {
      x: VIEW_W / 2 + (c.x / c.z) * FOCAL,
      y: VIEW_H / 2 - (c.y / c.z) * FOCAL,
      z: c.z,
    };
  }

  // Project a world point for HUD markers. Returns null behind the camera.
  function projectWorld(p) {
    const c = toCamera(p);
    if (c.z < NEAR_PLANE) return null;
    const s = project(c);
    return { x: s.x, y: s.y, depth: c.z, onScreen: s.x >= 0 && s.x <= VIEW_W && s.y >= 0 && s.y <= VIEW_H };
  }

  function clipNear(points) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const cur = points[i];
      const prev = points[(i + points.length - 1) % points.length];
      const curIn = cur.z >= NEAR_PLANE;
      const prevIn = prev.z >= NEAR_PLANE;
      if (curIn !== prevIn) {
        const t = (NEAR_PLANE - prev.z) / (cur.z - prev.z);
        out.push({
          x: prev.x + (cur.x - prev.x) * t,
          y: prev.y + (cur.y - prev.y) * t,
          z: NEAR_PLANE,
        });
      }
      if (curIn) out.push(cur);
    }
    return out;
  }

  function fogged(rgb, depth) {
    const t = clamp((depth - FOG_START) / (FOG_END - FOG_START), 0, 1);
    if (t <= 0) return rgb;
    return [
      Math.round(lerp(rgb[0], fogColor[0], t)),
      Math.round(lerp(rgb[1], fogColor[1], t)),
      Math.round(lerp(rgb[2], fogColor[2], t)),
    ];
  }

  // Queue a filled polygon. rgb is [r,g,b]; alpha defaults to opaque.
  function poly(points, rgb, alpha = 1) {
    const camPoints = points.map(toCamera);
    const clipped = clipNear(camPoints);
    if (clipped.length < 3) return;
    let depth = 0;
    for (const p of clipped) depth += p.z;
    depth /= clipped.length;
    if (depth > FOG_END + 800) return;
    queue.push({ kind: 'poly', points: clipped.map(project), rgb: fogged(rgb, depth), alpha, depth });
  }

  // Queue a camera-facing billboard (clouds, glows, particles).
  function billboard(center, width, height, draw, alpha = 1) {
    const c = toCamera(center);
    if (c.z < NEAR_PLANE || c.z > FOG_END + 800) return;
    const s = project(c);
    const w = (width / c.z) * FOCAL;
    const h = (height / c.z) * FOCAL;
    queue.push({ kind: 'billboard', x: s.x, y: s.y, w, h, draw, alpha, depth: c.z });
  }

  function flush() {
    queue.sort((a, b) => b.depth - a.depth);
    for (const item of queue) {
      if (item.kind === 'poly') {
        ctx.globalAlpha = item.alpha;
        ctx.fillStyle = `rgb(${item.rgb[0]},${item.rgb[1]},${item.rgb[2]})`;
        ctx.beginPath();
        ctx.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++) ctx.lineTo(item.points[i].x, item.points[i].y);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.globalAlpha = item.alpha;
        item.draw(ctx, item.x, item.y, item.w, item.h);
      }
    }
    ctx.globalAlpha = 1;
    queue.length = 0;
  }

  return { setCamera, poly, billboard, flush, projectWorld };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shadeColor(rgb, factor) {
  return [
    clamp(Math.round(rgb[0] * factor), 0, 255),
    clamp(Math.round(rgb[1] * factor), 0, 255),
    clamp(Math.round(rgb[2] * factor), 0, 255),
  ];
}
