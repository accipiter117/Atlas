// Cities (section 3.2): founding, names, the tiles a city may work, citizen
// assignment by focus with locked tiles, and production.
//
// A city in state is plain data:
//   { id, name, faction, tile, capital, founded, pop, food, culture,
//     tilesClaimed, focus, locks, worked, queue, progress, buildings }

import { nextId } from '../core/ids.js';
import { neighbourCache } from './map.js';
import { distance, claimTile } from './borders.js';
import { tileYields, factionEffects, YIELD_NAMES } from './yields.js';
import { canStand, createUnit } from './units.js';

export function citiesOf(state, factionId) {
  return Object.values(state.cities ?? {}).filter((c) => c.faction === factionId);
}

export function cityAt(state, tile) {
  return Object.values(state.cities ?? {}).find((c) => c.tile === tile) ?? null;
}

/** Why a city cannot be founded here (a refusal code), or null if it can. */
export function foundingProblem(state, ruleset, factionId, tile) {
  const map = state.map;
  const terrain = ruleset.terrain[map.terrainIds[map.terrain[tile]]];
  if (!terrain || terrain.water || terrain.impassable) return 'badSite';
  const min = ruleset.tuning?.cities?.minCityDistance ?? 4;
  for (const c of Object.values(state.cities ?? {})) {
    if (distance(map, c.tile, tile) < min) return 'tooClose';
  }
  if (state.owner[tile] !== null && state.cities[state.owner[tile]]?.faction !== factionId) return 'foreignLand';
  return null;
}

/** The next unused name from the faction's list (shared lists never repeat a name). */
export function nextCityName(state, ruleset, factionId) {
  const f = state.factions.find((x) => x.id === factionId);
  const civ = ruleset.factions?.[f?.civ];
  const list = ruleset.cityNames?.[civ?.cityNames]?.names ?? [];
  const used = new Set(Object.values(state.cities).map((c) => c.name));
  for (const name of list) if (!used.has(name)) return name;
  let n = used.size + 1;
  while (used.has(`${f?.name ?? 'City'} ${n}`)) n += 1;
  return `${f?.name ?? 'City'} ${n}`;
}

export function foundCity(state, ruleset, factionId, tile) {
  const id = nextId(state, 'c');
  const first = citiesOf(state, factionId).length === 0;
  const city = {
    id, name: nextCityName(state, ruleset, factionId), faction: factionId, tile, capital: first, founded: state.turn,
    pop: 1, food: 0, culture: 0, tilesClaimed: 0,
    focus: Object.values(ruleset.focuses ?? {}).find((f) => f.default)?.id ?? 'balanced',
    locks: [], worked: [], queue: [], progress: 0, buildings: [],
  };
  state.cities[id] = city;
  const radius = ruleset.tuning?.cities?.claimRadius ?? 1;
  state.owner[tile] = id;
  for (let i = 0; i < state.owner.length; i += 1) {
    if (state.owner[i] === null && distance(state.map, tile, i) <= radius) state.owner[i] = id;
  }
  city.tilesClaimed = 0;
  assignCitizens(state, ruleset, city);
  return city;
}

/** Tiles the city could work: its own land within workRadius, not the centre, not impassable, not worked by another city. */
export function workable(state, ruleset, city) {
  const radius = ruleset.tuning?.cities?.workRadius ?? 3;
  const takenByOthers = new Set();
  for (const c of Object.values(state.cities)) if (c.id !== city.id) for (const t of c.worked) takenByOthers.add(t);
  const out = [];
  for (let i = 0; i < state.owner.length; i += 1) {
    if (state.owner[i] !== city.id || i === city.tile || takenByOthers.has(i)) continue;
    const terrain = ruleset.terrain[state.map.terrainIds[state.map.terrain[i]]];
    if (terrain?.impassable) continue;
    if (distance(state.map, city.tile, i) <= radius) out.push(i);
  }
  return out;
}

function score(y, weights) {
  let s = 0;
  for (const k of YIELD_NAMES) s += (y[k] ?? 0) * (weights[k] ?? 1);
  return s;
}

