// The AI's front door. Each computer faction gets an AI (createAi) that sees
// only view(state, faction) and answers with ordinary commands, one at a
// time. runAiTurn drives one faction's whole turn: it asks for the next
// command with a fresh view after every move, sends it through the caller's
// applyCommand, and stops at endTurn. The AI module never touches the state.

import { createAi } from './controller.js';

export { createAi };

/**
 * Play one computer faction's turn.
 * @param ai         from createAi
 * @param getView    () => the faction's current view
 * @param apply      (cmd) => applyCommand result
 * @returns {{ commands: number, events: object[] }}
 */
export function runAiTurn(ai, getView, apply, maxCommands = 600) {
  const events = [];
  for (let n = 0; n < maxCommands; n += 1) {
    const cmd = ai.next(getView());
    const r = apply(cmd);
    if (!r.ok) {
      ai.refused(cmd, r.error);
      if (cmd.type === 'endTurn') break;
      continue;
    }
    events.push(...r.events);
    if (cmd.type === 'endTurn') return { commands: n + 1, events };
  }
  // Safety net: should never be needed; the caller ends the turn.
  return { commands: maxCommands, events, stuck: true };
}

export { createSeatRunner, portableMemory } from './seats.js';

/** Research the AI would choose in your place, for the advice line. */
export { rankTechs } from './planners/science.js';
