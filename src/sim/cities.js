// Cities (section 3.2): founding, names, the tiles a city may work, citizen
// assignment by focus with locked tiles and specialists, and what a city can
// build (units, buildings, wonders) and what it costs.
//
// A city in state is plain data:
//   { id, name, faction, tile, capital, founded, pop, food, culture,
//     tilesClaimed, focus, locks, worked, specialists, queue, progress, buildings }

import { nextId } from '../core/ids.js';
import { neighbourCache } from './map.js';
import { distance } from './borders.js';
import { tileYields, factionEffects, YIELD_NAMES } from './yields.js';
import { effectsFor, sumHook, runHook, buildingDef } from './effects/index.js';
import { buildingProblem, spawnUnit, claimWonder, claimProject } from './buildings.js';
import { knows, speedMultiplier } from './progression.js';
import { receivedResources, givenResources } from './diplomacy.js';
import { spyCount, spyCap } from './espionage.js';

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

/** Found a city (working copy). Returns { city, events } including anything effects give it. */
export function foundCity(state, ruleset, factionId, tile) {
  const id = nextId(state, 'c');
  const first = citiesOf(state, factionId).length === 0;
  // Only a faction's very first city is its original capital (conquest victory counts these).
  const faction = state.factions.find((f) => f.id === factionId);
  const original = first && !faction?.foundedCapital;
  if (faction) faction.foundedCapital = true;
  const city = {
    id, name: nextCityName(state, ruleset, factionId), faction: factionId, tile, capital: first, founded: state.turn,
    pop: 1, food: 0, culture: 0, tilesClaimed: 0,
    focus: Object.values(ruleset.focuses ?? {}).find((f) => f.default)?.id ?? 'balanced',
    locks: [], worked: [], specialists: {}, queue: [], progress: 0, buildings: [], originalCapital: original, foundedBy: factionId, hp: null,
  };
  state.cities[id] = city;
  const radius = ruleset.tuning?.cities?.claimRadius ?? 1;
  state.owner[tile] = id;
  for (let i = 0; i < state.owner.length; i += 1) {
    if (state.owner[i] === null && distance(state.map, tile, i) <= radius) state.owner[i] = id;
  }
  const palace = ruleset.tuning?.cities?.capitalBuilding;
  if (first && palace && ruleset.buildings?.[palace]) city.buildings.push(palace);
  const events = runHook('onCityFounded', state, ruleset, effectsFor(state, ruleset, factionId), { city });
  city.hp = cityHpMax(ruleset, city);
  assignCitizens(state, ruleset, city);
  return { city, events };
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

/** Specialist slots from the city's buildings: { science: 1, gold: 1 }. */
export function specialistSlots(ruleset, city) {
  const out = {};
  for (const b of city.buildings ?? []) {
    for (const [y, n] of Object.entries(buildingDef(ruleset, b)?.specialistSlots ?? {})) out[y] = (out[y] ?? 0) + n;
  }
  return out;
}

function score(y, weights) {
  let s = 0;
  for (const k of YIELD_NAMES) s += (y[k] ?? 0) * (weights[k] ?? 1);
  return s;
}

/**
 * Put each citizen to work: locked tiles first, then the best of the
 * remaining tiles and specialist slots for the city's focus. If that would
 * starve the city, food is weighted up until it does not (where the land
 * allows). City is a working copy.
 */
export function assignCitizens(state, ruleset, city) {
  const options = workable(state, ruleset, city);
  const effects = factionEffects(state, ruleset, city.faction);
  const yields = new Map(options.map((t) => [t, tileYields(state, ruleset, t, effects, city.faction)]));
  city.locks = city.locks.filter((t) => yields.has(t)).slice(0, city.pop);
  const weights = { ...(ruleset.focuses?.[city.focus]?.weights ?? {}) };
  const eat = ruleset.tuning?.cities?.foodPerCitizen ?? 2;
  const perSpecialist = ruleset.tuning?.specialists?.yield ?? 2;
  const centre = tileYields(state, ruleset, city.tile, effects, city.faction);
  const centreFood = Math.max(centre.food, ruleset.tuning?.cities?.centreMinimum?.food ?? 0);
  const slots = [];
  for (const [y, n] of Object.entries(specialistSlots(ruleset, city))) for (let k = 0; k < n; k += 1) slots.push({ special: y, yields: { [y]: perSpecialist } });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const free = [
      ...options.filter((t) => !city.locks.includes(t)).map((t) => ({ tile: t, yields: yields.get(t) })),
      ...slots,
    ].sort((a, b) => score(b.yields, weights) - score(a.yields, weights) || (a.tile ?? 1e9) - (b.tile ?? 1e9) || (a.special ?? '').localeCompare(b.special ?? ''));
    const chosen = free.slice(0, Math.max(0, city.pop - city.locks.length));
    city.worked = [...city.locks, ...chosen.filter((c) => c.tile !== undefined).map((c) => c.tile)];
    city.specialists = {};
    for (const c of chosen) if (c.special) city.specialists[c.special] = (city.specialists[c.special] ?? 0) + 1;
    const food = centreFood + city.worked.reduce((s, t) => s + yields.get(t).food, 0);
    if (food >= city.pop * eat) break;
    weights.food = (weights.food ?? 1) + 2;
  }
  city.worked.sort((a, b) => a - b);
}

