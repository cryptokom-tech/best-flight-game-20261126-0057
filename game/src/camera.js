// Cameras: a smoothed chase view that sits behind and above the aircraft
// and a cockpit view from the pilot's seat. Both produce a position plus
// yaw/pitch/roll the renderer turns into a view basis; the chase camera
// eases toward its anchor so it never fights the pilot in a turn.

import { lerp, angleWrap } from './rng.js';

export function createCamera() {
  return {
    mode: 'chase',
    x: 0, y: 30, z: 700,
    yaw: 0, pitch: -0.08, roll: 0,
    lookX: 0, lookY: 10, lookZ: 600,
  };
}

export function updateCamera(camera, plane, dt, time) {
  if (camera.mode === 'cockpit') {
    const fx = Math.sin(plane.heading);
    const fz = -Math.cos(plane.heading);
    camera.x = plane.x + fx * 1.4;
    camera.y = plane.y + 1.28;
    camera.z = plane.z + fz * 1.4;
    camera.yaw = plane.heading;
    camera.pitch = plane.pitch - 0.045;
    camera.roll = plane.roll;
    camera.lookX = camera.x + fx * 60;
    camera.lookY = camera.y + Math.sin(plane.pitch) * 60;
    camera.lookZ = camera.z + fz * 60;
    return;
  }
  // Chase: anchor behind the aircraft, eased with a speed-aware lag.
  const back = 13.5 + plane.speed * 0.055;
  const up = 3.8;
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  const anchorX = plane.x - fx * back;
  const anchorY = plane.y + up - Math.sin(plane.pitch) * back * 0.55;
  const anchorZ = plane.z - fz * back;
  const ease = Math.min(1, dt * 4.2);
  camera.x = lerp(camera.x, anchorX, ease);
  camera.y = lerp(camera.y, anchorY, ease);
  camera.z = lerp(camera.z, anchorZ, ease);
  camera.yaw = angleWrap(camera.yaw + angleWrap(plane.heading - camera.yaw) * Math.min(1, dt * 5));
  camera.pitch = lerp(camera.pitch, plane.pitch * 0.72 - 0.05, Math.min(1, dt * 4));
  camera.roll = lerp(camera.roll, plane.roll * 0.45, Math.min(1, dt * 4));
  camera.lookX = plane.x + fx * 26;
  camera.lookY = plane.y + 1.2 + Math.sin(plane.pitch) * 18;
  camera.lookZ = plane.z + fz * 26;
  void time;
}

export function toggleCamera(camera) {
  camera.mode = camera.mode === 'chase' ? 'cockpit' : 'chase';
  return camera.mode;
}
