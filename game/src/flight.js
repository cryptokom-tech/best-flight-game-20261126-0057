// The flight model: an arcade-but-honest light aircraft. Throttle sets the
// target speed, pitch trades speed for height, bank turns the nose, flaps
// lower the stall speed at the cost of drag, and the wind pushes the ground
// track. Ground handling, take-off rotation and landing quality live here
// too, so missions only read the events this module reports.

import {
  MAX_SPEED, STALL_SPEED, STALL_SPEED_FLAPS, ROTATE_SPEED,
  MAX_PITCH, MIN_PITCH, MAX_ROLL, FUEL_CAPACITY,
  FUEL_BURN_IDLE, FUEL_BURN_FULL, GRAVITY,
} from './config.js';
import { terrainHeight, surfaceAt } from './terrain.js';
import { servicePadAt, clampToWorld } from './world.js';
import { clamp, lerp, angleWrap } from './rng.js';

export const GEAR_HEIGHT = 1.6;

export function createAircraft() {
  return {
    x: 0, y: 0, z: 640,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, verticalSpeed: 0,
    throttle: 0, flaps: false,
    fuel: FUEL_CAPACITY, damage: 0,
    airborne: false, stalled: false, buffet: 0,
    propAngle: 0, groundTime: 0,
    cargoLoaded: false,
    lastLanding: null, crashed: null,
  };
}

export function placeOnRunway(plane, flat, heading) {
  // Start near the threshold behind the take-off direction, with the whole
  // strip ahead of the nose.
  plane.x = flat.x - Math.sin(heading) * (flat.halfLen - 30);
  plane.z = flat.z + Math.cos(heading) * (flat.halfLen - 30);
  plane.y = flat.elev + GEAR_HEIGHT;
  plane.heading = heading;
  plane.pitch = 0;
  plane.roll = 0;
  plane.speed = 0;
  plane.verticalSpeed = 0;
  plane.throttle = 0;
  plane.airborne = false;
  plane.crashed = null;
  plane.lastLanding = null;
}

function stallSpeed(plane) {
  return plane.flaps ? STALL_SPEED_FLAPS : STALL_SPEED;
}

// One physics step. `input` = {pitch, roll, throttleDelta} in [-1, 1].
// `wind` = {x, z, gust} plus the current time for gust shaping.
// Returns an events object the mission layer reads.
export function stepFlight(plane, input, wind, time, dt) {
  const events = { tookOff: false, landed: null, crashed: null, treeStrike: false };
  if (plane.crashed) return events;

  plane.throttle = clamp(plane.throttle + input.throttleDelta * dt * 0.9, 0, 1);
  const engineOn = plane.fuel > 0;
  if (engineOn) {
    plane.fuel = Math.max(0, plane.fuel - (FUEL_BURN_IDLE + plane.throttle * (FUEL_BURN_FULL - FUEL_BURN_IDLE)) * dt);
  }
  plane.propAngle += dt * (engineOn ? 14 + plane.throttle * 46 : Math.max(0, 6 - plane.speed * 0.05));

  const gustX = wind.x + Math.sin(time * 0.7) * wind.gust + Math.sin(time * 2.3) * wind.gust * 0.4;
  const gustZ = wind.z + Math.cos(time * 0.55) * wind.gust + Math.cos(time * 1.9) * wind.gust * 0.4;

  if (!plane.airborne) {
    stepGround(plane, input, events, dt);
  } else {
    stepAir(plane, input, engineOn, dt);
  }

  // Position: air velocity along the nose plus wind drift once airborne
  // (a parked aircraft does not slide sideways in the wind).
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  const windFactor = plane.airborne ? 1 : 0;
  plane.x = clampToWorld(plane.x + (fx * plane.speed + gustX * windFactor) * dt);
  plane.z = clampToWorld(plane.z + (fz * plane.speed + gustZ * windFactor) * dt);
  if (plane.airborne) plane.y += plane.verticalSpeed * dt;

  const ground = terrainHeight(plane.x, plane.z);
  if (plane.airborne && plane.y <= ground + GEAR_HEIGHT) {
    plane.y = ground + GEAR_HEIGHT;
    touchDown(plane, events);
  }
  if (!plane.airborne) plane.y = Math.max(plane.y, ground + GEAR_HEIGHT);

  plane.groundTime = plane.airborne ? 0 : plane.groundTime + dt;
  return events;
}

