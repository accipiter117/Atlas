// The sim's public front door. Everything outside src/sim (UI, AI, saves,
// tools) imports from here and nowhere else inside src/sim, so the rules can
// be reorganised freely without breaking the rest of the game.

import { hashValue } from '../core/hash.js';

export { createGame, ENGINE_VERSION, STATE_VERSION, SetupError } from './state.js';
export { applyCommand, COMMANDS } from './commands.js';
export { currentFactionId, getFaction, livingSeats } from './queries.js';
export { generateMap, MapgenError, resourceAllowed, tileFood } from './mapgen.js';
export { tileIndex, tileHex, neighbourTiles } from './map.js';
export { view } from './view.js';
export { findPath, enterCost } from './movement.js';
export { idleUnits, slotOf, unitsAt } from './units.js';
export { UNEXPLORED, EXPLORED, VISIBLE } from './visibility.js';

/**
 * A short hash of the whole state. Two games with the same fingerprint are
 * identical; replay tests and online play compare these after every turn.
 */
export function fingerprint(state) {
  return hashValue(state);
}
