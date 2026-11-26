// The simulator's engine room (tools/sim.mjs and tools/sim-worker.mjs):
// play one AI-only game headless and describe how it went.

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadReal } from '../test/data/helpers.js';
import { createGame, turnLimit } from '../src/sim/index.js';
import { createSeatRunner } from '../src/ai/index.js';
import { clone, deepFreeze } from '../src/core/clone.js';

const rulesCache = new Map();
export async function rulesFor(mods) {
  const key = mods.join(',');
  if (!rulesCache.has(key)) {
    const r = await loadReal(mods);
    if (!r.ok) throw new Error(`mods ${key} do not load`);
    rulesCache.set(key, r);
  }
  return rulesCache.get(key);
}

/** An AI version: null (the champion as committed) or a patch file { id, aiWeights: { <id>: { weights: {...} } }, aiPersonalities? }. */
export function readVersion(file) {
  if (!file || file === 'current') return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The ruleset an AI of this version thinks with (the game's rules are never patched). */
export function aiRulesFor(ruleset, patch) {
  if (!patch) return ruleset;
  const r = clone(ruleset);
  for (const kind of ['aiWeights', 'aiPersonalities']) {
    for (const [id, entry] of Object.entries(patch[kind] ?? {})) {
      r[kind][id] = { ...r[kind][id], ...entry, weights: { ...(r[kind][id]?.weights ?? {}), ...(entry.weights ?? {}) } };
    }
  }
  return deepFreeze(r);
}

/**
 * Play one game. seats: optional { seatIndex: 'challenger' | 'champion' } (by player index).
 * Returns a plain summary (no state), the same on every run for the same inputs.
 */
export async function playGame({ seed, mods = ['base-ancient'], size = 'small', type = 'continents', speed = 'quick', players = 4, turnLimit: limit, seats = null, challenger = null, champion = null }) {
  const { ruleset } = await rulesFor(mods);
  const setup = { seed, players: Array.from({ length: players }, () => ({ kind: 'ai' })), map: { size, type }, speed, raiders: 'on' };
  if (limit !== undefined) setup.turnLimit = limit;
  let state = createGame(ruleset, setup);
  const version = (i) => (seats?.[i] ?? 'champion');
  const rules = { challenger: aiRulesFor(ruleset, challenger), champion: aiRulesFor(ruleset, champion) };
  const ids = state.factions.map((f) => f.id);
  const runner = createSeatRunner(ruleset, ids, { aiRules: Object.fromEntries(ids.map((id, i) => [id, rules[version(i)]])) });
  const limitTurn = turnLimit(state, ruleset) ?? 1000;
  const refusals = [];
  let worstRound = 0;
  let error = null;
  try {
    while (!state.winner && state.turn <= limitTurn + 1) {
      const t0 = performance.now();
      const turn = state.turn;
      while (state.turn === turn && !state.winner) {
        const r = runner.play(state, { maxSeats: ids.length });
        state = r.state;
        refusals.push(...r.refusals);
      }
      worstRound = Math.max(worstRound, performance.now() - t0);
    }
  } catch (e) {
    error = String(e?.stack ?? e);
  }
  const nan = [];
  for (const f of state.factions) for (const [k, v] of Object.entries(f.stocks ?? {})) if (!Number.isFinite(v)) nan.push(`${f.id}.${k}`);
  for (const c of Object.values(state.cities ?? {})) if (!Number.isFinite(c.pop)) nan.push(`${c.id}.pop`);
  const winnerIndex = state.winner ? ids.indexOf(state.winner.faction) : -1;
  return {
    seed,
    civs: state.factions.map((f) => f.civ),
    versions: ids.map((_, i) => version(i)),
    winner: state.winner ? { seat: winnerIndex, civ: state.factions[winnerIndex].civ, victory: state.winner.victory, turn: state.winner.turn, version: version(winnerIndex) } : null,
    stalled: !state.winner,
    turns: state.turn,
    refusals: refusals.length,
    refusalSamples: refusals.slice(0, 3),
    nan,
    error,
    worstRoundMs: Math.round(worstRound),
  };
}

/** Section 9.7 report lines from a list of game summaries. */
export function report(games, { victories = ['conquest', 'science', 'score'] } = {}) {
  const decided = games.filter((g) => g.winner);
  const byCiv = {};
  for (const g of games) for (const c of g.civs) { byCiv[c] ??= { games: 0, wins: 0 }; byCiv[c].games += 1; }
  for (const g of decided) byCiv[g.winner.civ].wins += 1;
  const byVictory = Object.fromEntries(victories.map((v) => [v, 0]));
  for (const g of decided) byVictory[g.winner.victory] = (byVictory[g.winner.victory] ?? 0) + 1;
  const avgTurn = decided.length ? decided.reduce((n, g) => n + g.winner.turn, 0) / decided.length : null;
  const versions = {};
  for (const g of games) for (const v of new Set(g.versions)) { versions[v] ??= { games: 0, wins: 0 }; versions[v].games += 1; }
  for (const g of decided) versions[g.winner.version].wins += 1;
  return {
    games: games.length,
    decided: decided.length,
    stalled: games.length - decided.length,
    winRateByCiv: Object.fromEntries(Object.entries(byCiv).sort().map(([c, x]) => [c, { ...x, rate: x.wins / x.games }])),
    winsByVictory: byVictory,
    averageVictoryTurn: avgTurn === null ? null : Math.round(avgTurn),
    errors: { refusals: games.reduce((n, g) => n + g.refusals, 0), nan: games.reduce((n, g) => n + g.nan.length, 0), crashes: games.filter((g) => g.error).length },
    worstRoundMs: Math.max(0, ...games.map((g) => g.worstRoundMs)),
    versions,
  };
}

/** Which healthy ranges (section 9.7) a report breaks. Win rate by faction is judged only from 40 games up. */
export function healthProblems(r, { speed = 'quick', size = 'small' } = {}) {
  const out = [];
  const civs = Object.entries(r.winRateByCiv);
  const avg = civs.reduce((n, [, x]) => n + x.rate, 0) / Math.max(1, civs.length);
  if (r.games >= 40) {
    for (const [c, x] of civs) {
      if (x.rate > 2 * avg) out.push(`${c} wins ${pct(x.rate)}, over twice the average ${pct(avg)}`);
      if (x.wins === 0 && x.games >= 10) out.push(`${c} never won in ${x.games} games`);
    }
  }
  for (const [v, n] of Object.entries(r.winsByVictory)) if (n / Math.max(1, r.games) < 0.05) out.push(`${v} victories ${pct(n / Math.max(1, r.games))}, under 5%`);
  if (speed === 'quick' && size === 'small' && r.averageVictoryTurn !== null && (r.averageVictoryTurn < 150 || r.averageVictoryTurn > 260)) out.push(`average victory turn ${r.averageVictoryTurn}, outside 150 to 260`);
  if (r.stalled / Math.max(1, r.games) >= 0.2) out.push(`${r.stalled} stalled games, 20% or more`);
  if (r.errors.refusals || r.errors.nan || r.errors.crashes) out.push(`errors: ${r.errors.refusals} refused commands, ${r.errors.nan} NaN, ${r.errors.crashes} crashes`);
  return out;
}

export const pct = (x) => `${Math.round(x * 100)}%`;