/**
 * Put each citizen on a tile: locked tiles first, then the best tiles for the
 * city's focus. If that would starve the city, food is weighted up until it
 * does not (unless nothing can feed it). City is a working copy.
 */
export function assignCitizens(state, ruleset, city) {
  const options = workable(state, ruleset, city);
  const effects = factionEffects(state, ruleset, city.faction);
  const yields = new Map(options.map((t) => [t, tileYields(state, ruleset, t, effects)]));
  city.locks = city.locks.filter((t) => yields.has(t)).slice(0, city.pop);
  const weights = { ...(ruleset.focuses?.[city.focus]?.weights ?? {}) };
  const eat = ruleset.tuning?.cities?.foodPerCitizen ?? 2;
  const centre = tileYields(state, ruleset, city.tile, effects);
  const centreFood = Math.max(centre.food, ruleset.tuning?.cities?.centreMinimum?.food ?? 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const free = options.filter((t) => !city.locks.includes(t))
      .sort((a, b) => score(yields.get(b), weights) - score(yields.get(a), weights) || a - b);
    city.worked = [...city.locks, ...free.slice(0, city.pop - city.locks.length)];
    const food = centreFood + city.worked.reduce((s, t) => s + yields.get(t).food, 0);
    if (food >= city.pop * eat) break;
    weights.food = (weights.food ?? 1) + 2;
  }
  city.worked.sort((a, b) => a - b);
}

/** Can this faction build this item at all right now? */
export function canBuild(state, ruleset, city, item) {
  if (item.kind === 'unit') {
    const def = ruleset.units[item.id];
    if (!def) return false;
    const f = state.factions.find((x) => x.id === city.faction);
    if (def.requires?.faction && def.requires.faction !== f?.civ) return false;
    if (def.requires?.tech || def.requires?.civic || def.requires?.building || def.requires?.resource) return false; // arrive with techs and economy
    // A faction's unique unit hides the unit it replaces.
    for (const u of Object.values(ruleset.units)) {
      if (u.replaces === item.id && u.requires?.faction === f?.civ) return false;
    }
    const domain = def.domain ?? ruleset.unitClasses[def.class]?.domain ?? 'land';
    if (domain === 'sea') {
      const coastal = neighbourCache(state.map)[city.tile].some((j) => j >= 0 && ruleset.terrain[state.map.terrainIds[state.map.terrain[j]]]?.water);
      if (!coastal) return false;
    }
    return true;
  }
  if (item.kind === 'building') {
    const def = ruleset.buildings?.[item.id];
    return Boolean(def) && !city.buildings.includes(item.id);
  }
  return false;
}

export function itemCost(ruleset, item) {
  return item.kind === 'unit' ? ruleset.units[item.id].cost : ruleset.buildings[item.id].cost;
}

/** Everything the city can build now. */
export function buildOptions(state, ruleset, city) {
  const out = [];
  for (const id of Object.keys(ruleset.units)) if (canBuild(state, ruleset, city, { kind: 'unit', id })) out.push({ kind: 'unit', id });
  for (const id of Object.keys(ruleset.buildings ?? {})) if (canBuild(state, ruleset, city, { kind: 'building', id })) out.push({ kind: 'building', id });
  return out;
}

/** Finish the item at the head of the queue. Returns the event, or null if a unit has nowhere to stand. */
export function completeItem(state, ruleset, city, item) {
  if (item.kind === 'unit') {
    const nbs = neighbourCache(state.map);
    const spots = [city.tile, ...nbs[city.tile].filter((j) => j >= 0)];
    const spot = spots.find((t) => canStand(state, ruleset, item.id, city.faction, t));
    if (spot === undefined) return null;
    const unit = createUnit(state, ruleset, item.id, city.faction, spot);
    return { type: 'unitBuilt', city: city.id, unit: unit.id, unitType: item.id, faction: city.faction, tile: spot };
  }
  city.buildings.push(item.id);
  return { type: 'buildingBuilt', city: city.id, building: item.id, faction: city.faction };
}

export { claimTile };
