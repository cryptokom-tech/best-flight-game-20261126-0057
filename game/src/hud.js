// The instrument panel and HUD: an attitude indicator, speed and altitude
// tapes, a heading compass ribbon, throttle/fuel/damage gauges, the mission
// banner, an objective marker with distance, and the warning lights. In
// cockpit view the same instruments sit on a lit dashboard under a canopy
// frame. Big digital ALT / SPD / HDG readouts keep the three numbers the
// brief asks for readable at a glance.

import { VIEW_W, VIEW_H, FUEL_CAPACITY } from './config.js';
import { speedKnots, altitudeFeet, headingDegrees } from './flight.js';
import { clamp } from './rng.js';

const INK = '#eaf6ff';
const DIM = 'rgba(190,220,240,0.75)';
const AMBER = '#ffb020';
const TEAL = '#3fd4c8';
const RED = '#ff5348';
const GREEN = '#5ee08a';

function panel(ctx, x, y, w, h, radius = 10) {
  ctx.fillStyle = 'rgba(10,22,34,0.62)';
  ctx.strokeStyle = 'rgba(120,190,220,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.stroke();
}

function text(ctx, str, x, y, size = 15, color = INK, align = 'left', weight = '600') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function drawAttitude(ctx, cx, cy, r, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  const pitchPx = plane.pitch * r * 1.6;
  ctx.fillStyle = '#3d8fd1';
  ctx.fillRect(-r * 1.6, -r * 1.6 + pitchPx, r * 3.2, r * 1.6);
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(-r * 1.6, pitchPx, r * 3.2, r * 1.6);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-r * 1.6, pitchPx - 1, r * 3.2, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const deg of [-20, -10, 10, 20]) {
    const y = pitchPx - (deg * Math.PI / 180) * r * 1.6;
    ctx.fillRect(-r * 0.32, y - 1, r * 0.64, 2);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(160,210,240,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol and roll pointer.
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy);
  ctx.lineTo(cx - r * 0.18, cy);
  ctx.lineTo(cx, cy + r * 0.1);
  ctx.lineTo(cx + r * 0.18, cy);
  ctx.lineTo(cx + r * 0.55, cy);
  ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 2);
  ctx.lineTo(cx - 6, cy - r + 12);
  ctx.lineTo(cx + 6, cy - r + 12);
  ctx.closePath();
  ctx.fill();
}

function drawTape(ctx, x, y, w, h, value, step, label, format, accent) {
  panel(ctx, x, y, w, h, 8);
  const cy = y + h / 2;
  const pxPerUnit = h / (step * 6);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const first = Math.floor((value - step * 3.2) / step) * step;
  for (let v = first; v <= value + step * 3.2; v += step) {
    const ty = cy - (v - value) * pxPerUnit;
    ctx.fillStyle = DIM;
    ctx.fillRect(x + w - 12, ty - 1, 8, 2);
    if (v >= 0) text(ctx, format(v), x + w - 16, ty, 12, DIM, 'right', '500');
  }
  ctx.restore();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(x + w, cy - 8);
  ctx.lineTo(x + w + 9, cy);
  ctx.lineTo(x + w, cy + 8);
  ctx.closePath();
  ctx.fill();
  panel(ctx, x - 4, cy - 15, w + 8, 30, 6);
  text(ctx, format(Math.round(value)), x + w / 2, cy, 19, INK, 'center', '700');
  text(ctx, label, x + w / 2, y - 12, 12, accent, 'center', '700');
}

