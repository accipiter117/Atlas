// Hex grid maths: pointy-top hexes in axial coordinates (q, r).
//
// Axial coordinates are two numbers per hex; the third cube coordinate is
// s = -q - r and is worked out when needed. Every movement, range and area
// rule in Atlas uses hexDistance, so six neighbours are always equally near
// (no diagonal shortcuts like on a square grid).
//
// Reference: https://www.redblobgames.com/grids/hexagons/

const SQRT3 = Math.sqrt(3);

/** The six neighbour offsets, clockwise from east. */
export const DIRECTIONS = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),   // east
  Object.freeze({ q: 1, r: -1 }),  // north-east
  Object.freeze({ q: 0, r: -1 }),  // north-west
  Object.freeze({ q: -1, r: 0 }),  // west
  Object.freeze({ q: -1, r: 1 }),  // south-west
  Object.freeze({ q: 0, r: 1 }),   // south-east
]);

export function hex(q, r) {
  return { q, r };
}

/** A string key for maps and sets, e.g. "3,-2". */
export function hexKey(h) {
  return `${h.q},${h.r}`;
}

export function parseHexKey(key) {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function hexEquals(a, b) {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a, b) {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexSubtract(a, b) {
  return { q: a.q - b.q, r: a.r - b.r };
}

export function hexScale(h, k) {
  return { q: h.q * k, r: h.r * k };
}

export function neighbour(h, direction) {
  return hexAdd(h, DIRECTIONS[((direction % 6) + 6) % 6]);
}

export function neighbours(h) {
  return DIRECTIONS.map((d) => hexAdd(h, d));
}

/** Steps between two hexes. */
export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** The hexes exactly `radius` steps away, in a fixed order. Radius 0 is the centre itself. */
export function ring(center, radius) {
  if (radius === 0) return [{ q: center.q, r: center.r }];
  const out = [];
  let h = hexAdd(center, hexScale(DIRECTIONS[4], radius));
  for (let side = 0; side < 6; side += 1) {
    for (let i = 0; i < radius; i += 1) {
      out.push(h);
      h = neighbour(h, side);
    }
  }
  return out;
}

/** Every hex within `radius` steps, centre first, then ring by ring. */
export function spiral(center, radius) {
  const out = [];
  for (let k = 0; k <= radius; k += 1) out.push(...ring(center, k));
  return out;
}

/** Round fractional axial coordinates to the nearest hex. */
export function hexRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

/**
 * The hexes on a straight line from a to b, both ends included.
 * A tiny nudge breaks ties the same way every time, so lines are deterministic.
 */
export function line(a, b) {
  const n = hexDistance(a, b);
  if (n === 0) return [{ q: a.q, r: a.r }];
  const eq = 1e-6;
  const er = 1e-6;
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    out.push(hexRound(a.q + eq + (b.q - a.q) * t, a.r + er + (b.r - a.r) * t));
  }
  return out;
}

/** Centre of a hex in pixels, for pointy-top hexes of the given size (centre to corner). */
export function hexToPixel(h, size) {
  return { x: size * SQRT3 * (h.q + h.r / 2), y: size * 1.5 * h.r };
}

/** The hex under a pixel position. */
export function pixelToHex(x, y, size) {
  const q = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return hexRound(q, r);
}

/** The six corner points of a hex, for drawing. */
export function hexCorners(h, size) {
  const c = hexToPixel(h, size);
  const out = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    out.push({ x: c.x + size * Math.cos(angle), y: c.y + size * Math.sin(angle) });
  }
  return out;
}
