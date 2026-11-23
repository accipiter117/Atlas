// Unit commands: moveUnit, fortify, skip, sleep, wake, disband.
// Each has validate (returns a refusal or null) and apply (changes a working
// copy). Refusals carry a code the screen can word for the player.

import { findPath, stepMoves, canStop, passable } from './movement.js';
import { updateVisibility, UNEXPLORED, VISIBLE } from './visibility.js';
import { currentFactionId } from './queries.js';
import { maxMoves, slotOf, unitsAt, isEnemy } from './units.js';

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
  const full = maxMoves(ruleset, unit);
  const walked = [unit.tile];
  let lastStop = { tile: unit.tile, moves: unit.moves };
  for (const next of plan.tiles) {
    const enemyThere = unitsAt(state, next).some((u) => isEnemy(state, unit.faction, u.faction));
    if (enemyThere || !passable(state, ruleset, unit.type, next)) break;
    const left = stepMoves(state, ruleset, unit, unit.tile, next, unit.moves, full);
    if (left === null) break;
    unit.tile = next;
    unit.moves = left;
    walked.push(next);
    if (canStop(state, ruleset, unit, next)) lastStop = { tile: next, moves: left };
    updateVisibility(state, ruleset, unit.faction);
    if (left <= 0) break;
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

/** Start-of-turn work for a faction's units: refresh moves, clear skips, count fortify turns, carry on walking. */
export function startUnitsTurn(state, ruleset, factionId, events) {
  for (const unit of Object.values(state.units ?? {})) {
    if (unit.faction !== factionId) continue;
    unit.moves = maxMoves(ruleset, unit);
    if (unit.activity === 'skip') unit.activity = 'none';
    if (unit.activity === 'fortify') unit.fortifiedTurns += 1;
  }
  for (const unit of Object.values(state.units ?? {})) {
    if (unit.faction === factionId && unit.goto !== null && state.units[unit.id]) advanceUnit(state, ruleset, unit, unit.goto, events);
  }
}