function drawCompass(ctx, plane, targetHeading) {
  const w = 420;
  const x = VIEW_W / 2 - w / 2;
  const y = 16;
  panel(ctx, x, y, w, 44, 8);
  const hdg = headingDegrees(plane);
  const pxPerDeg = w / 90;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, 44);
  ctx.clip();
  for (let d = -60; d <= 60; d += 5) {
    const deg = ((Math.round(hdg / 5) * 5 + d) % 360 + 360) % 360;
    const tx = VIEW_W / 2 + d * pxPerDeg - ((hdg % 5) * pxPerDeg);
    const cardinal = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[deg];
    if (cardinal || deg % 30 === 0) {
      text(ctx, cardinal || String(deg / 10), tx, y + 15, cardinal ? 15 : 12, cardinal ? INK : DIM, 'center', cardinal ? '700' : '500');
      ctx.fillStyle = DIM;
      ctx.fillRect(tx - 1, y + 26, 2, 8);
    } else if (deg % 15 === 0) {
      ctx.fillStyle = DIM;
      ctx.fillRect(tx - 1, y + 27, 2, 7);
    } else {
      ctx.fillStyle = DIM;
      ctx.fillRect(tx - 1, y + 30, 2, 5);
    }
  }
  if (targetHeading !== null && targetHeading !== undefined) {
    let rel = ((targetHeading - hdg + 540) % 360) - 180;
    rel = clamp(rel, -48, 48);
    const tx = VIEW_W / 2 + rel * pxPerDeg;
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(tx, y + 34);
    ctx.lineTo(tx - 6, y + 44);
    ctx.lineTo(tx + 6, y + 44);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(VIEW_W / 2, y + 40);
  ctx.lineTo(VIEW_W / 2 - 7, y + 50);
  ctx.lineTo(VIEW_W / 2 + 7, y + 50);
  ctx.closePath();
  ctx.fill();
}

function drawGaugeBar(ctx, x, y, w, frac, color, label, valueText) {
  text(ctx, label, x, y, 12, DIM, 'left', '700');
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.roundRect(x + 58, y - 6, w, 12, 6);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 58, y - 6, Math.max(4, w * clamp(frac, 0, 1)), 12, 6);
  ctx.fill();
  text(ctx, valueText, x + 66 + w, y, 13, INK, 'left', '700');
}

function drawWarnings(ctx, plane, state, time) {
  const warnings = [];
  if (plane.stalled && plane.airborne) warnings.push('STALL');
  if (plane.fuel <= 0 && plane.airborne) warnings.push('ENGINE OUT — GLIDE');
  else if (plane.fuel < 18) warnings.push('LOW FUEL');
  if (state.terrainWarning) warnings.push('PULL UP');
  if (plane.damage > 65) warnings.push('AIRFRAME CRITICAL');
  if (!warnings.length) return;
  if (Math.sin(time * 7) < -0.25) return;
  const label = warnings[0];
  const w = 250;
  panel(ctx, VIEW_W / 2 - w / 2, 92, w, 36, 8);
  text(ctx, label, VIEW_W / 2, 110, 19, RED, 'center', '800');
}

function drawObjectiveMarker(ctx, renderer, state) {
  const target = state.objectivePoint;
  if (!target) return;
  const s = renderer.projectWorld(target);
  const dist = Math.round(Math.hypot(state.plane.x - target.x, state.plane.y - target.y, state.plane.z - target.z));
  if (s && s.onScreen) {
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 14);
    ctx.lineTo(s.x + 14, s.y);
    ctx.lineTo(s.x, s.y + 14);
    ctx.lineTo(s.x - 14, s.y);
    ctx.closePath();
    ctx.stroke();
    text(ctx, `${dist} m`, s.x, s.y + 28, 14, AMBER, 'center', '700');
  } else {
    // Edge arrow toward the objective.
    const rel = state.objectiveBearing;
    const cx = VIEW_W / 2 + Math.sin(rel) * 300;
    const cy = VIEW_H / 2 - Math.cos(rel) * 190;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rel);
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(10, 8);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text(ctx, `${dist} m`, cx, cy + 26, 14, AMBER, 'center', '700');
  }
}

