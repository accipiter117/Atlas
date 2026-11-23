// Seeded value noise for map generation.
//
// Uses only +, -, *, / and Math.floor, so every browser and Node produce
// bit-identical results (functions like Math.sin are allowed to differ
// slightly between engines, which would quietly make "the same seed" give
// different maps on different machines).

/** A 32-bit integer hash of two lattice coordinates and a seed. */
function latticeHash(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth noise in [0, 1) at a point. */
export function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = latticeHash(x0, y0, seed);
  const b = latticeHash(x0 + 1, y0, seed);
  const c = latticeHash(x0, y0 + 1, seed);
  const d = latticeHash(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** Several octaves of noise added together, normalised to [0, 1). */
export function fractalNoise(x, y, seed, octaves = 4, persistence = 0.5) {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let max = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += valueNoise(x * frequency, y * frequency, (seed + i * 1013) | 0) * amplitude;
    max += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / max;
}
