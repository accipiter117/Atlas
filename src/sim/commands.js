// applyCommand: the only way anything changes in a game.
//
// The player's clicks and the AI's choices both become command objects, such
// as { type: 'endTurn', faction: 'f0' }. Because every change goes through
// here, a game can be rebuilt exactly from its seed and its list of commands,
// which is what saves, replays and online play rely on.
//
// A refused command never changes anything: the input state is not touched,
// and the caller gets { ok: false, error } with a reason to show the player.

import { clone } from '../core/clone.js';
import { endTurn } from './turn.js';
import { moveUnit, fortify, skip, sleep, wake, disband, buildImprovement } from './unitCommands.js';
import { attack, cityAttack, resolveBattle, autoResolveBattle, captureChoice, promote } from './combatCommands.js';
import { foundCity, setProduction, queueProduction, buyItem, setFocus, lockTile, unlockTile, buyTile } from './cityCommands.js';

/** Every command the sim understands, by type. Each has validate (returns an error or null) and apply. */
export const COMMANDS = Object.freeze({
  endTurn,
  moveUnit,
  fortify,
  skip,
  sleep,
  wake,
  disband,
  buildImprovement,
  foundCity,
  setProduction,
  queueProduction,
  buyItem,
  setFocus,
  lockTile,
  unlockTile,
  buyTile,
  attack,
  cityAttack,
  resolveBattle,
  autoResolveBattle,
  captureChoice,
  promote,
});

const EMPTY = Object.freeze({});

function refuse(code, message) {
  return { ok: false, error: { code, message } };
}

/**
 * Apply one command to a state. The ruleset is the merged, frozen ruleset the
 * game was created with (state.rulesetHash records which one); games with no
 * map can leave it out.
 *
 * @returns {{ok: true, state: object, events: object[]} | {ok: false, error: {code: string, message: string}}}
 */
export function applyCommand(state, cmd, ruleset = EMPTY) {
  if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return refuse('badCommand', 'A command must be an object');
  if (typeof cmd.type !== 'string') return refuse('badCommand', 'A command needs a type');
  if (!Object.hasOwn(COMMANDS, cmd.type)) return refuse('unknownCommand', `Unknown command "${cmd.type}"`);

  // While a battle waits for its screen, only its result may be sent; while a
  // captured city waits for Keep or Raze, its new owner must choose first.
  if (state.pendingBattle && cmd.type !== 'resolveBattle' && cmd.type !== 'autoResolveBattle') return refuse('battlePending', 'Finish the battle first');
  if (state.pendingCapture && cmd.type !== 'captureChoice' && state.pendingCapture.faction === cmd.faction) return refuse('capturePending', 'Choose whether to keep or raze the captured city first');

  const handler = COMMANDS[cmd.type];
  const problem = handler.validate(state, cmd, ruleset);
  if (problem) return { ok: false, error: problem };

  const next = clone(state);
  const events = [];
  handler.apply(next, cmd, events, ruleset);
  next.commandCount += 1;
  return { ok: true, state: next, events };
}
