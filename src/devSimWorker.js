// The developer page's worker (phase 10): plays AI-only games off the page so
// it stays responsive. Two jobs:
//   { type: 'mini', ruleset, games, seed0, setup }  -> one 'game' message per game, then 'done'
//   { type: 'jump', ruleset, setup, turns }         -> 'progress' messages, then 'jumped' with round times

import { selfPlay } from './ai/index.js';

const now = () => self.performance.now();

self.onmessage = (e) => {
  const job = e.data;
  try {
    if (job.type === 'mini') {
      for (let i = 0; i < job.games; i += 1) {
        const seed = job.seed0 + i;
        const r = selfPlay(job.ruleset, { ...job.setup, seed }, { now });
        const w = r.state.winner;
        const civ = w ? r.state.factions.find((f) => f.id === w.faction).civ : null;
        self.postMessage({ type: 'game', seed, civ, victory: w?.victory ?? null, turn: w?.turn ?? r.state.turn, refusals: r.refusals.length, civs: r.state.factions.map((f) => f.civ) });
      }
      self.postMessage({ type: 'done' });
    } else if (job.type === 'jump') {
      const r = selfPlay(job.ruleset, job.setup, {
        now,
        untilTurn: job.turns,
        onRound: (turn) => { if (turn % 10 === 0) self.postMessage({ type: 'progress', turn }); },
      });
      self.postMessage({ type: 'jumped', turn: r.state.turn, rounds: r.rounds.slice(-10), refusals: r.refusals.length, cities: Object.keys(r.state.cities).length, units: Object.keys(r.state.units).length, winner: r.state.winner ?? null });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.stack ?? err) });
  }
};
