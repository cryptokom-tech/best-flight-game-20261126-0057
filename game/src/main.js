// Arus Langit — Archipelago Courier. Boot, the main loop, screen flow and
// wiring: input drives the flight model, missions read its events, the
// renderer draws the scene and HUD, and WebAudio follows the engine. The
// title screen orbits the parked aircraft at dusk; ?shot= stages the
// dossier screenshots through shots.js.

import { MISSIONS, PALETTES } from './config.js';
import { createAircraft, placeOnRunway, stepFlight, stepServices, checkPropStrike } from './flight.js';
import { createInput } from './input.js';
import { createCamera, updateCamera, toggleCamera } from './camera.js';
import { createRenderer } from './renderer.js';
import { drawSky, drawScene, spawnBurst, spawnPuff } from './scene.js';
import { drawHud } from './hud.js';
import { createMissionRun, updateMission, objectiveText, objectivePoint, objectiveHeadingDeg, bearingToObjective, activeRingIndex, timeLeft } from './missions.js';
import { drawTitle, drawBriefing, drawComplete, drawFailed, drawPaused, drawCampaignDone } from './screens.js';
import { stageShot, titleScene } from './shots.js';
import { createAudio } from './audio.js';
import { HOME_RUNWAY } from './world.js';
import { terrainHeight } from './terrain.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const renderer = createRenderer(ctx);
const input = createInput(canvas);
const audio = createAudio();

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

const state = {
  screen: 'title',
  plane: createAircraft(),
  camera: createCamera(),
  run: null,
  missionIndex: 0,
  nextMission: 0,
  completedMissions: [false, false, false],
  campaignScore: 0,
  time: 0,
  trees: [],
  serviceStatus: null,
  endTimer: 0,
  smokeTimer: 0,
  beepTimer: 0,
  frozen: false,
};

function palette() {
  if (state.screen === 'title') return PALETTES.dusk;
  const def = state.run ? state.run.definition : MISSIONS[state.nextMission];
  return PALETTES[def.palette];
}

function wind() {
  const def = state.run ? state.run.definition : MISSIONS[0];
  return def.wind;
}

function startMission(index, freeFlight = false) {
  state.missionIndex = index;
  state.plane = createAircraft();
  placeOnRunway(state.plane, HOME_RUNWAY, HOME_RUNWAY.heading);
  state.run = createMissionRun(MISSIONS[index], freeFlight);
  state.camera = createCamera();
  state.screen = 'flying';
  state.endTimer = 0;
  updateCamera(state.camera, state.plane, 1, state.time);
}

function completeMission() {
  state.completedMissions[state.missionIndex] = true;
  state.campaignScore += state.run.score;
  state.nextMission = state.completedMissions.findIndex((done) => !done);
  if (state.nextMission === -1) state.nextMission = MISSIONS.length;
}

function handlePresses() {
  const presses = input.takePresses();
  for (const code of presses) {
    if (code === 'KeyM') audio.toggleMute();
    if (state.screen === 'title') {
      if (code === 'Enter' || code === 'MouseDown') {
        audio.ensureStarted();
        audio.click();
        if (state.nextMission >= MISSIONS.length) startMission(0, true);
        else state.screen = 'briefing';
      }
    } else if (state.screen === 'briefing') {
      if (code === 'Enter' || code === 'MouseDown') {
        audio.ensureStarted();
        startMission(state.nextMission);
      }
    } else if (state.screen === 'flying') {
      if (code === 'KeyC') toggleCamera(state.camera);
      if (code === 'KeyF') state.plane.flaps = !state.plane.flaps;
      if (code === 'KeyP' || code === 'Escape') state.screen = 'paused';
      if (code === 'KeyR') startMission(state.missionIndex, state.run.freeFlight);
    } else if (state.screen === 'paused') {
      if (code === 'KeyP' || code === 'Escape' || code === 'Enter') state.screen = 'flying';
      if (code === 'KeyR') startMission(state.missionIndex, state.run.freeFlight);
    } else if (state.screen === 'complete') {
      if (code === 'Enter' || code === 'MouseDown') {
        if (state.nextMission >= MISSIONS.length) state.screen = 'campaign';
        else state.screen = 'briefing';
      }
    } else if (state.screen === 'failed') {
      if (code === 'Enter') startMission(state.missionIndex, state.run.freeFlight);
      if (code === 'KeyT') goTitle();
    } else if (state.screen === 'campaign') {
      if (code === 'Enter') startMission(0, true);
      if (code === 'KeyT') goTitle();
    }
  }
}

function goTitle() {
  state.screen = 'title';
  state.run = null;
  titleScene(state.plane);
}

