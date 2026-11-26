// The battlefield (phase 18), built from the spec's ground: the defender's hex
// (centre) fills the far half, its six neighbours (ring) colour the flanks, a
// river the attacker must cross runs across the middle, and a city's walls
// stand in front of the defenders. Cells are 20 paces square.
//
// The ground decides how fast bands move and how the field looks; how hard
// the defender is to beat comes from the spec's modifiers (hills, forest,
// river, walls), exactly as in auto-resolve, so fighting is never a cheat.
// No DOM; the only randomness is the rng handed in.

export const CELL = 20;
export const GROUND = Object.freeze({ open: 0, forest: 1, hill: 2, river: 3, water: 4, marsh: 5, wall: 6 });
const WOODS = new Set(['forest', 'jungle']);
const WET = new Set(['coast', 'ocean', 'lake']);

/** The field for a spec: { width, height, cols, rows, cells, base, wallY, riverY }. */
export function buildField(spec, tuning, rng) {
  const width = tuning.width ?? 640;
  const height = tuning.height ?? 400;
  const cols = Math.floor(width / CELL);
  const rows = Math.floor(height / CELL);
  const cells = new Uint8Array(cols * rows);
  const set = (c, r, g) => { if (c >= 0 && r >= 0 && c < cols && r < rows) cells[r * cols + c] = g; };
  const blob = (cx, cy, rx, ry, g) => {
    for (let r = Math.floor(cy - ry); r <= cy + ry; r += 1) {
      for (let c = Math.floor(cx - rx); c <= cx + rx; c += 1) {
        const dx = (c - cx) / rx;
        const dy = (r - cy) / ry;
        if (dx * dx + dy * dy <= 1 - rng() * 0.25) set(c, r, g);
      }
    }
  };
  const centre = spec.ground?.centre ?? {};
  const half = Math.floor(rows / 2);
  const mid = Math.floor(cols / 2);

  // The flanks: each neighbouring hex leaves a mark on one side of the field.
  (spec.ground?.ring ?? []).forEach((n, i) => {
    const left = i % 2 === 0;
    const c = left ? 2 + Math.floor(rng() * 4) : cols - 3 - Math.floor(rng() * 4);
    const r = 3 + Math.floor((i / 6) * (rows - 6)) + Math.floor(rng() * 2);
    if (WET.has(n.terrain)) blob(left ? 0 : cols - 1, r, 3, 3, GROUND.water);
    else if (WOODS.has(n.feature)) blob(c, r, 2.5, 2, GROUND.forest);
    else if (n.terrain === 'mountain' || n.hills) blob(c, r, 2.5, 2, GROUND.hill);
    else if (n.feature === 'marsh') blob(c, r, 2.5, 1.5, GROUND.marsh);
  });

  // The defender's own hex: hills, woods or marsh around where they stand.
  const defY = Math.floor(rows * 0.22);
  if (centre.hills || centre.terrain === 'mountain') blob(mid, defY, 7, 4, GROUND.hill);
  if (WOODS.has(centre.feature)) { blob(mid - 4, defY + 1, 4, 3, GROUND.forest); blob(mid + 4, defY, 4, 3, GROUND.forest); }
  if (centre.feature === 'marsh') blob(mid, defY + 2, 6, 2, GROUND.marsh);

  // A river between the two sides, with the attacker on the near bank.
  let riverY = null;
  if (spec.ground?.riverCrossing) {
    riverY = half;
    for (let c = 0; c < cols; c += 1) { set(c, half, GROUND.river); if (rng() < 0.5) set(c, half - 1, GROUND.river); }
  }

  // A city: a wall across the field in front of the defenders.
  let wallY = null;
  if (spec.defender?.city) {
    wallY = Math.floor(rows * 0.34);
    for (let c = 2; c < cols - 2; c += 1) set(c, wallY, GROUND.wall);
  }
  return { width, height, cols, rows, cells, base: centre.terrain ?? 'grassland', wallY: wallY === null ? null : wallY * CELL + CELL / 2, riverY: riverY === null ? null : riverY * CELL + CELL / 2 };
}

/** The ground at a point. */
export function groundAt(field, x, y) {
  const c = Math.floor(x / CELL);
  const r = Math.floor(y / CELL);
  if (c < 0 || r < 0 || c >= field.cols || r >= field.rows) return GROUND.water;
  return field.cells[r * field.cols + c];
}

/** How fast a band moves on this ground (1 is open ground). */
export function speedFactor(field, x, y, tuning) {
  const g = groundAt(field, x, y);
  const slow = tuning.slow ?? {};
  if (g === GROUND.forest) return slow.forest ?? 0.55;
  if (g === GROUND.hill) return slow.hill ?? 0.7;
  if (g === GROUND.river) return slow.river ?? 0.4;
  if (g === GROUND.marsh) return slow.marsh ?? 0.5;
  if (g === GROUND.water) return slow.water ?? 0.25;
  return 1;
}
