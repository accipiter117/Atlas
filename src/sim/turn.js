// The endTurn command: closes the current faction's turn and, after the last
// seat, starts the next round (section 3.14).
//
// Start-of-turn work (yields, growth, production, healing) will hang off
// startFactionTurn as those systems arrive in later phases.

import { currentFactionId, getFaction } from './queries.js';
import { startUnitsTurn } from './unitCommands.js';
import { startCitiesTurn } from './cityCommands.js';

function startFactionTurn(state, factionId, events, ruleset) {
  events.push({ type: 'turnStarted', turn: state.turn, faction: factionId });
  // Section 3.14: cities first (yields, growth, production, borders), then units.
  if (state.cities) startCitiesTurn(state, ruleset, factionId, events);
  if (state.units) startUnitsTurn(state, ruleset, factionId, events);
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
  apply(state, cmd, events, ruleset) {
    events.push({ type: 'turnEnded', turn: state.turn, faction: cmd.faction });
    // Skip seats whose faction has been knocked out.
    let guard = state.seatOrder.length;
    do {
      state.seatIndex += 1;
      if (state.seatIndex >= state.seatOrder.length) startRound(state, events);
      guard -= 1;
    } while (!getFaction(state, currentFactionId(state)).alive && guard > 0);
    startFactionTurn(state, currentFactionId(state), events, ruleset);
  },
};
