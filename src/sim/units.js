// Units: creating them, placing starting units, and the questions the rest
// of the rules ask about them (section 3.5).
//
// A unit in state is plain data:
//   { id, type, faction, tile, hp, moves, activity, fortifiedTurns, goto }
// activity is 'none', 'fortify', 'sleep' or 'skip'; goto is a destination
// tile the unit keeps walking towards at the start of each of its turns.

import { nextId } from '../core/ids.js';
import { neighbourCache } from './map.js';
import { sumHook } from './effects/index.js';
import { atWar } from './diplomacy.js';

export const CIVILIAN = 'civilian';
export const COMBAT = 'combat';

export function unitDef(ruleset, unit) {
  return ruleset.units[unit.type];
}

export function unitClass(ruleset, unit) {
  return ruleset.unitClasses?.[unitDef(ruleset, unit)?.class] ?? {};
}

/** Civilians (settlers, builders) and combat units each get one slot per tile. */
export function slotOf(ruleset, typeId) {
  const def = ruleset.units[typeId];
  const cls = ruleset.unitClasses?.[def?.class];
  return cls?.civilian ? CIVILIAN : COMBAT;
}

export function domainOf(ruleset, typeId) {
  const def = ruleset.units[typeId];
  return def?.domain ?? ruleset.unitClasses?.[def?.class]?.domain ?? 'land';
}

/** Moves per turn: the unit's own, plus moveBonus effects when the state is known. */
export function maxMoves(ruleset, unit, state = null) {
  const base = unitDef(ruleset, unit)?.moves ?? 1;
  if (!state?.factions) return base + promotionSum(ruleset, unit, 'moveBonus');
  return Math.max(1, base + promotionSum(ruleset, unit, 'moveBonus') + sumHook('move', state, ruleset, unit.faction, { unit }));
}

/** The total of one effect across a unit's promotions (they always reach the unit itself). */
export function promotionSum(ruleset, unit, effect) {
  let n = 0;
  for (const p of unit.promotions ?? []) for (const e of ruleset.promotions?.[p]?.effects ?? []) if (e.effect === effect) n += e.amount;
  return n;
}

/** Every unit on a tile. */
export function unitsAt(state, tile) {
  const out = [];
  for (const u of Object.values(state.units)) if (u.tile === tile) out.push(u);
  return out;
}

export function factionUnits(state, factionId) {
  return Object.values(state.units).filter((u) => u.faction === factionId);
}

/** Are these two factions at war (raiders are at war with everyone)? */
export function isEnemy(state, a, b) {
  return atWar(state, a, b);
}

/** Does a tile accept a unit of this type from this faction (terrain, domain, stacking)? */
export function canStand(state, ruleset, typeId, factionId, tile, ignoreUnitId = null) {
  const map = state.map;
  const terrain = ruleset.terrain[map.terrainIds[map.terrain[tile]]];
  if (!terrain || terrain.impassable) return false;
  const domain = domainOf(ruleset, typeId);
  if (domain === 'land' && terrain.water) return false;
  if (domain === 'sea' && !terrain.water) return false;
  const slot = slotOf(ruleset, typeId);
  for (const u of unitsAt(state, tile)) {
    if (u.id === ignoreUnitId) continue;
    if (u.faction !== factionId) return false;
    if (slotOf(ruleset, u.type) === slot) return false;
  }
  return true;
}

export function createUnit(state, ruleset, typeId, factionId, tile) {
  const id = nextId(state, 'u');
  const unit = { id, type: typeId, faction: factionId, tile, hp: 100, moves: ruleset.units[typeId].moves, activity: 'none', fortifiedTurns: 0, goto: null, xp: 0, promotions: [] };
  if ((ruleset.units[typeId].tags ?? []).includes('worker')) unit.charges = ruleset.tuning?.builders?.charges ?? 3;
  state.units[id] = unit;
  unit.moves = maxMoves(ruleset, unit, state);
  return unit;
}

/**
 * Put each faction's starting units (from the starting era in eras.json) on
 * and around its start position: the first of each slot on the start tile,
 * any others on the nearest free land.
 */
export function placeStartingUnits(state, ruleset) {
  const eraId = ruleset.tuning?.start?.era;
  const era = ruleset.eras?.[eraId];
  if (!era || !state.map) return;
  const nbs = neighbourCache(state.map);
  state.factions.forEach((faction, n) => {
    const start = state.map.starts[n];
    if (start === undefined) return;
    for (const typeId of era.startUnits ?? []) {
      if (!ruleset.units[typeId]) continue;
      // Breadth-first from the start tile to the nearest tile that takes this unit.
      const seen = new Set([start]);
      const queue = [start];
      for (let h = 0; h < queue.length && h < 200; h += 1) {
        const t = queue[h];
        if (canStand(state, ruleset, typeId, faction.id, t)) {
          createUnit(state, ruleset, typeId, faction.id, t);
          break;
        }
        for (const j of nbs[t]) if (j >= 0 && !seen.has(j)) { seen.add(j); queue.push(j); }
      }
    }
  });
}

/** Units of a faction that still want orders this turn. */
export function idleUnits(state, factionId) {
  return factionUnits(state, factionId).filter((u) => u.moves > 0 && u.activity === 'none' && u.goto === null);
}
