// The simulator's engine room (tools/sim.mjs and tools/sim-worker.mjs):
// play one AI-only game headless and describe how it went.

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadReal } from '../test/data/helpers.js';
import { createGame, turnLimit, sideOf } from '../src/sim/index.js';
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
export async function playGame({ seed, mods = ['base-ancient'], size = 'small', type = 'continents', speed = 'quick', players = 4, turnLimit: limit, seats = null, challenger = null, champion = null, war = null }) {
  const { ruleset } = await rulesFor(mods);
  // A side war (Killzone Extrasolar War, K5): every faction with a side, on the war's map preset.
  const warCivs = war ? Object.keys(ruleset.factions).filter((c) => ruleset.factions[c].frontSide !== undefined) : null;
  const setup = war
    ? { seed, players: warCivs.map((c) => ({ kind: 'ai', faction: c })), map: { preset: war.preset }, speed, ...(war.scenario ? { scenario: war.scenario } : {}) }
    : { seed, players: Array.from({ length: players }, () => ({ kind: 'ai' })), map: { size, type }, speed, raiders: 'on', events: 'occasional' };
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
  let homeInvaded = false;
  let landings = 0;
  try {
    while (!state.winner && state.turn <= limitTurn + 1) {
      const t0 = performance.now();
      const turn = state.turn;
      while (state.turn === turn && !state.winner) {
        const r = runner.play(state, { maxSeats: ids.length });
        state = r.state;
        refusals.push(...r.refusals);
        for (const e of war ? r.events : []) {
          if (e.type !== 'armyLanded') continue;
          landings += 1;
          const home = ruleset.worlds?.[e.world]?.homeOf;
          if (home !== undefined && home !== sideOf(state, ruleset, e.faction)) homeInvaded = true;
        }
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
    ...(war ? { war: warSummary(state, ruleset, ids, version, { homeInvaded, landings }) } : {}),
  };
}

/** How a side war went: the winning side, whether a home world was invaded, who topped glory. */
function warSummary(state, ruleset, ids, version, extra) {
  const top = Object.entries(state.glory ?? {}).sort((a, b) => b[1] - a[1] || ids.indexOf(a[0]) - ids.indexOf(b[0]))[0]?.[0];
  const winSide = state.winner ? sideOf(state, ruleset, state.winner.faction) : null;
  // The AI version that played the winning side (sides are all one version in a war comparison).
  const sideVersion = winSide === null ? null : version(ids.findIndex((id) => sideOf(state, ruleset, id) === winSide));
  // A dead heat: the time ran out with support and worlds level (settled by seat order).
  const held = (s) => Object.values(state.holders ?? {}).filter((h) => h === s).length;
  const margin = Object.values(ruleset.victories ?? {}).find((v) => v.params?.kind === 'time')?.params?.margin ?? 1;
  const deadHeat = state.winner?.victory === 'war_time' && Math.abs(state.warSupport[0] - state.warSupport[1]) < margin && held(0) === held(1);
  return { winSide, sideVersion, deadHeat, topGlory: state.factions.find((f) => f.id === top)?.civ ?? null, support: { ...state.warSupport }, ...extra };
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
    ...(games.some((g) => g.war) ? { war: warReport(games) } : {}),
  };
}

/** Section 7.1 of docs/KILLZONE.md: sides, length, home invasions and glory. */
function warReport(games) {
  const sides = { 0: 0, 1: 0 };
  const glory = {};
  for (const c of games[0]?.civs ?? []) glory[c] = 0;
  for (const g of games) {
    if (g.war.winSide !== null && !g.war.deadHeat) sides[g.war.winSide] += 1;
    if (g.war.topGlory) glory[g.war.topGlory] = (glory[g.war.topGlory] ?? 0) + 1;
  }
  return {
    sides, topGlory: glory, deadHeats: games.filter((g) => g.war.deadHeat).length,
    homeInvaded: games.filter((g) => g.war.homeInvaded).length,
    averageLength: Math.round(games.reduce((n, g) => n + (g.winner?.turn ?? g.turns), 0) / Math.max(1, games.length)),
    landings: Math.round(games.reduce((n, g) => n + g.war.landings, 0) / Math.max(1, games.length)),
  };
}

/**
 * Which section 7.1 targets a war report misses. These need about 100 games to measure well,
 * more than CLAUDE.md allows without asking; a smaller batch is a direction, not a verdict.
 */
export function warProblems(r) {
  const out = [];
  const w = r.war;
  // Dead heats (settled by seat order) are left out of the side balance, like stalled games.
  const decided = w.sides[0] + w.sides[1];
  if (w.deadHeats / Math.max(1, r.games) >= 0.2) out.push(`${w.deadHeats} dead heats, 20% or more`);
  for (const s of [0, 1]) {
    const rate = w.sides[s] / Math.max(1, decided);
    if (decided && (rate < 0.45 || rate > 0.55)) out.push(`side ${s} wins ${pct(rate)} of decided games, outside 45 to 55%`);
  }
  for (const [v, n] of Object.entries(r.winsByVictory)) if (n / Math.max(1, r.games) < 0.1) out.push(`${v} ${pct(n / Math.max(1, r.games))}, under 10%`);
  if (w.averageLength < 90 || w.averageLength > 140) out.push(`average length ${w.averageLength} turns, outside 90 to 140`);
  const inv = w.homeInvaded / Math.max(1, r.games);
  if (inv < 0.3 || inv > 0.6) out.push(`a home world invaded in ${pct(inv)} of games, outside 30 to 60%`);
  for (const [c, n] of Object.entries(w.topGlory)) if (n / Math.max(1, r.games) < 0.08) out.push(`${c} tops glory in ${pct(n / Math.max(1, r.games))}, under 8%`);
  return out;
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
