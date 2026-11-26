// Borders (section 3.2).
//
// A new city claims every tile within claimRadius (1). After that, culture
// fills a border box; the next tile costs baseCost + perTileCost x (tiles
// claimed so far), and the city takes the best unowned tile touching its
// land, within workRadius. Tiles can also be bought for goldPerTile x their
// distance from the city.

import { hexDistance } from '../core/hex.js';
import { neighbourCache, tileHex } from './map.js';
import { tileYields, factionEffects } from './yields.js';
import { sumHook } from './effects/index.js';

export function borderCost(city, tuning) {
  const b = tuning?.borders ?? { baseCost: 10, perTileCost: 6 };
  return b.baseCost + b.perTileCost * city.tilesClaimed;
}

export function distance(map, a, b) {
  return hexDistance(tileHex(map, a), tileHex(map, b));
}

/** Unowned tiles touching the city's land and within its work radius. */
export function claimable(state, ruleset, city) {
  const map = state.map;
  const nbs = neighbourCache(map);
  const radius = ruleset.tuning?.cities?.workRadius ?? 3;
  const out = new Set();
  for (let i = 0; i < state.owner.length; i += 1) {
    if (state.owner[i] !== city.id) continue;
    for (const j of nbs[i]) {
      if (j >= 0 && state.owner[j] === null && distance(map, city.tile, j) <= radius) out.add(j);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** How good a tile is to own: its yields, with resources and food favoured. */
export function tileValue(state, ruleset, city, t) {
  const y = tileYields(state, ruleset, t, factionEffects(state, ruleset, city.faction), city.faction);
  return y.food * 2 + y.production * 1.5 + y.gold + y.science + y.culture + y.faith + (state.map.resource[t] >= 0 ? 2 : 0);
}

export function bestClaim(state, ruleset, city) {
  let best = -1;
  let bestScore = -Infinity;
  for (const t of claimable(state, ruleset, city)) {
    const score = tileValue(state, ruleset, city, t) - distance(state.map, city.tile, t) * 0.5;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

export function claimTile(state, city, t) {
  state.owner[t] = city.id;
  city.tilesClaimed += 1;
}

/** Add this turn's culture; claim a tile when the box fills. Returns the tile claimed, or -1. */
export function growBorders(state, ruleset, city, culture) {
  // borderGrowthPercent effects (policy cards) make culture count for more here.
  const pct = sumHook('borderGrowth', state, ruleset, city.faction, { city });
  city.culture += culture * (1 + pct / 100);
  const cost = borderCost(city, ruleset.tuning);
  if (city.culture < cost) return -1;
  const t = bestClaim(state, ruleset, city);
  if (t < 0) { city.culture = cost; return -1; }
  city.culture -= cost;
  claimTile(state, city, t);
  return t;
}

export function tilePrice(state, ruleset, city, t) {
  return (ruleset.tuning?.borders?.goldPerTile ?? 25) * distance(state.map, city.tile, t);
}
