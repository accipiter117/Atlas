// Creating a new game state.
//
// State is plain JSON data: no classes, no functions, no references between
// objects. That keeps it easy to save, copy, hash and send over the network
// later (online play replays the same commands on every device).

import { normaliseSeed, fork } from '../core/rng.js';
import { hashValue } from '../core/hash.js';
import { clone, deepFreeze } from '../core/clone.js';
import { generateMap } from './mapgen.js';
import { placeStartingUnits } from './units.js';
import { updateAllVisibility } from './visibility.js';

export const STATE_VERSION = 1;
export const ENGINE_VERSION = '0.1.0';

export class SetupError extends Error {}

function checkSetup(setup) {
  if (!setup || typeof setup !== 'object') throw new SetupError('Setup must be an object');
  if (!Number.isInteger(setup.seed)) throw new SetupError('Setup needs an integer seed');
  const players = setup.players;
  if (!Array.isArray(players) || players.length < 1) throw new SetupError('Setup needs at least one player');
  players.forEach((p, i) => {
    if (!p || (p.kind !== 'human' && p.kind !== 'ai')) {
      throw new SetupError(`Player ${i} needs kind "human" or "ai"`);
    }
  });
}

/**
 * Start a new game.
 *
 * @param {object} ruleset  the merged, frozen ruleset (an empty object is fine until phase 2)
 * @param {object} setup    match options (section 6); needs seed and players at minimum
 * @returns {object} the starting state, ready for the first seat to act
 */
export function createGame(ruleset, setup) {
  checkSetup(setup);
  const frozenSetup = deepFreeze(clone(setup));

  const factions = setup.players.map((p, i) => ({
    id: `f${i}`,
    name: typeof p.name === 'string' ? p.name : `Player ${i + 1}`,
    kind: p.kind,
    alive: true,
  }));

  const state = {
    stateVersion: STATE_VERSION,
    engineVersion: ENGINE_VERSION,
    setup: frozenSetup,
    rulesetHash: hashValue(ruleset ?? {}),
    turn: 1,
    rng: normaliseSeed(setup.seed),
    nextId: 1,
    factions,
    seatOrder: [],
    seatIndex: 0,
    commandCount: 0,
  };

  // Seat order is random per game, from the seed, then fixed (section 3.14).
  // A named fork keeps the main dice stream untouched.
  state.seatOrder = fork(state, 'seats').shuffle(factions.map((f) => f.id));

  // The world, when the setup asks for one and the ruleset can build it.
  if (setup.map && ruleset?.mapSizes) {
    state.map = generateMap(ruleset, { ...setup.map, seed: setup.seed, factions: factions.length });
    state.map.road = new Array(state.map.width * state.map.height).fill(0);
    state.units = {};
    placeStartingUnits(state, ruleset);
    updateAllVisibility(state, ruleset);
  }
  return state;
}
