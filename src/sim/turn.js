// The endTurn command: closes the current faction's turn and, after the last
// seat, starts the next round (section 3.14).
//
// Start-of-turn work (yields, growth, production, healing) will hang off
// startFactionTurn as those systems arrive in later phases.

import { currentFactionId, getFaction } from './queries.js';
import { startUnitsTurn } from './unitCommands.js';
import { startCitiesTurn } from './cityCommands.js';
import { runRaiders } from './raiders.js';
import { frontlineRound } from './frontline.js';
import { runBattle } from './combatCommands.js';
import { updateAllVisibility } from './visibility.js';
import { checkVictory } from './victories/index.js';
import { startGovernmentTurn } from './government.js';
import { startDiplomacyTurn, diplomacyRound } from './diplomacy.js';
import { religionRound } from './religion.js';
import { startTradeTurn } from './trade.js';
import { startEspionageTurn } from './espionage.js';
import { startCultureTurn } from './culture.js';
import { startEventsTurn } from './events.js';
import { addModifier } from './diplomacy.js';
import { eliminate } from './elimination.js';
import { forEachWorld, wholeGame } from './worlds.js';
import { startSpaceTurn, spaceRound } from './space.js';
import { supplyOn, supplyTurn, warTurn, captureRound } from './war.js';
import { finishImprovement } from './unitCommands.js';

/** Does this ruleset use any of the K3 war rules (supply, war infrastructure, theatre rules)? */
const WAR = new WeakMap();
function warRules(ruleset) {
  if (!ruleset || typeof ruleset !== 'object') return false;
  if (!WAR.has(ruleset)) WAR.set(ruleset, supplyOn(ruleset) || Object.values(ruleset.improvements ?? {}).some((d) => d.war || (d.turns ?? 1) > 1) || Object.values(ruleset.worlds ?? {}).some((w) => w.theatre));
  return WAR.get(ruleset);
}

function startFactionTurn(state, factionId, events, ruleset) {
  events.push({ type: 'turnStarted', turn: state.turn, faction: factionId });
  // Pending government and card changes become active first, so this turn's yields use them.
  if (ruleset?.governments) startGovernmentTurn(state, ruleset, factionId, events);
  // Diplomacy timers (section 3.14): weariness, gold per turn, lapsed offers.
  if (ruleset?.diplomacy) startDiplomacyTurn(state, ruleset, factionId, events);
  if (ruleset?.trade) startTradeTurn(state, ruleset, factionId, events);
  if (ruleset?.espionage) startEspionageTurn(state, ruleset, factionId, events, addModifier);
  if (ruleset?.victories?.culture) startCultureTurn(state, ruleset, factionId);
  if (ruleset?.events && state.cities) startEventsTurn(state, ruleset, factionId, events);
  // Section 3.14: cities first (yields, growth, production, borders), then units.
  // With several worlds (K1a), each world's cities and units take their turn in order.
  if (state.space) startSpaceTurn(state, ruleset, factionId);
  const war = warRules(ruleset);
  forEachWorld(state, () => {
    if (state.cities) startCitiesTurn(state, ruleset, factionId, events);
    // K3: supply first (the cut off do not heal), then units, then the war's own work.
    if (war && state.units && supplyOn(ruleset)) supplyTurn(state, ruleset, factionId, events);
    if (state.units) startUnitsTurn(state, ruleset, factionId, events);
    if (war && state.units) warTurn(state, ruleset, factionId, events, finishImprovement);
  });
}

function startRound(state, events, ruleset) {
  // End of the round (section 3.14): raiders move and fight.
  if (state.map && ruleset?.tuning) {
    // Raiders, sight and the front happen on every world; diplomacy and religion once.
    // A one-world game runs these in exactly the order it always has.
    // K2: fleets on long jumps come closer, and arrive.
    if (state.space) spaceRound(state, ruleset, events);
    forEachWorld(state, () => {
      runRaiders(state, ruleset, events, runBattle);
      updateAllVisibility(state, ruleset);
    });
    diplomacyRound(state, ruleset, events);
    religionRound(state, ruleset, events);
    // Phase 19: armies push the front (only in front-line games).
    forEachWorld(state, () => {
      if (state.frontline) frontlineRound(state, ruleset, events);
      // K3: whoever holds every key site with no enemy left holds the world.
      if (state.worlds) captureRound(state, ruleset, events);
    });
    eliminate(state, ruleset, events);
    // Victory judges factions across every world (read only; the winner is written here).
    const whole = wholeGame(state);
    checkVictory(whole, ruleset, events);
    if (whole !== state && whole.winner) state.winner = whole.winner;
  }
  if (state.winner) return;
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
    if (state.events?.pending?.[cmd.faction]) return { code: 'eventPending', message: 'Choose what to do about the event first' };
    return null;
  },
  apply(state, cmd, events, ruleset) {
    events.push({ type: 'turnEnded', turn: state.turn, faction: cmd.faction });
    // Skip seats whose faction has been knocked out.
    let guard = state.seatOrder.length;
    do {
      state.seatIndex += 1;
      if (state.seatIndex >= state.seatOrder.length) startRound(state, events, ruleset);
      if (state.winner) return;
      guard -= 1;
    } while (!getFaction(state, currentFactionId(state)).alive && guard > 0);
    startFactionTurn(state, currentFactionId(state), events, ruleset);
  },
};
