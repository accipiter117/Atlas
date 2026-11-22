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

/** Every command the sim understands, by type. Each has validate (returns an error or null) and apply. */
export const COMMANDS = Object.freeze({
  endTurn,
});

function refuse(code, message) {
  return { ok: false, error: { code, message } };
}

/**
 * Apply one command to a state.
 *
 * @returns {{ok: true, state: object, events: object[]} | {ok: false, error: {code: string, message: string}}}
 */
export function applyCommand(state, cmd) {
  if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return refuse('badCommand', 'A command must be an object');
  if (typeof cmd.type !== 'string') return refuse('badCommand', 'A command needs a type');
  if (!Object.hasOwn(COMMANDS, cmd.type)) return refuse('unknownCommand', `Unknown command "${cmd.type}"`);

  const handler = COMMANDS[cmd.type];
  const problem = handler.validate(state, cmd);
  if (problem) return { ok: false, error: problem };

  const next = clone(state);
  const events = [];
  handler.apply(next, cmd, events);
  next.commandCount += 1;
  return { ok: true, state: next, events };
}
