// The endTurn command: closes the current faction's turn and, after the last
// seat, starts the next round (section 3.14).
//
// Start-of-turn work (yields, growth, production, healing) will hang off
// startFactionTurn as those systems arrive in later phases.

import { currentFactionId, getFaction } from './queries.js';

function startFactionTurn(state, factionId, events) {
  events.push({ type: 'turnStarted', turn: state.turn, faction: factionId });
}

function startRound(state, events) {
  state.turn += 1;
  state.seatIndex = 0;
  events.push({ type: 'roundStarted', turn: state.turn });
}

export const endTurn = {
  validate(state, cmd) {
    if (!getFaction(state, cmd.faction)) return { code: 'unknownFaction', message: `No faction "${cmd.faction}"` };
    if (cmd.faction !== currentFactionId(state)) {
      return { code: 'notYourTurn', message: `It is ${currentFactionId(state)}'s turn, not ${cmd.faction}'s` };
    }
    return null;
  },
  apply(state, cmd, events) {
    events.push({ type: 'turnEnded', turn: state.turn, faction: cmd.faction });
    // Skip seats whose faction has been knocked out.
    let guard = state.seatOrder.length;
    do {
      state.seatIndex += 1;
      if (state.seatIndex >= state.seatOrder.length) startRound(state, events);
      guard -= 1;
    } while (!getFaction(state, currentFactionId(state)).alive && guard > 0);
    startFactionTurn(state, currentFactionId(state), events);
  },
};
