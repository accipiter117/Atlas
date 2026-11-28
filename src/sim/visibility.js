// Fog of war (section 3.15).
//
// Each faction has one number per tile in state.fog[factionId]:
//   0 unexplored (black), 1 explored (seen before, greyed), 2 visible now.
// Sight is the unit's `sight` (or tuning.sight.default), +1 on hills. Tiles
// two or more steps away are hidden behind a mountain or a forest on the
// straight line between (the blocking tile itself is still seen).

import { line } from '../core/hex.js';
import { neighbourCache, tileHex, tileIndex } from './map.js';
import { factionUnits, unitDef, promotionSum } from './units.js';
import { sumHook, effectsFor } from './effects/index.js';
import { theatreSight } from './war.js';

export const UNEXPLORED = 0;
export const EXPLORED = 1;
export const VISIBLE = 2;

function blocksSight(state, ruleset, t) {
  const map = state.map;
  if (ruleset.terrain[map.terrainIds[map.terrain[t]]]?.blocksSight) return true;
  const f = map.feature[t] >= 0 ? ruleset.features[map.featureIds[map.feature[t]]] : null;
  return f?.blocksSight === true;
}

export function sightRange(state, ruleset, unit, effects = undefined) {
  const base = unitDef(ruleset, unit)?.sight ?? ruleset.tuning?.sight?.default ?? 2;
  const bonus = (state.factions ? sumHook('sight', state, ruleset, unit.faction, { unit }, effects) : 0) + promotionSum(ruleset, unit, 'sightBonus');
  return Math.max(1, base + bonus + theatreSight(state, ruleset) + (state.map.hills[unit.tile] ? ruleset.tuning?.sight?.hillsBonus ?? 1 : 0));
}

/** Tiles a viewer on `from` with range `radius` can see. */
export function tilesInSight(state, ruleset, from, radius) {
  const map = state.map;
  const nbs = neighbourCache(map);
  const origin = tileHex(map, from);
  const out = [from];
  const seen = new Set([from]);
  let frontier = [from];
  for (let d = 1; d <= radius; d += 1) {
    const next = [];
    for (const t of frontier) for (const j of nbs[t]) if (j >= 0 && !seen.has(j)) { seen.add(j); next.push(j); }
    for (const t of next) {
      if (d === 1) { out.push(t); continue; }
      const path = line(origin, tileHex(map, t));
      let clear = true;
      for (let k = 1; k < path.length - 1 && clear; k += 1) {
        const mid = tileIndex(map, path[k].q, path[k].r);
        if (mid >= 0 && blocksSight(state, ruleset, mid)) clear = false;
      }
      if (clear) out.push(t);
    }
    frontier = next;
  }
  return out;
}

/** Recompute what a faction sees now; everything it has ever seen stays explored. Working copy only. */
/** The factions on this one's side of a side war, when the war shares sight (else an empty set). */
function sharedSightAllies(state, ruleset, factionId) {
  if (!state.warSupport || !ruleset.tuning?.warSupport?.sharedSight) return new Set();
  const sideOfCiv = (id) => ruleset.factions?.[state.factions.find((f) => f.id === id)?.civ]?.frontSide;
  const mine = sideOfCiv(factionId);
  return new Set(state.factions.filter((f) => f.id !== factionId && f.alive !== false && mine !== undefined && sideOfCiv(f.id) === mine).map((f) => f.id));
}

export function updateVisibility(state, ruleset, factionId) {
  const n = state.map.width * state.map.height;
  // Only real players have fog; raiders see everything near them.
  if (!state.factions.some((f) => f.id === factionId)) return null;
  state.fog ??= {};
  let fog = state.fog[factionId];
  if (!fog) {
    fog = new Array(n).fill(UNEXPLORED);
    state.fog[factionId] = fog;
  }
  for (let i = 0; i < n; i += 1) if (fog[i] === VISIBLE) fog[i] = EXPLORED;
  // The faction's effects once, not once per unit (phase 14 speed work).
  const units = factionUnits(state, factionId);
  const effects = units.length && state.factions ? effectsFor(state, ruleset, factionId) : undefined;
  for (const u of units) {
    for (const t of tilesInSight(state, ruleset, u.tile, sightRange(state, ruleset, u, effects))) fog[t] = VISIBLE;
  }
  // K5: in a side war with shared sight (tuning warSupport.sharedSight), allies see what each other's units see.
  const allies = sharedSightAllies(state, ruleset, factionId);
  for (const u of allies.size ? Object.values(state.units ?? {}).filter((x) => allies.has(x.faction)) : []) {
    for (const t of tilesInSight(state, ruleset, u.tile, sightRange(state, ruleset, u))) fog[t] = VISIBLE;
  }
  // Cities see around themselves, and a faction always sees its own land.
  const cityRange = ruleset.tuning?.sight?.city ?? 2;
  for (const c of Object.values(state.cities ?? {})) {
    if (c.faction !== factionId && !allies.has(c.faction)) continue;
    for (const t of tilesInSight(state, ruleset, c.tile, cityRange)) fog[t] = VISIBLE;
  }
  if (state.owner) {
    for (let i = 0; i < n; i += 1) {
      const c = state.owner[i];
      if (c !== null && state.cities[c]?.faction === factionId) fog[i] = VISIBLE;
    }
  }
  // Setup "fog of war: off" (for testing): everyone sees everything.
  if (state.setup?.fog === 'off') fog.fill(VISIBLE);
  return fog;
}

export function updateAllVisibility(state, ruleset) {
  for (const f of state.factions) updateVisibility(state, ruleset, f.id);
}
