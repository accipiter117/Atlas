// Cosmetic randomness: grass tufts, forest dots, wave marks.
//
// A completely separate generator from the game's (core/rng.js and
// state.rng), seeded from what is being drawn, so drawing the map can never
// change a dice roll and the same tile always looks the same.

export function fxRandom(...parts) {
  let s = 0x9e3779b9;
  for (const p of parts) {
    s = Math.imul(s ^ (p | 0), 0x85ebca6b);
    s ^= s >>> 13;
  }
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number for a string id, for seeding. */
export function idSeed(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h | 0;
}