function stepGround(plane, input, events, dt) {
  const target = plane.throttle * MAX_SPEED * 0.92;
  const accel = plane.throttle > 0.02 ? 7.5 : -9;
  plane.speed = clamp(plane.speed + (target - plane.speed) * Math.min(1, dt * (plane.speed < target ? 0.55 : 1.4)) + (plane.speed < target ? accel * dt * 0.35 : 0), 0, MAX_SPEED);
  if (plane.throttle < 0.02) plane.speed = Math.max(0, plane.speed - 6 * dt);
  // Rudder steering at taxi speed, firmer as speed builds.
  plane.heading = angleWrap(plane.heading + input.roll * dt * (0.25 + plane.speed * 0.012));
  plane.roll = lerp(plane.roll, input.roll * 0.06, dt * 4);
  plane.pitch = lerp(plane.pitch, 0, dt * 3);
  plane.verticalSpeed = 0;
  plane.stalled = false;
  // Rotate: enough speed and a pull on the stick lifts the nose.
  if (plane.speed >= ROTATE_SPEED && input.pitch > 0.25) {
    plane.airborne = true;
    plane.pitch = 0.14;
    plane.verticalSpeed = 2.2;
    events.tookOff = true;
  }
  // Rolling into water or off a cliff edge ends the sortie.
  const ground = terrainHeight(plane.x, plane.z);
  if (surfaceAt(plane.x, plane.z) === 'water' && plane.speed > 3) {
    plane.crashed = 'You rolled into the sea.';
    events.crashed = plane.crashed;
  }
  if (plane.y > ground + GEAR_HEIGHT + 6 && plane.speed > 8) {
    plane.airborne = true; // rolled off a ledge
    plane.verticalSpeed = -1;
  }
}

function stepAir(plane, input, engineOn, dt) {
  const stall = stallSpeed(plane);
  plane.stalled = plane.speed < stall;
  plane.buffet = plane.stalled ? Math.min(1, plane.buffet + dt * 3) : Math.max(0, plane.buffet - dt * 2);

  // Pitch and roll answer the stick, weaker at low speed.
  const authority = clamp(plane.speed / 30, 0.35, 1);
  const pitchTarget = clamp(input.pitch * 0.5, MIN_PITCH, MAX_PITCH);
  plane.pitch = lerp(plane.pitch, plane.stalled ? Math.min(pitchTarget, -0.12) : pitchTarget, Math.min(1, dt * 2.6 * authority));
  const rollTarget = input.roll * MAX_ROLL;
  plane.roll = lerp(plane.roll, rollTarget, Math.min(1, dt * 3.2 * authority));

  // Coordinated turn from bank.
  const turnRate = (Math.tan(clamp(plane.roll, -1.2, 1.2)) * GRAVITY) / Math.max(plane.speed, 12);
  plane.heading = angleWrap(plane.heading + turnRate * dt);

  // Speed: engine thrust toward the throttle target, gravity along the
  // flight path, flap drag.
  const thrustTarget = engineOn ? plane.throttle * MAX_SPEED : 0;
  let dv = (thrustTarget - plane.speed) * 0.32 * dt;
  dv -= Math.sin(plane.pitch) * GRAVITY * 0.62 * dt;
  if (plane.flaps) dv -= plane.speed * 0.05 * dt;
  if (!engineOn) dv -= 1.1 * dt;
  plane.speed = clamp(plane.speed + dv, 0, MAX_SPEED * 1.25);

  // Vertical speed: climb from pitch and speed, sink when stalled or slow.
  const liftSink = plane.stalled ? (stall - plane.speed) * 0.55 + 2.5 : Math.max(0, (stall + 4 - plane.speed)) * 0.18;
  plane.verticalSpeed = plane.speed * Math.sin(plane.pitch) * Math.cos(plane.roll) - liftSink;
}