function drawCockpitFrame(ctx) {
  // Dashboard and canopy frame for the cockpit view.
  ctx.fillStyle = 'rgba(16,24,32,0.92)';
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H);
  ctx.lineTo(0, VIEW_H - 128);
  ctx.quadraticCurveTo(VIEW_W / 2, VIEW_H - 168, VIEW_W, VIEW_H - 128);
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,190,220,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H - 128);
  ctx.quadraticCurveTo(VIEW_W / 2, VIEW_H - 168, VIEW_W, VIEW_H - 128);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(16,24,32,0.85)';
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.quadraticCurveTo(40, VIEW_H / 2, 6, VIEW_H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(VIEW_W - 6, 0);
  ctx.quadraticCurveTo(VIEW_W - 40, VIEW_H / 2, VIEW_W - 6, VIEW_H);
  ctx.stroke();
  ctx.fillStyle = 'rgba(16,24,32,0.9)';
  ctx.fillRect(0, 0, VIEW_W, 26);
}

export function drawHud(ctx, renderer, state) {
  const { plane, mission, score, timeLeft, serviceStatus, cockpitView, time } = state;
  if (cockpitView) drawCockpitFrame(ctx);

  drawCompass(ctx, plane, state.objectiveHeadingDeg);
  drawTape(ctx, 26, 190, 86, 300, speedKnots(plane), 10, 'SPD KT', (v) => String(Math.max(0, v)), TEAL);
  drawTape(ctx, VIEW_W - 112, 190, 86, 300, altitudeFeet(plane), 100, 'ALT FT', (v) => String(Math.max(0, v)), TEAL);

  const dashY = cockpitView ? VIEW_H - 118 : VIEW_H - 150;
  drawAttitude(ctx, 190, dashY + 62, 56, plane);

  panel(ctx, 268, dashY, 300, 124, 10);
  drawGaugeBar(ctx, 282, dashY + 24, 130, plane.throttle, TEAL, 'THR', `${Math.round(plane.throttle * 100)}%`);
  drawGaugeBar(ctx, 282, dashY + 52, 130, plane.fuel / FUEL_CAPACITY, plane.fuel < 18 ? RED : GREEN, 'FUEL', `${Math.round(plane.fuel)}`);
  drawGaugeBar(ctx, 282, dashY + 80, 130, plane.damage / 100, plane.damage > 65 ? RED : AMBER, 'DMG', `${Math.round(plane.damage)}%`);
  text(ctx, plane.flaps ? 'FLAPS DOWN' : 'FLAPS UP', 282, dashY + 106, 12, plane.flaps ? AMBER : DIM, 'left', '700');
  text(ctx, plane.cargoLoaded ? 'CARGO ABOARD' : '', 420, dashY + 106, 12, AMBER, 'left', '700');

  // Vertical speed readout beside the altitude tape.
  panel(ctx, VIEW_W - 112, 506, 86, 44, 8);
  const vsFpm = Math.round(plane.verticalSpeed * 196.85);
  text(ctx, 'V/S', VIEW_W - 69, 518, 11, DIM, 'center', '700');
  text(ctx, `${vsFpm > 0 ? '+' : ''}${vsFpm}`, VIEW_W - 69, 536, 16, vsFpm < -600 ? RED : INK, 'center', '700');

  // Mission banner, score and clock.
  panel(ctx, 22, 16, 330, 92, 10);
  text(ctx, mission.name, 36, 36, 16, INK, 'left', '700');
  text(ctx, state.objectiveText, 36, 60, 13.5, AMBER, 'left', '600');
  text(ctx, `SCORE ${score}`, 36, 84, 14, TEAL, 'left', '700');
  if (timeLeft !== null) {
    const mins = Math.floor(timeLeft / 60);
    const secs = Math.floor(timeLeft % 60);
    text(ctx, `TIME ${mins}:${String(secs).padStart(2, '0')}`, 210, 84, 14, timeLeft < 30 ? RED : INK, 'left', '700');
  }
  if (serviceStatus) text(ctx, serviceStatus, VIEW_W / 2, VIEW_H - 178, 16, GREEN, 'center', '700');
  if (state.message && state.messageUntil > time) {
    text(ctx, state.message, VIEW_W / 2, 150, 22, AMBER, 'center', '800');
  }

  drawObjectiveMarker(ctx, renderer, state);
  drawWarnings(ctx, plane, state, time);

  // Crosshair dot in cockpit view.
  if (cockpitView) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(VIEW_W / 2, VIEW_H / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
