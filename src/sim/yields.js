// Yields (section 3.3), all computed in one place, in one order:
//   1. tiles: every worked tile (terrain + hills + feature + resource +
//      improvement, with a resource's improved yields when its improvement is
//      built, plus tileYield effects such as Egypt's floodplain food), with
//      the city centre raised to its minimum
//   2. flat bonuses: the city's own culture, buildings and wonders, their
//      adjacency bonuses, specialists, and yieldBonus effects
//   3. percentage bonuses, last, so a +10% applies to everything above:
//      yieldPercent and cityYieldPercent effects and the city's amenities
// Every effect goes through the registry in src/sim/effects.

import { effectsFor, yieldHook, buildingDef } from './effects/index.js';
import { adjacencyBonus } from './buildings.js';
import { amenitiesFor } from './amenities.js';

export const YIELD_NAMES = Object.freeze(['food', 'production', 'gold', 'science', 'culture', 'faith']);

export const zero = () => ({ food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 });

function add(into, from, k = 1) {
  for (const y of YIELD_NAMES) if (from?.[y]) into[y] += from[y] * k;
  return into;
}

/** Effects that apply to a faction (kept for callers that only want the list). */
export function factionEffects(state, ruleset, factionId) {
  return effectsFor(state, ruleset, factionId);
}

/** What one tile yields to whoever works it, before any city-wide bonus. */
export function tileYields(state, ruleset, tile, effects = [], factionId = null) {
  const map = state.map;
  const out = zero();
  const terrainId = map.terrainIds[map.terrain[tile]];
  add(out, ruleset.terrain[terrainId]?.yields);
  if (map.hills[tile]) out.production += ruleset.tuning?.yields?.hillsProduction ?? 1;
  const featureId = map.feature[tile] >= 0 ? map.featureIds[map.feature[tile]] : null;
  if (featureId) add(out, ruleset.features[featureId]?.yields);
  const resourceId = map.resource[tile] >= 0 ? map.resourceIds[map.resource[tile]] : null;
  const resource = resourceId ? ruleset.resources[resourceId] : null;
  if (resource) add(out, resource.yields);
  const improvementId = map.improvement && map.improvement[tile] >= 0 ? map.improvementIds[map.improvement[tile]] : null;
  if (improvementId) {
    add(out, ruleset.improvements?.[improvementId]?.yields);
    if (resource?.improvement === improvementId) add(out, resource.improvedYields);
  }
  if (effects.length) add(out, yieldHook('tileYield', state, ruleset, factionId, { tile, terrainId, featureId, resourceId, improvementId }, effects));
  return out;
}

/**
 * A city's yields with every source listed, in the documented order.
 * @returns {{ sources: Array<{step, kind, id?, yields}>, total: object, eaten: number, surplus: number, amenities: object }}
 */
export function cityYields(state, ruleset, city, effects = effectsFor(state, ruleset, city.faction)) {
  const tuning = ruleset.tuning?.cities ?? {};
  const sources = [];

  // 1. Tiles.
  const tiles = zero();
  for (const t of [city.tile, ...city.worked]) {
    const y = tileYields(state, ruleset, t, effects, city.faction);
    if (t === city.tile) {
      for (const [k, min] of Object.entries(tuning.centreMinimum ?? {})) y[k] = Math.max(y[k], min);
    }
    add(tiles, y);
  }
  sources.push({ step: 1, kind: 'tiles', yields: tiles });

  // 2. Flat bonuses.
  if (tuning.baseCulture) sources.push({ step: 2, kind: 'city', yields: { ...zero(), culture: tuning.baseCulture } });
  // Every citizen adds a little science and culture (cities.perCitizen), as in Civ VI.
  if (tuning.perCitizen) {
    const per = add(zero(), tuning.perCitizen, city.pop);
    if (YIELD_NAMES.some((y) => per[y])) sources.push({ step: 2, kind: 'citizens', yields: per });
  }
  for (const b of city.buildings ?? []) {
    const def = buildingDef(ruleset, b);
    if (def?.yields) sources.push({ step: 2, kind: 'building', id: b, yields: add(zero(), def.yields) });
    for (const a of adjacencyBonus(state, ruleset, city, b)) {
      if (a.amount) sources.push({ step: 2, kind: 'adjacency', id: b, count: a.count, yields: { ...zero(), [a.yield]: a.amount } });
    }
  }
  const perSpecialist = ruleset.tuning?.specialists?.yield ?? 2;
  for (const [y, n] of Object.entries(city.specialists ?? {})) {
    if (n > 0) sources.push({ step: 2, kind: 'specialists', count: n, yields: { ...zero(), [y]: n * perSpecialist } });
  }
  const flat = yieldHook('cityFlat', state, ruleset, city.faction, { city }, effects);
  if (Object.keys(flat).length) sources.push({ step: 2, kind: 'effects', yields: add(zero(), flat) });

  const subtotal = zero();
  for (const s of sources) add(subtotal, s.yields);

  // 3. Percentages, last, on everything above.
  const percent = add(zero(), yieldHook('cityPercent', state, ruleset, city.faction, { city }, effects));
  const amenities = state.owner ? amenitiesFor(state, ruleset, city.faction)[city.id] : null;
  const mood = amenities?.threshold?.yieldPercent ?? 0;
  const total = zero();
  for (const y of YIELD_NAMES) {
    // Unhappiness cuts output, but never eats into the food citizens need.
    const p = percent[y] + (y === 'food' && mood < 0 ? 0 : mood);
    total[y] = subtotal[y] + (subtotal[y] * p) / 100;
    if (p) sources.push({ step: 3, kind: 'percent', percent: p, yields: { ...zero(), [y]: (subtotal[y] * p) / 100 } });
  }
  const eaten = city.pop * (tuning.foodPerCitizen ?? 2);
  return { sources, total, eaten, surplus: total.food - eaten, amenities };
}
