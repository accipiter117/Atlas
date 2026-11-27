// Unit commands: moveUnit, fortify, skip, sleep, wake, disband.
// Each has validate (returns a refusal or null) and apply (changes a working
// copy). Refusals carry a code the screen can word for the player.

import { findPath, stepMoves, canStop, passable } from './movement.js';
import { updateVisibility, UNEXPLORED, VISIBLE } from './visibility.js';
import { currentFactionId } from './queries.js';
import { maxMoves, slotOf, unitsAt, isEnemy, promotionSum } from './units.js';
import { sumHook } from './effects/index.js';
import { improvementProblem, builderTargets, placeImprovement } from './improvements.js';
import { assignCitizens } from './cities.js';
import { clearCampAt } from './raiders.js';
import { onEnter, afterMove } from './war.js';

const refuse = (code, message) => ({ code, message });

function ownUnit(state, cmd) {
  if (cmd.faction !== currentFactionId(state)) return [null, refuse('notYourTurn', `It is not ${cmd.faction}'s turn`)];
  const unit = state.units?.[cmd.unit];
  if (!unit) return [null, refuse('unknownUnit', `No unit "${cmd.unit}"`)];
  if (unit.faction !== cmd.faction) return [null, refuse('notYourUnit', `${cmd.unit} belongs to ${unit.faction}`)];
  return [unit, null];
}

function fogHelpers(state, factionId) {
  const fog = state.fog?.[factionId];
  return {
    known: fog ? (t) => fog[t] !== UNEXPLORED : null,
    seen: fog ? (t) => fog[t] === VISIBLE : null,
  };
}

/**
 * Walk a unit along its planned path as far as this turn allows, checking
 * the real world at each step (a hidden enemy, newly seen zone of control).
 * Updates fog after each step. Returns the tiles walked through.
 */
export function advanceUnit(state, ruleset, unit, target, events) {
  const plan = findPath(state, ruleset, unit, target, fogHelpers(state, unit.faction));
  if (!plan) {
    unit.goto = null;
    events.push({ type: 'unitBlocked', unit: unit.id, faction: unit.faction, target });
    return [];
  }
  const full = maxMoves(ruleset, unit, state);
  const walked = [unit.tile];
  let lastStop = { tile: unit.tile, moves: unit.moves };
  for (const next of plan.tiles) {
    const enemyThere = unitsAt(state, next).some((u) => isEnemy(state, unit.faction, u.faction))
      || Object.values(state.cities ?? {}).some((c) => c.tile === next && c.faction !== unit.faction);
    if (enemyThere || !passable(state, ruleset, unit.type, next)) break;
    const left = stepMoves(state, ruleset, unit, unit.tile, next, unit.moves, full);
    if (left === null) break;
    unit.tile = next;
    unit.moves = left;
    unit.acted = true;
    walked.push(next);
    clearCampAt(state, ruleset, unit, next, events);
    // K3: mines, wire and trenches (src/sim/war.js).
    const hit = state.map.works ? onEnter(state, ruleset, unit, next, events) : null;
    if (hit?.dead) { if (walked.length > 1) events.push({ type: 'unitMoved', unit: unit.id, faction: unit.faction, path: walked }); return walked; }
    if (hit?.stop) unit.moves = 0;
    if (canStop(state, ruleset, unit, next)) lastStop = { tile: next, moves: unit.moves };
    updateVisibility(state, ruleset, unit.faction);
    if (unit.moves <= 0) break;
  }
  // Never end on a tile shared with a unit of the same kind (passing through is fine).
  if (unit.tile !== lastStop.tile) {
    while (walked.length && walked.at(-1) !== lastStop.tile) walked.pop();
    unit.tile = lastStop.tile;
    unit.moves = lastStop.moves;
    updateVisibility(state, ruleset, unit.faction);
  }
  unit.goto = unit.tile === target ? null : target;
  if (walked.length > 1) events.push({ type: 'unitMoved', unit: unit.id, faction: unit.faction, path: walked });
  if (walked.length > 1 && state.map.works) afterMove(state, ruleset, unit, events);
  return walked;
}

export const moveUnit = {
  validate(state, cmd, ruleset) {
    const [unit, problem] = ownUnit(state, cmd);
    if (problem) return problem;
    if (!Number.isInteger(cmd.to)) return refuse('badTarget', 'A move needs a destination tile');
    if (unit.moves <= 0 && unit.goto === null && cmd.to === unit.tile) return refuse('noMoves', 'This unit has no moves left');
    if (!findPath(state, ruleset, unit, cmd.to, fogHelpers(state, cmd.faction))) return refuse('noPath', 'This unit cannot get there');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const unit = state.units[cmd.unit];
    unit.activity = 'none';
    unit.fortifiedTurns = 0;
    if (unit.moves > 0) advanceUnit(state, ruleset, unit, cmd.to, events);
    else unit.goto = cmd.to;
  },
};

function activity(name, check) {
  return {
    validate(state, cmd, ruleset) {
      const [unit, problem] = ownUnit(state, cmd);
      if (problem) return problem;
      return check ? check(state, ruleset, unit) : null;
    },
    apply(state, cmd) {
      const unit = state.units[cmd.unit];
      unit.goto = null;
      if (name === 'none') { unit.activity = 'none'; return; }
      if (name === 'fortify' && unit.activity !== 'fortify') unit.fortifiedTurns = 0;
      unit.activity = name;
    },
  };
}

