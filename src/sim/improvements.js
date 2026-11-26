// Improvements and roads (section 3.4).
//
// Builders spend charges (tuning builders.charges) to build farms, mines and
// the rest. An improvement must suit the tile: its terrain and feature, hills
// if it needs them, or the tile's resource if that resource names it (a mine
// on iron needs no hills). Water improvements such as fishing boats are built
// from the shore on a neighbouring water hex. Roads cost no charge.

import { neighbourCache } from './map.js';

export function improvementIndex(map, id) {
  return map.improvementIds ? map.improvementIds.indexOf(id) : -1;
}

/** Why this improvement cannot go on this tile for this faction (a code), or null. */
export function improvementProblem(state, ruleset, factionId, id, tile) {
  const def = ruleset.improvements?.[id];
  const map = state.map;
  if (!def) return 'unknown';
  if (def.requires?.tech || def.requires?.civic) return 'needsTech';
  const terrainId = map.terrainIds[map.terrain[tile]];
  const terrain = ruleset.terrain[terrainId];
  if (!terrain || terrain.impassable) return 'badTile';
  if (Object.values(state.cities ?? {}).some((c) => c.tile === tile)) return 'cityTile';
  if (def.road) {
    if (terrain.water) return 'badTile';
    return map.road[tile] ? 'alreadyBuilt' : null;
  }
  const owner = state.owner?.[tile];
  if (owner === null || owner === undefined || state.cities[owner]?.faction !== factionId) return 'notYourLand';
  if (Boolean(def.water) !== Boolean(terrain.water)) return 'badTile';
  if (map.improvement[tile] === improvementIndex(map, id)) return 'alreadyBuilt';
  const resourceId = map.resource[tile] >= 0 ? map.resourceIds[map.resource[tile]] : null;
  const resource = resourceId ? ruleset.resources[resourceId] : null;
  if (resource?.improvement === id) return null; // the resource asks for exactly this
  if (def.needsResource) return 'needsResource';
  if (def.needsHills && !map.hills[tile]) return 'needsHills';
  if (def.validTerrain && !def.validTerrain.includes(terrainId)) return 'badTerrain';
  const featureId = map.feature[tile] >= 0 ? map.featureIds[map.feature[tile]] : null;
  if (featureId && !(def.validFeatures ?? []).includes(featureId)) return 'badFeature';
  if (!featureId && def.validFeatures && !def.validTerrain) return 'badFeature';
  return null;
}

/** Hexes a builder on `tile` could improve: its own hex, and neighbouring water for water improvements. */
export function builderTargets(state, ruleset, id, tile) {
  const def = ruleset.improvements?.[id];
  if (def?.water) return neighbourCache(state.map)[tile].filter((j) => j >= 0);
  return [tile];
}

export function placeImprovement(state, ruleset, id, tile) {
  const def = ruleset.improvements[id];
  if (def.road) { state.map.road[tile] = 1; return; }
  state.map.improvement[tile] = improvementIndex(state.map, id);
}

/** Lay road on the shortest land path between two tiles (no road onto water or mountains). Returns the tiles roaded. */
export function roadBetween(state, ruleset, from, to) {
  const map = state.map;
  const nbs = neighbourCache(map);
  const ok = (t) => {
    const terrain = ruleset.terrain[map.terrainIds[map.terrain[t]]];
    return terrain && !terrain.water && !terrain.impassable;
  };
  const prev = new Map([[from, -1]]);
  const queue = [from];
  for (let h = 0; h < queue.length && !prev.has(to); h += 1) {
    for (const j of nbs[queue[h]]) if (j >= 0 && !prev.has(j) && ok(j)) { prev.set(j, queue[h]); queue.push(j); }
  }
  if (!prev.has(to)) return [];
  const tiles = [];
  for (let t = to; t !== -1; t = prev.get(t)) {
    if (!map.road[t]) { map.road[t] = 1; tiles.push(t); }
  }
  return tiles;
}
