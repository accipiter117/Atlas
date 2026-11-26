#!/usr/bin/env node
// Performance targets (section 11.6), measured in Node.
//
// Plays a Large 8-faction AI game to turn 200 (cached in .cache/ after the
// first run, keyed by the ruleset), then times the next few full AI rounds.
// Target: every round under 2 seconds.
//
// Run:  npm run perf [-- --rebuild] [--rounds 5] [--turn 200] [--profile]

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadReal } from '../test/data/helpers.js';
import { createGame, applyCommand, view, currentFactionId, fingerprint } from '../src/sim/index.js';
import { createAi, runAiTurn } from '../src/ai/index.js';

export const ROUND_TARGET_MS = 2000;

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const atTurn = Number(opt('turn', 200));
const rounds = Number(opt('rounds', 5));

const { ruleset, hash } = await loadReal(['base-ancient']);

/** Play every seat of one round with the given AIs. Returns the new state and the round's time. */
export function playRound(state, ais) {
  const t0 = performance.now();
  const turn = state.turn;
  let guard = 0;
  while (state.turn === turn && !state.winner && guard < 64) {
    guard += 1;
    const me = currentFactionId(state);
    runAiTurn(ais[me], () => view(state, me, ruleset), (cmd) => {
      const r = applyCommand(state, cmd, ruleset);
      if (r.ok) state = r.state;
      return r;
    });
    if (!state.winner && currentFactionId(state) === me) state = applyCommand(state, { type: 'endTurn', faction: me }, ruleset).state;
  }
  return { state, ms: performance.now() - t0 };
}

const cache = `.cache/perf-large-${atTurn}-${hash}.json`;
let state;
if (existsSync(cache) && !args.includes('--rebuild')) {
  state = JSON.parse(readFileSync(cache, 'utf8'));
  console.log(`perf: loaded turn ${state.turn} from ${cache}`);
} else {
  console.log(`perf: playing a Large 8-faction game to turn ${atTurn} (a few minutes; cached afterwards)...`);
  state = createGame(ruleset, { seed: 2024, players: Array.from({ length: 8 }, () => ({ kind: 'ai' })), map: { size: 'large', type: 'continents' }, raiders: 'on', turnLimit: null });
  const ais = Object.fromEntries(state.factions.map((f) => [f.id, createAi(ruleset, f.id)]));
  while (state.turn < atTurn && !state.winner) state = playRound(state, ais).state;
  mkdirSync('.cache', { recursive: true });
  writeFileSync(cache, JSON.stringify(state));
}

// Fresh AIs (as after loading a save), then time full rounds.
const ais = Object.fromEntries(state.factions.map((f) => [f.id, createAi(ruleset, f.id)]));
const times = [];
for (let i = 0; i < rounds && !state.winner; i += 1) {
  const r = playRound(state, ais);
  state = r.state;
  times.push(r.ms);
}
const worst = Math.max(...times);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`perf: ${times.length} rounds from turn ${state.turn - times.length}: ${times.map((t) => Math.round(t)).join(', ')} ms (average ${Math.round(avg)}, worst ${Math.round(worst)}; target under ${ROUND_TARGET_MS})`);
console.log(`perf: cities ${Object.keys(state.cities).length}, units ${Object.keys(state.units).length}, fingerprint ${fingerprint(state)}`);
if (worst > ROUND_TARGET_MS) { console.error('perf: over target'); process.exit(1); }
