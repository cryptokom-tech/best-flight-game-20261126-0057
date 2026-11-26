// Screenshot staging: ?shot=cover|cockpit|landing|cargo places the real
// game in a composed moment — aircraft state, mission objective, camera and
// time of day — then runs fixed physics steps with scripted stick inputs so
// the camera settles and the propeller spins before the frame is captured.
// These are renders of the game's own code, exactly as a player would see.

import { MISSIONS } from './config.js';
import { createMissionRun } from './missions.js';
import { HOME_RUNWAY, LIGHTHOUSE_STRIP } from './world.js';

function airborne(plane, x, y, z, heading, speed, opts = {}) {
  plane.x = x;
  plane.y = y;
  plane.z = z;
  plane.heading = heading;
  plane.pitch = opts.pitch ?? 0.03;
  plane.roll = opts.roll ?? 0;
  plane.speed = speed;
  plane.verticalSpeed = 0;
  plane.throttle = opts.throttle ?? 0.75;
  plane.fuel = opts.fuel ?? 82;
  plane.damage = opts.damage ?? 0;
  plane.flaps = opts.flaps ?? false;
  plane.airborne = true;
  plane.crashed = null;
  plane.cargoLoaded = opts.cargo ?? false;
}

// Returns { missionIndex, run, cameraMode, steps: [{pitch, roll, throttleDelta}] }.
export function stageShot(name, plane) {
  if (name === 'cover') {
    // Dusk storm run: banking toward the first amber ring over the bay,
    // Pulau Induk and its lit runway below.
    const run = createMissionRun(MISSIONS[2]);
    run.objectiveIndex = 1;
    run.score = 0;
    run.elapsed = 96;
    airborne(plane, 303, 135, -271, 0.8, 44, { roll: -0.34, pitch: 0.05, throttle: 0.82, fuel: 76 });
    return { missionIndex: 2, run, cameraMode: 'chase', steps: settle(-0.3, 0.1) };
  }
  if (name === 'cockpit') {
    // Morning training from the pilot's seat: instruments lit, the second
    // bay ring dead ahead over Harbor Island's coast.
    const run = createMissionRun(MISSIONS[0]);
    run.objectiveIndex = 2;
    run.rings[0].passed = true;
    run.score = 100;
    run.breakdown.push({ label: 'Ring 1', points: 100 });
    run.elapsed = 74;
    airborne(plane, -830, 122, -490, -1.0, 41, { roll: 0.1, pitch: 0.02, throttle: 0.72, fuel: 88 });
    return { missionIndex: 0, run, cameraMode: 'cockpit', steps: settle(0.08, 0.05) };
  }
  if (name === 'landing') {
    // Final approach to the short Lighthouse strip at dusk: flaps down,
    // PAPI lights and the runway ahead, lighthouse beam sweeping.
    const run = createMissionRun(MISSIONS[2]);
    run.rings.forEach((ring) => { ring.passed = true; });
    run.objectiveIndex = run.objectives.length - 1;
    run.score = 500;
    run.elapsed = 268;
    const heading = LIGHTHOUSE_STRIP.heading;
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = Math.sin(heading);
    airborne(
      plane,
      LIGHTHOUSE_STRIP.x - fx * 430 + rx * 108,
      LIGHTHOUSE_STRIP.elev + 62,
      LIGHTHOUSE_STRIP.z - fz * 430 + rz * 108,
      heading - 0.19,
      27,
      { roll: 0.05, pitch: -0.07, throttle: 0.34, fuel: 41, flaps: true },
    );
    return { missionIndex: 2, run, cameraMode: 'cockpit', steps: settle(0.02, -0.06) };
  }
  // cargo: midday mail run, crates aboard, Harbor Island astern and the
  // Lighthouse strip on the nose with the clock running.
  const run = createMissionRun(MISSIONS[1]);
  run.objectiveIndex = 2;
  run.score = 150;
  run.elapsed = 128;
  airborne(plane, -1480, 95, -880, 1.25, 49, { roll: 0.15, pitch: 0.06, throttle: 0.8, fuel: 63, cargo: true });
  return { missionIndex: 1, run, cameraMode: 'chase', steps: settle(0.14, 0.06) };
}

function settle(roll, pitch) {
  const steps = [];
  for (let i = 0; i < 80; i++) steps.push({ roll, pitch, throttleDelta: 0 });
  return steps;
}

export function titleScene(plane) {
  plane.x = HOME_RUNWAY.x - 6;
  plane.y = HOME_RUNWAY.elev + 1.6;
  plane.z = HOME_RUNWAY.z + 60;
  plane.heading = 0.35;
  plane.pitch = 0;
  plane.roll = 0;
  plane.speed = 0;
  plane.throttle = 0;
  plane.airborne = false;
  plane.crashed = null;
}
