// Whole AI-only games (phase 10), for the developer page's mini-simulation and
// jump turns. The same seat runner as the real game, so results match the
// Node simulator (tools/sim.mjs) for the same seed and options.

import { createGame, turnLimit } from '../sim/index.js';
import { createSeatRunner } from './seats.js';

/**
 * Play an AI-only game until it is won, or until `untilTurn` (if given).
 * onRound(turn, ms) is called after each round. Returns { state, refusals, rounds }.
 */
export function selfPlay(ruleset, setup, { untilTurn = null, onRound = null, now = () => 0 } = {}) {
  let state = createGame(ruleset, setup);
  const ids = state.factions.map((f) => f.id);
  const runner = createSeatRunner(ruleset, ids);
  const stop = untilTurn ?? (turnLimit(state, ruleset) ?? 1000) + 1;
  const refusals = [];
  const rounds = [];
  while (!state.winner && state.turn < stop) {
    const t0 = now();
    const turn = state.turn;
    while (state.turn === turn && !state.winner) {
      const r = runner.play(state, { maxSeats: ids.length });
      state = r.state;
      refusals.push(...r.refusals);
    }
    const ms = now() - t0;
    rounds.push({ turn, ms });
    onRound?.(turn, ms);
  }
  return { state, refusals, rounds };
}
