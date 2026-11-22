// Seeded randomness for everything that can change the outcome of a game.
//
// The generator is mulberry32: tiny, fast and good enough for a strategy game.
// Its whole state is one 32-bit number, which lives in state.rng, so saving a
// game saves its luck too and a replay rolls exactly the same dice.
//
// Named forks give a separate stream for one job (map generation, seat order,
// a battle) without disturbing the main stream. Adding a new dice roll in one
// system then cannot shift every other roll in the game.

import { hashString } from './hash.js';

/** Advance a mulberry32 state once. Returns the next state and a float in [0, 1). */
export function step(seed) {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { seed: next, value };
}

/** Turn any integer seed into a valid generator state. */
export function normaliseSeed(seed) {
  if (!Number.isInteger(seed)) throw new TypeError(`Seed must be an integer, got ${seed}`);
  return seed >>> 0;
}

/**
 * A small stream object for code that owns its randomness outright
 * (map generation, tests, tools). Game code inside the sim uses the
 * state-based helpers below so the stream is saved with the game.
 */
export function createRng(seed) {
  let s = normaliseSeed(seed);
  const rng = {
    get seed() { return s; },
    next() { const r = step(s); s = r.seed; return r.value; },
    int(min, max) { return min + Math.floor(rng.next() * (max - min + 1)); },
    pick(list) { return list[Math.floor(rng.next() * list.length)]; },
    shuffle(list) { return shuffleWith(list, rng.next); },
    fork(label) { return createRng(forkSeed(s, label)); },
  };
  return rng;
}

/** Derive a sub-stream seed from a parent seed and a label, without advancing the parent. */
export function forkSeed(seed, label) {
  return (normaliseSeed(seed) ^ hashString(String(label))) >>> 0;
}

/** Draw a float in [0, 1) from state.rng, advancing it. The state must be a working copy. */
export function random(state) {
  const r = step(state.rng);
  state.rng = r.seed;
  return r.value;
}

/** Draw an integer from min to max inclusive from state.rng. */
export function randomInt(state, min, max) {
  return min + Math.floor(random(state) * (max - min + 1));
}

/** A named sub-stream of the game's randomness. The main stream is left untouched. */
export function fork(state, label) {
  return createRng(forkSeed(state.rng, label));
}

/** Fisher-Yates shuffle into a new array using a supplied float source. */
export function shuffleWith(list, next) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
