// Buildings and wonders (section 3.4).
//
// - Prerequisites: other buildings (a faction's own version counts), a coast
//   or river next to the city, being the capital, being the right faction.
// - A faction's unique building replaces the ordinary one for that faction.
// - Adjacency: +N of a yield per so many matching tiles (terrain, feature,
//   resource or improvement) in the city's land or next to the city.
// - Wonders are one per world. When someone finishes one, every other city
//   building it gets its production back as gold.

import { neighbourCache } from './map.js';
import { buildingDef, hasBuilding } from './effects/index.js';
import { canStand, createUnit, domainOf } from './units.js';
import { spawnShip } from './space.js';
import { knows } from './progression.js';
import { sideOf } from './frontline.js';
import { activeWorld } from './worlds.js';

/** The building this faction actually gets for a base building id (its unique version, if any). */
export function factionVersionOf(state, ruleset, factionId, id) {
  const civ = state.factions.find((f) => f.id === factionId)?.civ;
  for (const [bid, def] of Object.entries(ruleset.buildings ?? {})) {
    if (def.replaces === id && def.requires?.faction === civ) return bid;
  }
  return id;
}

function nearTerrain(state, ruleset, city, terrainId) {
  const map = state.map;
  return neighbourCache(map)[city.tile].some((j) => j >= 0 && map.terrainIds[map.terrain[j]] === terrainId);
}

/** Why this city cannot build this building or wonder (a code), or null. */
export function buildingProblem(state, ruleset, city, id, kind) {
  const def = kind === 'wonder' ? ruleset.wonders?.[id] : ruleset.buildings?.[id];
  if (!def) return 'unknown';
  if (city.buildings.includes(id)) return 'built';
  if (kind === 'wonder' && def.project && (state.projects?.[city.faction] ?? []).includes(id)) return 'built';
  if (kind === 'wonder' && !def.project && state.wondersBuilt?.[id]) return 'wonderTaken';
  const civ = state.factions.find((f) => f.id === city.faction)?.civ;
  const req = def.requires ?? {};
  if (req.faction && req.faction !== civ) return 'otherFaction';
  // K4: a side's own buildings, and buildings only some kinds of world allow.
  if (req.side !== undefined && sideOf(state, ruleset, city.faction) !== req.side) return 'otherFaction';
  if (def.builtAt && !def.builtAt.includes(ruleset.worlds?.[activeWorld(state)]?.kind)) return 'wrongWorld';
  if (kind === 'building' && factionVersionOf(state, ruleset, city.faction, id) !== id) return 'replaced';
  if (kind === 'building' && def.replaces && hasBuilding(ruleset, city, def.replaces)) return 'built';
  if (req.capital && !city.capital) return 'notCapital';
  if (req.tech && !knows(state, city.faction, req.tech)) return 'needsTech';
  if (req.civic && !knows(state, city.faction, req.civic, 'civics')) return 'needsCivic';
  for (const b of req.buildings ?? []) if (!hasBuilding(ruleset, city, b)) return 'needsBuilding';
  for (const p of req.projects ?? []) if (!(state.projects?.[city.faction] ?? []).includes(p)) return 'needsProject';
  if (req.nearTerrain && !nearTerrain(state, ruleset, city, req.nearTerrain)) return 'needsTerrain';
  if (req.river && state.map.river[city.tile] === 0) return 'needsRiver';
  return null;
}

/** Tiles an adjacency rule counts: the city's land, or the six hexes around it. */
function adjacencyTiles(state, city, within) {
  if (within === 'adjacent') return neighbourCache(state.map)[city.tile].filter((j) => j >= 0);
  const out = [];
  for (let i = 0; i < state.owner.length; i += 1) if (state.owner[i] === city.id && i !== city.tile) out.push(i);
  return out;
}

function matchesTile(state, t, count) {
  const map = state.map;
  if (count.terrain && map.terrainIds[map.terrain[t]] !== count.terrain) return false;
  if (count.feature && (map.feature[t] < 0 || map.featureIds[map.feature[t]] !== count.feature)) return false;
  if (count.resource && (map.resource[t] < 0 || map.resourceIds[map.resource[t]] !== count.resource)) return false;
  if (count.improvement && (!map.improvement || map.improvement[t] < 0 || map.improvementIds[map.improvement[t]] !== count.improvement)) return false;
  return true;
}

/** A building's adjacency bonuses in this city: [{ yield, amount, count, rule }]. */
export function adjacencyBonus(state, ruleset, city, id) {
  const def = buildingDef(ruleset, id);
  const out = [];
  for (const rule of def?.adjacency ?? []) {
    const count = adjacencyTiles(state, city, rule.within ?? 'borders').filter((t) => matchesTile(state, t, rule.countTiles ?? {})).length;
    const amount = Math.floor(count / (rule.per ?? 1)) * rule.amount;
    out.push({ yield: rule.yield, amount, count, rule });
  }
  return out;
}

/** Put a new unit in or next to a city. Returns the event, or null if there is no room. */
export function spawnUnit(state, ruleset, city, typeId) {
  if (!ruleset.units[typeId]) return null;
  // K2: a ship joins its faction's fleet in this world's orbit.
  if (domainOf(ruleset, typeId) === 'space') return state.space ? spawnShip(state, ruleset, city, typeId) : null;
  const spots = [city.tile, ...neighbourCache(state.map)[city.tile].filter((j) => j >= 0)];
  const spot = spots.find((t) => canStand(state, ruleset, typeId, city.faction, t));
  if (spot === undefined) return null;
  const unit = createUnit(state, ruleset, typeId, city.faction, spot);
  unit.builtIn = city.id;
  return { type: 'unitBuilt', city: city.id, unit: unit.id, unitType: typeId, faction: city.faction, tile: spot };
}

/**
 * A project was finished (a wonder entry with project: true, such as the three
 * science victory projects). Each faction may finish each project once; other
 * cities of the same faction building it get their production back as gold.
 */
export function claimProject(state, city, id, events) {
  state.projects ??= {};
  state.projects[city.faction] ??= [];
  state.projects[city.faction].push(id);
  events.push({ type: 'projectCompleted', project: id, city: city.id, cityName: city.name, faction: city.faction, global: true });
  for (const other of Object.values(state.cities)) {
    if (other.id === city.id || other.faction !== city.faction) continue;
    const k = other.queue.findIndex((q) => q.kind === 'wonder' && q.id === id);
    if (k < 0) continue;
    const refund = k === 0 ? other.progress : 0;
    other.queue.splice(k, 1);
    if (k === 0) other.progress = 0;
    state.factions.find((f) => f.id === other.faction).stocks.gold += refund;
  }
}

/** A wonder was finished: record it and pay every other city building it back in gold. */
export function claimWonder(state, city, id, events) {
  state.wondersBuilt ??= {};
  state.wondersBuilt[id] = city.id;
  events.push({ type: 'wonderBuilt', wonder: id, city: city.id, cityName: city.name, faction: city.faction, global: true });
  for (const other of Object.values(state.cities)) {
    if (other.id === city.id) continue;
    const k = other.queue.findIndex((q) => q.kind === 'wonder' && q.id === id);
    if (k < 0) continue;
    const refund = k === 0 ? other.progress : 0;
    other.queue.splice(k, 1);
    if (k === 0) other.progress = 0;
    const owner = state.factions.find((f) => f.id === other.faction);
    owner.stocks.gold += refund;
    events.push({ type: 'wonderLost', wonder: id, city: other.id, faction: other.faction, gold: refund });
  }
}
