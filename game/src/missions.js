// Mission logic: each sortie is a short chain of objectives — take off, fly
// the rings, load cargo, land at the named strip — with a clock on the
// timed sorties, scoring for rings, landing quality, cargo condition and
// time in hand, and clear failure states (crash, out of time, stranded
// without fuel). Free flight after the campaign keeps the rings coming.

import { SCORE } from './config.js';
import { buildCourse, buildFreeCourse, HOME_RUNWAY, HARBOR_PAD, LIGHTHOUSE_STRIP, servicePadAt } from './world.js';
import { headingDegrees } from './flight.js';
import { makeRng } from './rng.js';

const FLAT_BY_ID = { home: HOME_RUNWAY, harbor: HARBOR_PAD, lighthouse: LIGHTHOUSE_STRIP };

function landedOnFlat(plane, flat) {
  const cos = Math.cos(flat.heading);
  const sin = Math.sin(flat.heading);
  const dx = plane.x - flat.x;
  const dz = plane.z - flat.z;
  const along = dx * sin - dz * cos;
  const across = dx * cos + dz * sin;
  return Math.abs(along) <= flat.halfLen + 14 && Math.abs(across) <= flat.halfWid + 16;
}

function ringDistance(plane, ring) {
  return Math.hypot(plane.x - ring.x, plane.y - ring.y, plane.z - ring.z);
}

export function createMissionRun(definition, freeFlight = false) {
  const rings = freeFlight ? buildFreeCourse(makeRng(Date.now() % 100000)) : buildCourse(definition.course);
  const objectives = [{ kind: 'takeoff', text: 'Take off — throttle up (Shift), pull up at speed' }];
  if (definition.cargo) {
    objectives.push({ kind: 'loadCargo', text: 'Land at Harbor Island and stop on the pad to load the mail' });
  }
  rings.forEach((ring, i) => {
    objectives.push({ kind: 'ring', index: i, text: `Fly through ring ${i + 1} of ${rings.length}` });
  });
  if (definition.cargo) {
    objectives.push({ kind: 'deliver', text: 'Deliver the mail — land on the Lighthouse strip' });
  } else if (!freeFlight) {
    objectives.push({
      kind: 'finalLanding',
      flat: definition.finalLanding,
      text: definition.finalLanding === 'home' ? 'Land back at Pulau Induk' : 'Land on the Lighthouse strip',
    });
  }
  return {
    definition,
    freeFlight,
    rings,
    objectives,
    objectiveIndex: 0,
    elapsed: 0,
    score: 0,
    breakdown: [],
    completed: false,
    failed: null,
    message: null,
    messageUntil: 0,
    cargoCondition: 100,
    strandedTimer: 0,
    ringFlash: 0,
  };
}

export function currentObjective(run) {
  return run.objectives[run.objectiveIndex] || null;
}

export function objectivePoint(run, plane) {
  const obj = currentObjective(run);
  if (!obj) return null;
  if (obj.kind === 'ring') {
    const ring = run.rings[obj.index];
    return { x: ring.x, y: ring.y, z: ring.z };
  }
  if (obj.kind === 'loadCargo') return { x: HARBOR_PAD.x, y: HARBOR_PAD.elev + 12, z: HARBOR_PAD.z };
  if (obj.kind === 'deliver') return { x: LIGHTHOUSE_STRIP.x, y: LIGHTHOUSE_STRIP.elev + 12, z: LIGHTHOUSE_STRIP.z };
  if (obj.kind === 'finalLanding') {
    const flat = FLAT_BY_ID[obj.flat];
    return { x: flat.x, y: flat.elev + 12, z: flat.z };
  }
  if (obj.kind === 'takeoff') {
    return { x: plane.x + Math.sin(plane.heading) * 300, y: plane.y + 40, z: plane.z - Math.cos(plane.heading) * 300 };
  }
  return null;
}

