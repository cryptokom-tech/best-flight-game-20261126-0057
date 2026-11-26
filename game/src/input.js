// Input: keyboard and mouse together. The mouse steers like a stick (move
// it away from centre to bank and pitch), the arrow keys and A/D/W/S do the
// same from the keyboard, Shift/Ctrl work the throttle, and single keys
// toggle flaps, camera, pause and sound. Discrete presses are queued so the
// game loop can react once per press.

export function createInput(canvas) {
  const keys = new Set();
  const presses = [];
  const mouse = { x: 0.5, y: 0.5, active: false, down: false };

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!keys.has(event.code)) presses.push(event.code);
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) / rect.width;
    mouse.y = (event.clientY - rect.top) / rect.height;
    mouse.active = true;
  });
  canvas.addEventListener('mousedown', () => {
    mouse.down = true;
    presses.push('MouseDown');
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('mouseleave', () => {
    mouse.active = false;
  });

  function deadzone(v, zone) {
    if (Math.abs(v) < zone) return 0;
    return (v - Math.sign(v) * zone) / (1 - zone);
  }

  // Continuous stick + throttle state for this frame.
  function readStick() {
    let roll = 0;
    let pitch = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch -= 1;
    if (mouse.active) {
      roll += deadzone((mouse.x - 0.5) * 2, 0.08) * 0.95;
      pitch += deadzone((0.5 - mouse.y) * 2, 0.08) * 0.95;
    }
    let throttleDelta = 0;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Equal')) throttleDelta += 1;
    if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('Minus')) throttleDelta -= 1;
    if (keys.has('Space')) throttleDelta -= 1.6;
    return {
      roll: Math.max(-1, Math.min(1, roll)),
      pitch: Math.max(-1, Math.min(1, pitch)),
      throttleDelta,
    };
  }

  function takePresses() {
    const taken = presses.slice();
    presses.length = 0;
    return taken;
  }

  return { readStick, takePresses, mouse };
}