export const fortify = activity('fortify', (state, ruleset, unit) => (slotOf(ruleset, unit.type) === 'civilian' ? refuse('cannotFortify', 'Civilians cannot fortify') : null));
export const skip = activity('skip');
export const sleep = activity('sleep');
export const wake = activity('none', (state, ruleset, unit) => (unit.activity === 'none' ? refuse('notAsleep', 'This unit is already awake') : null));

export const disband = {
  validate(state, cmd) {
    return ownUnit(state, cmd)[1];
  },
  apply(state, cmd, events, ruleset) {
    const unit = state.units[cmd.unit];
    delete state.units[cmd.unit];
    events.push({ type: 'unitDisbanded', unit: unit.id, faction: unit.faction, tile: unit.tile });
    updateVisibility(state, ruleset, unit.faction);
  },
};

/** Hit points a unit regains this turn if it rested: by where it stands, plus healBonus effects. */
export function healAmount(state, ruleset, unit) {
  const h = ruleset.tuning?.healing ?? { neutral: 10, friendly: 15, city: 20 };
  const owner = state.owner?.[unit.tile];
  const city = owner ? state.cities[owner] : null;
  let base = h.neutral;
  if (city?.faction === unit.faction) base = city.tile === unit.tile ? h.city : h.friendly;
  return base + sumHook('heal', state, ruleset, unit.faction, { unit }) + promotionSum(ruleset, unit, 'healBonus');
}

/** Start-of-turn work for a faction's units: heal those that rested, refresh moves, clear skips, count fortify turns, carry on walking. */
export function startUnitsTurn(state, ruleset, factionId, events) {
  for (const unit of Object.values(state.units ?? {})) {
    if (unit.faction !== factionId) continue;
    // K3: a unit cut off from supply (unit.cut) cannot heal.
    if (unit.hp < 100 && !unit.acted && !unit.cut) unit.hp = Math.min(100, unit.hp + healAmount(state, ruleset, unit));
    unit.acted = false;
    unit.moves = maxMoves(ruleset, unit, state);
    if (unit.activity === 'skip') unit.activity = 'none';
    if (unit.activity === 'fortify') unit.fortifiedTurns += 1;
  }
  for (const unit of Object.values(state.units ?? {})) {
    if (unit.faction === factionId && unit.goto !== null && state.units[unit.id]) advanceUnit(state, ruleset, unit, unit.goto, events);
  }
}

/** buildImprovement: a builder improves its own hex (or a neighbouring water hex for water improvements). */
export const buildImprovement = {
  validate(state, cmd, ruleset) {
    const [unit, problem] = ownUnit(state, cmd);
    if (problem) return problem;
    if (!(ruleset.units[unit.type]?.tags ?? []).includes('worker')) return refuse('notBuilder', 'Only builders can improve land');
    if (unit.moves <= 0) return refuse('noMoves', 'This unit has no moves left');
    const def = ruleset.improvements?.[cmd.improvement];
    if (!def) return refuse('unknownImprovement', `No improvement "${cmd.improvement}"`);
    const tile = cmd.tile ?? unit.tile;
    if (!builderTargets(state, ruleset, cmd.improvement, unit.tile).includes(tile)) return refuse('outOfReach', 'The builder must stand on the hex, or beside the water for boats');
    if ((def.charges ?? 1) > (unit.charges ?? 0)) return refuse('noCharges', 'This builder has no charges left');
    const why = improvementProblem(state, ruleset, cmd.faction, cmd.improvement, tile);
    return why ? refuse(why, `Cannot build ${cmd.improvement} there (${why})`) : null;
  },
  apply(state, cmd, events, ruleset) {
    const unit = state.units[cmd.unit];
    const tile = cmd.tile ?? unit.tile;
    // K3: works that take several turns: the engineer stays on the job (src/sim/war.js warTurn).
    const turns = ruleset.improvements[cmd.improvement].turns ?? 1;
    if (turns > 1) {
      unit.building = { improvement: cmd.improvement, tile, left: turns - 1 };
      unit.moves = 0;
      unit.acted = true;
      unit.activity = 'none';
      events.push({ type: 'improvementStarted', improvement: cmd.improvement, tile, unit: unit.id, faction: unit.faction, turns });
      return;
    }
    finishImprovement(state, ruleset, cmd.improvement, tile, unit, events);
  },
};

/** An engineer finishes a work: place it, spend the charge, and update who works the land. */
export function finishImprovement(state, ruleset, improvement, tile, unit, events) {
  {
    const cmd = { improvement };
    placeImprovement(state, ruleset, cmd.improvement, tile, unit.faction);
    unit.charges -= ruleset.improvements[cmd.improvement].charges ?? 1;
    unit.moves = 0;
    unit.acted = true;
    events.push({ type: 'improvementBuilt', improvement: cmd.improvement, tile, unit: unit.id, faction: unit.faction, charges: unit.charges });
    if (unit.charges <= 0 && (ruleset.improvements[cmd.improvement].charges ?? 1) > 0) {
      delete state.units[unit.id];
      events.push({ type: 'unitDisbanded', reason: 'charges', unit: unit.id, unitType: unit.type, faction: unit.faction, tile: unit.tile });
    }
    // Citizens may prefer the improved tile now.
    const owner = state.owner?.[tile];
    if (owner && state.cities[owner]) assignCitizens(state, ruleset, state.cities[owner]);
    updateVisibility(state, ruleset, unit.faction);
  }
}