export function objectiveHeadingDeg(run, plane) {
  const point = objectivePoint(run, plane);
  if (!point) return null;
  const deg = (Math.atan2(point.x - plane.x, -(point.z - plane.z)) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function addScore(run, label, points) {
  run.score += points;
  run.breakdown.push({ label, points });
}

function landingPoints(quality) {
  if (quality === 'smooth') return SCORE.landingSmooth;
  if (quality === 'firm') return SCORE.landingFirm;
  return SCORE.landingHard;
}

function finishMission(run, plane) {
  run.completed = true;
  addScore(run, 'Sortie complete', SCORE.missionComplete);
  const def = run.definition;
  if (def.timeLimit > 0) {
    const remaining = Math.max(0, def.timeLimit - run.elapsed);
    if (remaining > 0) addScore(run, 'Time in hand', Math.round(remaining) * SCORE.timeBonusPerSecond);
  } else if (run.elapsed < def.parTime) {
    addScore(run, 'Under par time', Math.round(def.parTime - run.elapsed) * SCORE.timeBonusPerSecond);
  }
  if (def.cargo && plane.cargoLoaded) {
    addScore(run, run.cargoCondition >= 70 ? 'Cargo intact' : 'Cargo battered', run.cargoCondition >= 70 ? SCORE.cargoIntact : 50);
  }
}

// Advance the mission by one step. `events` comes from stepFlight.
// Returns { ringPassed, landed } flags for sound and particles.
export function updateMission(run, plane, events, time, dt) {
  const flags = { ringPassed: false, landed: null, justCompleted: false, justFailed: false };
  if (run.completed || run.failed) return flags;
  run.elapsed += dt;

  if (events.crashed) {
    run.failed = events.crashed;
    flags.justFailed = true;
    return flags;
  }
  const def = run.definition;
  if (def.timeLimit > 0 && run.elapsed > def.timeLimit) {
    run.failed = 'Out of time — the mail boat left without you.';
    flags.justFailed = true;
    return flags;
  }
  // Stranded: on the ground, no fuel, nowhere near a service pad.
  if (!plane.airborne && plane.speed < 1 && plane.fuel <= 0 && !servicePadAt(plane.x, plane.z)) {
    run.strandedTimer += dt;
    if (run.strandedTimer > 2) {
      run.failed = 'Stranded with empty tanks.';
      flags.justFailed = true;
      return flags;
    }
  } else {
    run.strandedTimer = 0;
  }

  const obj = currentObjective(run);
  if (!obj) {
    if (run.freeFlight) {
      run.rings = buildFreeCourse(makeRng(Math.floor(time * 10) % 100000));
      run.objectives = run.rings.map((ring, i) => ({ kind: 'ring', index: i, text: `Free flight — ring ${i + 1} of ${run.rings.length}` }));
      run.objectiveIndex = 0;
    }
    return flags;
  }

  if (events.landed) {
    flags.landed = events.landed;
    if (plane.cargoLoaded && events.landed.quality === 'hard') run.cargoCondition = Math.max(0, run.cargoCondition - 45);
    if (plane.cargoLoaded && events.landed.quality === 'firm') run.cargoCondition = Math.max(0, run.cargoCondition - 15);
  }

  switch (obj.kind) {
    case 'takeoff':
      if (events.tookOff) {
        run.objectiveIndex++;
        run.message = 'Airborne — good flying';
        run.messageUntil = time + 2.4;
      }
      break;
    case 'ring': {
      const ring = run.rings[obj.index];
      if (plane.airborne && ringDistance(plane, ring) < 16) {
        ring.passed = true;
        flags.ringPassed = true;
        addScore(run, `Ring ${obj.index + 1}`, SCORE.ring);
        run.message = `Ring ${obj.index + 1} — +${SCORE.ring}`;
        run.messageUntil = time + 2;
        run.objectiveIndex++;
      }
      break;
    }
    case 'loadCargo':
      if (!plane.airborne && plane.cargoLoaded && landedOnFlat(plane, HARBOR_PAD)) {
        addScore(run, 'Harbor landing', landingPoints(plane.lastLanding ? plane.lastLanding.quality : 'firm'));
        run.message = 'Mail loaded — deliver it to the Lighthouse strip';
        run.messageUntil = time + 3;
        run.objectiveIndex++;
      }
      break;
    case 'deliver':
      if (events.landed && landedOnFlat(plane, LIGHTHOUSE_STRIP)) {
        addScore(run, 'Delivery landing', landingPoints(events.landed.quality));
        run.objectiveIndex++;
        finishMission(run, plane);
        flags.justCompleted = true;
      }
      break;
    case 'finalLanding': {
      const flat = FLAT_BY_ID[obj.flat];
      if (events.landed && landedOnFlat(plane, flat)) {
        addScore(run, 'Final landing', landingPoints(events.landed.quality));
        run.objectiveIndex++;
        finishMission(run, plane);
        flags.justCompleted = true;
      }
      break;
    }
    default:
      break;
  }
  return flags;
}

export function timeLeft(run) {
  if (!run.definition.timeLimit) return null;
  return Math.max(0, run.definition.timeLimit - run.elapsed);
}

export function activeRingIndex(run) {
  const obj = currentObjective(run);
  return obj && obj.kind === 'ring' ? obj.index : -1;
}

export function objectiveText(run) {
  const obj = currentObjective(run);
  if (run.completed) return 'Sortie complete';
  if (run.failed) return 'Sortie failed';
  return obj ? obj.text : 'Free flight';
}

export function bearingToObjective(run, plane) {
  const deg = objectiveHeadingDeg(run, plane);
  if (deg === null) return 0;
  const rel = ((deg - headingDegrees(plane) + 540) % 360) - 180;
  return (rel * Math.PI) / 180;
}