/** Does the faction have this strategic resource improved somewhere in its land? */
export function hasResource(state, ruleset, factionId, resourceId) {
  const map = state.map;
  const want = ruleset.resources[resourceId];
  if (!want || !map.improvement) return false;
  if (want.revealedBy && !knows(state, factionId, want.revealedBy)) return false;
  if (receivedResources(state, factionId).includes(resourceId)) return true;
  // Copies given away in deals are not yours to use (phase 14).
  let copies = -givenResources(state, factionId).filter((r) => r === resourceId).length;
  for (let i = 0; i < state.owner.length; i += 1) {
    const o = state.owner[i];
    if (o === null || state.cities[o]?.faction !== factionId) continue;
    if (map.resource[i] < 0 || map.resourceIds[map.resource[i]] !== resourceId) continue;
    if (map.improvement[i] >= 0 && map.improvementIds[map.improvement[i]] === want.improvement) copies += 1;
  }
  return copies > 0;
}

/** Can this city build this item right now? */
export function canBuild(state, ruleset, city, item) {
  if (item.kind === 'unit') {
    const def = ruleset.units[item.id];
    if (!def || def.faithOnly || def.raiderOnly) return false;
    const f = state.factions.find((x) => x.id === city.faction);
    if (def.requires?.faction && def.requires.faction !== f?.civ) return false;
    if (def.requires?.tech && !knows(state, city.faction, def.requires.tech)) return false;
    if (def.requires?.civic && !knows(state, city.faction, def.requires.civic, 'civics')) return false;
    if (def.requires?.building && !city.buildings.includes(def.requires.building)) return false;
    // Spies: at most capBase + era index per faction (phase 15).
    if ((def.tags ?? []).includes('spy') && spyCount(state, ruleset, city.faction) >= spyCap(state, ruleset, city.faction)) return false;
    if (def.requires?.resource && !hasResource(state, ruleset, city.faction, def.requires.resource)) return false;
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
  if (item.kind === 'building' || item.kind === 'wonder') return buildingProblem(state, ruleset, city, item.id, item.kind) === null;
  return false;
}

/** Base production cost of an item. */
export function baseCost(ruleset, item) {
  if (item.kind === 'unit') return ruleset.units[item.id].cost;
  if (item.kind === 'wonder') return ruleset.wonders[item.id].cost;
  return ruleset.buildings[item.id].cost;
}

/** Production cost in this city after costPercent effects (with state), or the base cost (without). */
export function itemCost(ruleset, item, state = null, city = null) {
  const base = baseCost(ruleset, item);
  if (!state || !city) return base;
  const pct = sumHook('cost', state, ruleset, city.faction, { city, item });
  return Math.max(1, Math.round(base * (1 + pct / 100) * speedMultiplier(state, ruleset)));
}

/** Everything the city can build now. */
export function buildOptions(state, ruleset, city) {
  const out = [];
  for (const id of Object.keys(ruleset.units)) if (canBuild(state, ruleset, city, { kind: 'unit', id })) out.push({ kind: 'unit', id });
  for (const id of Object.keys(ruleset.buildings ?? {})) if (canBuild(state, ruleset, city, { kind: 'building', id })) out.push({ kind: 'building', id });
  for (const id of Object.keys(ruleset.wonders ?? {})) if (canBuild(state, ruleset, city, { kind: 'wonder', id })) out.push({ kind: 'wonder', id });
  return out;
}

/** Finish an item. Returns the events, or null if a unit has nowhere to stand. */
export function completeItem(state, ruleset, city, item) {
  if (item.kind === 'unit') {
    const ev = spawnUnit(state, ruleset, city, item.id);
    return ev ? [ev] : null;
  }
  const events = [];
  if (item.kind === 'wonder' && ruleset.wonders[item.id]?.project) {
    claimProject(state, city, item.id, events);
    return events;
  }
  const before = cityHpMax(ruleset, city);
  city.buildings.push(item.id);
  // New walls add their hit points straight away.
  if (city.hp !== null && city.hp !== undefined) city.hp += cityHpMax(ruleset, city) - before;
  events.push({ type: item.kind === 'wonder' ? 'wonderCompleted' : 'buildingBuilt', city: city.id, building: item.id, faction: city.faction });
  if (item.kind === 'wonder') claimWonder(state, city, item.id, events);
  events.push(...runHook('onBuilt', state, ruleset, effectsFor(state, ruleset, city.faction), { city, built: item.id }));
  assignCitizens(state, ruleset, city);
  return events;
}

/** A city's full hit points: tuning combat.cityHp plus each building's defence (walls). */
export function cityHpMax(ruleset, city) {
  let hp = ruleset.tuning?.combat?.cityHp ?? 200;
  for (const b of city.buildings) hp += buildingDef(ruleset, b)?.defence ?? 0;
  return hp;
}
