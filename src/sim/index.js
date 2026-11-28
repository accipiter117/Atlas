// The sim's public front door. Everything outside src/sim (UI, AI, saves,
// tools) imports from here and nowhere else inside src/sim, so the rules can
// be reorganised freely without breaking the rest of the game.

import { hashValue } from '../core/hash.js';

export { createGame, ENGINE_VERSION, STATE_VERSION, SetupError } from './state.js';
export { applyCommand, COMMANDS } from './commands.js';
export { currentFactionId, getFaction, livingSeats } from './queries.js';
export { generateMap, MapgenError, resourceAllowed, tileFood } from './mapgen.js';
export { tileIndex, tileHex, neighbourTiles, neighbourCache } from './map.js';
export { view, worldFromView } from './view.js';
export { cityYields, tileYields, factionEffects } from './yields.js';
export { foodToGrow } from './growth.js';
export { buildOptions, foundingProblem, workable, itemCost, citiesOf, specialistSlots, hasResource } from './cities.js';
export { adjacencyBonus, buildingProblem } from './buildings.js';
export { improvementProblem, builderTargets } from './improvements.js';
export { amenitiesFor, luxuriesOf } from './amenities.js';
export { upkeepOf } from './economy.js';
export { effectsFor, HANDLERS, buildingDef } from './effects/index.js';
export { borderCost, claimable, tilePrice } from './borders.js';
export { buyPrice } from './cityCommands.js';
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
export { buildSpec, buildCitySpec, attackProblem, cityStrength, cityHasWalls, cityMaxHp, combatKind, rangeOf, promotionsAvailable, defenderAt } from './combat.js';
export { promotionOptions } from './combatCommands.js';
export { cityHpMax } from './cities.js';
export { costOf, available, pathTo, eraOf, knows, researchOf } from './progression.js';
export { atWar, statusOf, opinionOf, evaluateDeal, wouldAccept, dealProblem, pairKey, hasMet, treatyOf, teammates, teamOf, wearinessAmenities, DEAL_ITEMS } from './diplomacy.js';
export { slotsOf, governmentOf, workingGovernment, policyAvailable, governmentAvailable, policyProblem, SLOT_KINDS } from './government.js';
export { scoreOf, scoreParts } from './score.js';
export { influencePerTurn } from './culture.js';
export { previewRoute, routeYields, routeProblem, routesFrom, cityTradeYields } from './trade.js';
export { spyCap, spyCount, missionOdds, outcomeChances, cityDefence } from './espionage.js';
export { majorityOf, religionLimit, foundedBy, pantheonOf, takenBeliefs, followerCities, faithPrice, holyCityOptions, preachTarget, missionaryFaith, pantheonFaith, foundFaith } from './religion.js';
export { activeVictories, victoryProgress, turnLimit, VICTORY_MODULES } from './victories/index.js';
export { damage, strengths } from '../battles/index.js';
export { frontlineOn, sideOf, frontShares, buildPresetMap } from './frontline.js';
// Killzone Extrasolar War: several worlds (K1) and the star map (K2).
export { spaceOn, spaceOdds, holdsOrbit, laneBetween, lanesFrom, orderZones } from './space.js';
export { distance as tileDistance } from './borders.js';
export { armsPrice, STANCES } from './sides.js';
