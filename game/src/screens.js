// Full-screen overlays drawn over the live 3D scene: the title screen with
// the sortie list and controls, the per-sortie briefing with an archipelago
// map, the score breakdown after a completed sortie, the failure screen
// with its reason, and the pause card.

import { VIEW_W, VIEW_H, MISSIONS } from './config.js';
import { ISLANDS, FLATS } from './terrain.js';

const INK = '#eaf6ff';
const DIM = 'rgba(190,220,240,0.8)';
const AMBER = '#ffb020';
const TEAL = '#3fd4c8';
const RED = '#ff5348';

function shade(ctx, alpha = 0.45) {
  ctx.fillStyle = `rgba(6,14,24,${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function card(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(9,20,32,0.88)';
  ctx.strokeStyle = 'rgba(120,190,220,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
}

function text(ctx, str, x, y, size = 16, color = INK, align = 'left', weight = '600') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function wrapText(ctx, str, x, y, maxWidth, lineHeight, size, color) {
  const words = str.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      text(ctx, line, x, yy, size, color, 'left', '500');
      line = word;
      yy += lineHeight;
    } else {
      line = trial;
    }
  }
  if (line) text(ctx, line, x, yy, size, color, 'left', '500');
  return yy;
}

export function drawTitle(ctx, state) {
  shade(ctx, 0.32);
  text(ctx, 'ARUS LANGIT', VIEW_W / 2, 118, 74, INK, 'center', '800');
  text(ctx, 'A R C H I P E L A G O   C O U R I E R', VIEW_W / 2, 168, 19, AMBER, 'center', '700');
  text(ctx, 'Fly the mail between the islands. Mind the fuel, respect the wind, land her gently.', VIEW_W / 2, 202, 16, DIM, 'center', '500');

  card(ctx, 190, 244, 900, 362);
  text(ctx, 'THE SORTIES', 230, 282, 17, TEAL, 'left', '800');
  MISSIONS.forEach((mission, i) => {
    const y = 322 + i * 62;
    const done = state.completedMissions[i];
    text(ctx, done ? '✓' : '•', 238, y, 20, done ? '#5ee08a' : DIM, 'center', '800');
    text(ctx, mission.name, 268, y - 8, 18, INK, 'left', '700');
    text(ctx, mission.brief, 268, y + 16, 13.5, DIM, 'left', '500');
  });
  text(ctx, 'CONTROLS', 230, 512, 17, TEAL, 'left', '800');
  const controls = [
    'Mouse / WASD / Arrows — stick (bank & pitch)',
    'Shift / Ctrl — throttle      Space — brake',
    'F — flaps      C — camera      P — pause      M — sound',
  ];
  controls.forEach((line, i) => text(ctx, line, 230, 542 + i * 24, 14.5, DIM, 'left', '500'));

  const next = state.completedMissions.every(Boolean) ? 'ENTER — Free flight' : `ENTER — Start ${MISSIONS[state.nextMission].name}`;
  text(ctx, next, VIEW_W / 2, 628, 22, AMBER, 'center', '800');
  text(ctx, 'or click anywhere', VIEW_W / 2, 658, 14, DIM, 'center', '500');
}

function drawMap(ctx, cx, cy, size) {
  const scale = size / 6800;
  const px = (x) => cx + x * scale;
  const pz = (z) => cy + z * scale;
  ctx.fillStyle = 'rgba(24,74,104,0.9)';
  ctx.beginPath();
  ctx.roundRect(cx - size / 2, cy - size / 2, size, size, 10);
  ctx.fill();
  for (const island of ISLANDS) {
    ctx.fillStyle = '#5da85c';
    ctx.beginPath();
    ctx.arc(px(island.x), pz(island.z), island.radius * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8d9a8';
    ctx.beginPath();
    ctx.arc(px(island.x), pz(island.z), island.radius * scale * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5da85c';
    ctx.beginPath();
    ctx.arc(px(island.x), pz(island.z), island.radius * scale * 0.66, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const flat of FLATS) {
    ctx.fillStyle = '#2c3138';
    ctx.save();
    ctx.translate(px(flat.x), pz(flat.z));
    ctx.rotate(-flat.heading);
    ctx.fillRect(-flat.halfWid * scale * 1.6, -flat.halfLen * scale, flat.halfWid * scale * 3.2, flat.halfLen * scale * 2);
    ctx.restore();
  }
  text(ctx, 'Pulau Induk', px(0), pz(0) - 46, 12, INK, 'center', '700');
  text(ctx, 'Harbor', px(-1650), pz(-950) - 30, 12, INK, 'center', '700');
  text(ctx, 'Lighthouse', px(1550), pz(-1450) - 30, 12, INK, 'center', '700');
  text(ctx, 'N', cx + size / 2 - 18, cy - size / 2 + 16, 15, AMBER, 'center', '800');
}

export function drawBriefing(ctx, state) {
  shade(ctx, 0.4);
  const mission = MISSIONS[state.nextMission];
  card(ctx, 240, 120, 800, 470);
  text(ctx, mission.name, 290, 170, 30, INK, 'left', '800');
  ctx.font = '500 16px "Segoe UI", system-ui, sans-serif';
  wrapText(ctx, mission.brief, 290, 212, 440, 24, 16, DIM);
  const windSpeed = Math.hypot(mission.wind.x, mission.wind.z).toFixed(1);
  const rows = [
    ['Wind', `${windSpeed} m/s, gusts ${mission.wind.gust.toFixed(1)} m/s`],
    ['Clock', mission.timeLimit ? `${Math.floor(mission.timeLimit / 60)}:${String(mission.timeLimit % 60).padStart(2, '0')} limit` : `No limit — par ${Math.floor(mission.parTime / 60)}:${String(mission.parTime % 60).padStart(2, '0')}`],
    ['Fuel', 'Full tank. Pads refuel and repair when parked.'],
    ['Scoring', 'Rings 100 · smooth landing 150 · cargo 200'],
  ];
  rows.forEach((row, i) => {
    text(ctx, row[0], 290, 300 + i * 34, 15, TEAL, 'left', '800');
    text(ctx, row[1], 380, 300 + i * 34, 15, INK, 'left', '500');
  });
  drawMap(ctx, 860, 330, 300);
  text(ctx, 'ENTER — Begin sortie', VIEW_W / 2, 548, 21, AMBER, 'center', '800');
}

export function drawComplete(ctx, state) {
  shade(ctx, 0.42);
  const run = state.run;
  card(ctx, 390, 130, 500, 430);
  text(ctx, 'SORTIE COMPLETE', VIEW_W / 2, 185, 32, '#5ee08a', 'center', '800');
  text(ctx, run.definition.name, VIEW_W / 2, 222, 16, DIM, 'center', '600');
  let y = 272;
  for (const row of run.breakdown) {
    text(ctx, row.label, 450, y, 16, INK, 'left', '500');
    text(ctx, `+${row.points}`, 830, y, 16, TEAL, 'right', '700');
    y += 30;
  }
  ctx.strokeStyle = 'rgba(120,190,220,0.4)';
  ctx.beginPath();
  ctx.moveTo(450, y + 2);
  ctx.lineTo(830, y + 2);
  ctx.stroke();
  text(ctx, 'SORTIE SCORE', 450, y + 30, 17, INK, 'left', '800');
  text(ctx, String(run.score), 830, y + 30, 20, AMBER, 'right', '800');
  text(ctx, `CAMPAIGN TOTAL ${state.campaignScore}`, VIEW_W / 2, y + 66, 15, DIM, 'center', '700');
  const label = state.nextMission < MISSIONS.length ? 'ENTER — Next sortie' : 'ENTER — Free flight';
  text(ctx, label, VIEW_W / 2, 520, 20, AMBER, 'center', '800');
}

export function drawFailed(ctx, state) {
  shade(ctx, 0.5);
  card(ctx, 370, 200, 540, 300);
  text(ctx, 'SORTIE FAILED', VIEW_W / 2, 258, 34, RED, 'center', '800');
  text(ctx, state.run.failed || 'The sortie ended early.', VIEW_W / 2, 306, 17, INK, 'center', '600');
  text(ctx, `Score kept: ${state.run.score}`, VIEW_W / 2, 344, 15, DIM, 'center', '600');
  text(ctx, 'ENTER — Fly it again', VIEW_W / 2, 408, 20, AMBER, 'center', '800');
  text(ctx, 'T — Back to title', VIEW_W / 2, 442, 15, DIM, 'center', '600');
}

export function drawPaused(ctx) {
  shade(ctx, 0.45);
  card(ctx, 490, 260, 300, 190);
  text(ctx, 'PAUSED', VIEW_W / 2, 318, 32, INK, 'center', '800');
  text(ctx, 'P — Resume', VIEW_W / 2, 366, 17, DIM, 'center', '600');
  text(ctx, 'R — Restart sortie', VIEW_W / 2, 396, 17, DIM, 'center', '600');
}

export function drawCampaignDone(ctx, state) {
  shade(ctx, 0.42);
  card(ctx, 370, 180, 540, 330);
  text(ctx, 'ALL SORTIES FLOWN', VIEW_W / 2, 242, 34, '#5ee08a', 'center', '800');
  text(ctx, 'The archipelago mail is delivered. The sky is yours.', VIEW_W / 2, 288, 16, DIM, 'center', '500');
  text(ctx, `CAMPAIGN TOTAL ${state.campaignScore}`, VIEW_W / 2, 344, 24, AMBER, 'center', '800');
  text(ctx, 'ENTER — Free flight (rings keep coming)', VIEW_W / 2, 412, 18, AMBER, 'center', '800');
  text(ctx, 'T — Back to title', VIEW_W / 2, 448, 15, DIM, 'center', '600');
}
