// Runs AI-only games headless for tests (the full simulator comes in phase 10).

import { createGame, applyCommand, view, currentFactionId } from '../../src/sim/index.js';
import { createAi, runAiTurn } from '../../src/ai/index.js';

export function aiGame(ruleset, { seed, players = 4, size = 'small', type = 'continents', turns = 100, raiders = 'on', speed = 'standard', onTurn = null }) {
  const setup = { seed, players: Array.from({ length: players }, () => ({ kind: 'ai' })), map: { size, type }, raiders, speed };
  let state = createGame(ruleset, setup);
  const ais = Object.fromEntries(state.factions.map((f) => [f.id, createAi(ruleset, f.id)]));
  const times = [];
  const log = [];
  while (state.turn <= turns) {
    const me = currentFactionId(state);
    const t0 = performance.now();
    const r = runAiTurn(ais[me], () => view(state, me, ruleset), (cmd) => {
      const res = applyCommand(state, cmd, ruleset);
      if (res.ok) { state = res.state; log.push(cmd); }
      return res;
    });
    if (r.stuck || currentFactionId(state) === me) {
      const res = applyCommand(state, { type: 'endTurn', faction: me }, ruleset);
      if (res.ok) { state = res.state; log.push({ type: 'endTurn', faction: me }); }
    }
    times.push({ turn: state.turn, faction: me, ms: performance.now() - t0 });
    if (onTurn) onTurn(state);
  }
  const refusals = Object.values(ais).flatMap((a) => a.refusals);
  return { state, ais, refusals, times, log, setup };
}
