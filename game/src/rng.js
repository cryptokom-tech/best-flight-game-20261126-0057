// Deterministic randomness: a seeded PRNG for world building and a small
// value-noise helper so terrain detail and tree scatter are identical on
// every load (screenshots and gameplay always see the same archipelago).

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

export function hash2(x, z, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Bilinear value noise in [0, 1) at world scale `cell` metres.
export function valueNoise(x, z, cell, seed) {
  const gx = Math.floor(x / cell);
  const gz = Math.floor(z / cell);
  const fx = smoothstep(x / cell - gx);
  const fz = smoothstep(z / cell - gz);
  const a = hash2(gx, gz, seed);
  const b = hash2(gx + 1, gz, seed);
  const c = hash2(gx, gz + 1, seed);
  const d = hash2(gx + 1, gz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Fractal noise: three octaves, returns roughly [-1, 1].
export function fbm(x, z, seed) {
  const n1 = valueNoise(x, z, 420, seed);
  const n2 = valueNoise(x, z, 140, seed + 7);
  const n3 = valueNoise(x, z, 46, seed + 13);
  return (n1 * 0.55 + n2 * 0.3 + n3 * 0.15) * 2 - 1;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function angleWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
