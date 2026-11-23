// The map's storage and the questions everything else asks of it.
//
// A map is plain data, stored as flat arrays (one slot per tile) for speed
// and small saves:
//   terrain[i]  index into map.terrainIds
//   hills[i]    1 if the tile is hilly
//   feature[i]  index into map.featureIds, or -1
//   resource[i] index into map.resourceIds, or -1
//   river[i]    six bits, one per hex edge (bit d set = a river runs along
//               the edge shared with the neighbour in direction d)
// Tiles are laid out in rows. Row r holds the hexes whose axial r equals r,
// and column c in that row is axial q = c - floor(r / 2), so the map is a
// rectangle on screen. Tile index is r * width + c (section 3.1).

import { DIRECTIONS } from '../core/hex.js';

export function tileIndex(map, q, r) {
  if (r < 0 || r >= map.height) return -1;
  const c = q + Math.floor(r / 2);
  if (c < 0 || c >= map.width) return -1;
  return r * map.width + c;
}

export function tileHex(map, i) {
  const r = Math.floor(i / map.width);
  const c = i - r * map.width;
  return { q: c - Math.floor(r / 2), r };
}

/** Neighbour tile indexes in the six directions (-1 off the map). */
export function neighbourTiles(map, i) {
  const { q, r } = tileHex(map, i);
  return DIRECTIONS.map((d) => tileIndex(map, q + d.q, r + d.r));
}

export function terrainOf(map, ruleset, i) {
  return ruleset.terrain[map.terrainIds[map.terrain[i]]];
}

export function isWater(map, ruleset, i) {
  return terrainOf(map, ruleset, i)?.water === true;
}

export function hasRiver(map, i) {
  return map.river[i] !== 0;
}

const NEIGHBOURS = new Map();

/** Neighbour lists for every tile, cached per map size (they depend only on width and height). */
export function neighbourCache(map) {
  const key = `${map.width}x${map.height}`;
  if (!NEIGHBOURS.has(key)) {
    const n = map.width * map.height;
    NEIGHBOURS.set(key, Array.from({ length: n }, (_, i) => neighbourTiles(map, i)));
  }
  return NEIGHBOURS.get(key);
}