function touchDown(plane, events) {
  const surface = surfaceAt(plane.x, plane.z);
  const vs = plane.verticalSpeed;
  const bank = Math.abs(plane.roll);
  if (surface === 'water') {
    plane.crashed = 'Ditched in the sea.';
    events.crashed = plane.crashed;
    return;
  }
  let quality;
  if (vs < -6.5 || bank > 0.5 || plane.pitch < -0.28) {
    plane.crashed = 'Hard impact — the airframe gave up.';
    events.crashed = plane.crashed;
    return;
  }
  if (plane.speed > 42 && surface !== 'runway' && surface !== 'pad') {
    plane.crashed = 'Flew into the hillside at speed.';
    events.crashed = plane.crashed;
    return;
  }
  if (vs >= -2.2 && bank < 0.16 && (surface === 'runway' || surface === 'pad')) quality = 'smooth';
  else if (vs >= -4.2 && bank < 0.32) quality = 'firm';
  else quality = 'hard';
  if (quality === 'hard') plane.damage = Math.min(100, plane.damage + 26);
  if (quality === 'firm') plane.damage = Math.min(100, plane.damage + 7);
  if (surface === 'grass' || surface === 'sand') plane.damage = Math.min(100, plane.damage + 5);
  plane.airborne = false;
  plane.pitch = 0;
  plane.roll = 0;
  plane.verticalSpeed = 0;
  plane.lastLanding = { quality, surface, pad: servicePadAt(plane.x, plane.z), speed: plane.speed };
  events.landed = plane.lastLanding;
  if (plane.damage >= 100) {
    plane.crashed = 'Too much damage — she will not fly again.';
    events.crashed = plane.crashed;
  }
}

// Ground services while parked on a pad: refuel, repair, load cargo.
// Returns a status string for the HUD, or null.
export function stepServices(plane, dt) {
  if (plane.airborne || plane.speed > 2.5) return null;
  const pad = servicePadAt(plane.x, plane.z);
  if (!pad) return null;
  let status = null;
  if (plane.fuel < FUEL_CAPACITY) {
    plane.fuel = Math.min(FUEL_CAPACITY, plane.fuel + 16 * dt);
    status = 'Refuelling…';
  }
  if (plane.damage > 0) {
    plane.damage = Math.max(0, plane.damage - 6 * dt);
    status = status ? 'Refuelling and repairing…' : 'Repairing…';
  }
  if (pad === 'harbor' && !plane.cargoLoaded) {
    plane.cargoLoaded = true;
    status = 'Mail crates loaded.';
  }
  return status;
}

// Tree and building strikes while flying low. Returns true on a strike.
export function checkPropStrike(plane, trees) {
  if (!plane.airborne) return false;
  for (const tree of trees) {
    const dx = plane.x - tree.x;
    const dz = plane.z - tree.z;
    if (dx * dx + dz * dz < 30 && plane.y < tree.h + tree.size + 2) {
      plane.damage = Math.min(100, plane.damage + 14);
      plane.speed *= 0.82;
      if (plane.damage >= 100) plane.crashed = 'Clipped the trees once too often.';
      return true;
    }
  }
  return false;
}

export function speedKnots(plane) {
  return plane.speed * 1.944;
}

export function altitudeFeet(plane) {
  return Math.max(0, (plane.y - terrainHeight(plane.x, plane.z))) * 3.281;
}

export function headingDegrees(plane) {
  const deg = (plane.heading * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
