// Shared test helpers for the sim.

import { createGame, applyCommand, currentFactionId } from '../../src/sim/index.js';

export function fourPlayerSetup(seed = 918273645) {
  return {
    seed,
    players: [
      { kind: 'human', name: 'Tester' },
      { kind: 'ai', name: 'Rival 1' },
      { kind: 'ai', name: 'Rival 2' },
      { kind: 'ai', name: 'Rival 3' },
    ],
  };
}

/** Play n endTurn commands from a new game. Returns the final state and the command log. */
export function playEndTurns(n, seed) {
  let state = createGame({}, fourPlayerSetup(seed));
  const log = [];
  for (let i = 0; i < n; i += 1) {
    const cmd = { type: 'endTurn', faction: currentFactionId(state) };
    const result = applyCommand(state, cmd);
    if (!result.ok) throw new Error(result.error.message);
    log.push(cmd);
    state = result.state;
  }
  return { state, log };
}

/** Recursively find NaN or Infinity anywhere in a value (Northern Wars style). Returns the paths. */
export function findNonFinite(value, path = 'state', out = []) {
  if (typeof value === 'number' && !Number.isFinite(value)) out.push(path);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) findNonFinite(v, `${path}.${k}`, out);
  }
  return out;
}