function stepFlying(dt) {
  const plane = state.plane;
  const stick = input.readStick();
  const events = stepFlight(plane, stick, wind(), state.time, dt);
  state.serviceStatus = stepServices(plane, dt);
  if (checkPropStrike(plane, state.trees)) {
    audio.scrape();
    spawnBurst(plane.x, plane.y, plane.z, [120, 180, 90], 10, 6);
  }
  const flags = updateMission(state.run, plane, events, state.time, dt);
  if (flags.ringPassed) {
    audio.ringChime();
    const ring = state.run.rings[activeRingIndex(state.run) - 1] || state.run.rings.find((r) => r.passed);
    if (ring) spawnBurst(ring.x, ring.y, ring.z, [255, 196, 80], 22, 9);
  }
  if (flags.landed) {
    audio.landingThud(flags.landed.quality === 'hard');
    spawnBurst(plane.x, plane.y - 1, plane.z, [210, 200, 170], 12, 5);
  }
  if (events.crashed) {
    audio.crash();
    const water = terrainHeight(plane.x, plane.z) <= 0.4;
    spawnBurst(plane.x, plane.y, plane.z, water ? [170, 220, 245] : [240, 140, 70], 30, 11);
  }
  if (plane.damage > 45 && plane.airborne) {
    state.smokeTimer -= dt;
    if (state.smokeTimer <= 0) {
      state.smokeTimer = 0.09;
      spawnPuff(plane.x, plane.y + 0.5, plane.z, [70, 70, 76], 1.1);
    }
  }
  if (flags.justCompleted) {
    completeMission();
    audio.success();
    state.endTimer = 1.1;
  }
  if (flags.justFailed) state.endTimer = 1.3;
  if (state.endTimer > 0) {
    state.endTimer -= dt;
    if (state.endTimer <= 0) {
      state.screen = state.run.completed ? 'complete' : 'failed';
    }
  }
  // Stall warning beep, at most twice a second.
  state.beepTimer -= dt;
  if (plane.stalled && plane.airborne && state.beepTimer <= 0) {
    state.beepTimer = 0.5;
    audio.warningBeep();
  }
  audio.update(plane);
  updateCamera(state.camera, plane, dt, state.time);
}

function terrainWarning() {
  const plane = state.plane;
  if (!plane.airborne) return false;
  const radioAlt = plane.y - terrainHeight(plane.x, plane.z);
  return radioAlt < 26 && plane.verticalSpeed < -3;
}

function hudState() {
  const run = state.run;
  return {
    plane: state.plane,
    mission: run.definition,
    score: run.score,
    timeLeft: timeLeft(run),
    objectiveText: objectiveText(run),
    objectivePoint: objectivePoint(run, state.plane),
    objectiveHeadingDeg: objectiveHeadingDeg(run, state.plane),
    objectiveBearing: bearingToObjective(run, state.plane),
    serviceStatus: state.serviceStatus,
    message: run.message,
    messageUntil: run.messageUntil,
    terrainWarning: terrainWarning(),
    cockpitView: state.camera.mode === 'cockpit',
    time: state.time,
  };
}

function render(dt) {
  const pal = palette();
  if (state.screen === 'title') {
    // Slow orbit around the parked aircraft on the home runway.
    const a = state.time * 0.12;
    state.camera.x = state.plane.x + Math.sin(a) * 30;
    state.camera.y = state.plane.y + 8;
    state.camera.z = state.plane.z + Math.cos(a) * 30;
    state.camera.yaw = a + Math.PI;
    state.camera.pitch = -0.12;
    state.camera.roll = 0;
  }
  renderer.setCamera(state.camera, pal);
  drawSky(ctx, renderer, state.camera, pal);
  const rings = state.run ? state.run.rings : [];
  state.trees = drawScene(renderer, {
    plane: state.plane,
    camera: state.camera,
    palette: pal,
    time: state.time,
    rings,
    activeRing: state.run ? activeRingIndex(state.run) : -1,
    wind: wind(),
    cockpitView: state.camera.mode === 'cockpit' && state.screen !== 'title',
    dt: state.frozen ? 0 : dt,
  });
  renderer.flush();
  if (state.screen === 'title') drawTitle(ctx, state);
  else if (state.screen === 'briefing') drawBriefing(ctx, state);
  else if (state.screen === 'flying' || state.screen === 'paused') {
    drawHud(ctx, renderer, hudState());
    if (state.screen === 'paused') drawPaused(ctx);
  } else if (state.screen === 'complete') {
    drawHud(ctx, renderer, hudState());
    drawComplete(ctx, state);
  } else if (state.screen === 'failed') drawFailed(ctx, state);
  else if (state.screen === 'campaign') drawCampaignDone(ctx, state);
}

let lastStamp = 0;
function loop(stamp) {
  const dt = Math.min(0.05, lastStamp ? (stamp - lastStamp) / 1000 : 0.016);
  lastStamp = stamp;
  state.time += dt;
  handlePresses();
  if (state.screen === 'flying' && !state.frozen) {
    stepFlying(dt / 2);
    stepFlying(dt / 2);
  }
  if (state.frozen) state.plane.propAngle += dt * 30;
  render(dt);
  requestAnimationFrame(loop);
}

titleScene(state.plane);
updateCamera(state.camera, state.plane, 1, 0);

if (shotName) {
  const staged = stageShot(shotName, state.plane);
  state.missionIndex = staged.missionIndex;
  state.run = staged.run;
  state.camera.mode = staged.cameraMode;
  state.screen = 'flying';
  updateCamera(state.camera, state.plane, 1, 0);
  for (const step of staged.steps) {
    stepFlight(state.plane, step, wind(), state.time, 1 / 60);
    state.time += 1 / 60;
    updateCamera(state.camera, state.plane, 1 / 60, state.time);
  }
  state.frozen = true;
  render(0.016);
  window.__shotReady = true;
}

window.__arus = state;
requestAnimationFrame(loop);
