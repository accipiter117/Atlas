// Yields (section 3.3), all computed in one place, in one order:
//   1. tiles: every worked tile (terrain + hills + feature + resource +
//      improvement, plus tile effects such as Egypt's floodplain food), with
//      the city centre raised to its minimum
//   2. flat bonuses: the city's own culture, buildings, specialists, trade
//      routes, policies and traits that add a fixed amount
//   3. percentage bonuses, last, so a +10% applies to everything above
// Later systems add their sources to steps 2 and 3; nothing else changes.

export const YIELD_NAMES = Object.freeze(['food', 'production', 'gold', 'science', 'culture', 'faith']);

export const zero = () => ({ food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 });

function add(into, from, k = 1) {
  for (const y of YIELD_NAMES) if (from?.[y]) into[y] += from[y] * k;
  return into;
}

/** Effects that apply to a faction: its civilisation's trait and its leader's trait. */
export function factionEffects(state, ruleset, factionId) {
  const f = state.factions.find((x) => x.id === factionId);
  const civ = f?.civ ? ruleset.factions?.[f.civ] : null;
  const leader = civ?.leaders?.[0] ? ruleset.leaders?.[civ.leaders[0]] : null;
  return [...(civ?.trait?.effects ?? []), ...(leader?.trait?.effects ?? [])];
}

/** What one tile yields to whoever works it, before any city-wide bonus. */
export function tileYields(state, ruleset, tile, effects = []) {
  const map = state.map;
  const out = zero();
  const terrainId = map.terrainIds[map.terrain[tile]];
  const terrain = ruleset.terrain[terrainId];
  add(out, terrain?.yields);
  if (map.hills[tile]) out.production += ruleset.tuning?.yields?.hillsProduction ?? 1;
  const featureId = map.feature[tile] >= 0 ? map.featureIds[map.feature[tile]] : null;
  if (featureId) add(out, ruleset.features[featureId]?.yields);
  const resourceId = map.resource[tile] >= 0 ? map.resourceIds[map.resource[tile]] : null;
  if (resourceId) add(out, ruleset.resources[resourceId]?.yields);
  const improvementId = map.improvement?.[tile] ? map.improvementIds?.[map.improvement[tile]] : null;
  if (improvementId) add(out, ruleset.improvements?.[improvementId]?.yields);
  for (const e of effects) {
    if (e.effect !== 'tileYield') continue;
    if (e.terrain && e.terrain !== terrainId) continue;
    if (e.feature && e.feature !== featureId) continue;
    if (e.resource && e.resource !== resourceId) continue;
    if (e.improvement && e.improvement !== improvementId) continue;
    out[e.yield] += e.amount;
  }
  return out;
}

function inScope(e, city) {
  const scope = e.scope ?? 'everyCity';
  return scope === 'everyCity' || (scope === 'capital' && city.capital);
}

/**
 * A city's yields with every source listed, in the documented order.
 * @returns {{ sources: Array<{step, kind, yields}>, total: object, eaten: number, surplus: number }}
 */
export function cityYields(state, ruleset, city) {
  const effects = factionEffects(state, ruleset, city.faction);
  const tuning = ruleset.tuning?.cities ?? {};
  const sources = [];

  // 1. Tiles.
  const tiles = zero();
  for (const t of [city.tile, ...city.worked]) {
    const y = tileYields(state, ruleset, t, effects);
    if (t === city.tile) {
      for (const [k, min] of Object.entries(tuning.centreMinimum ?? {})) y[k] = Math.max(y[k], min);
    }
    add(tiles, y);
  }
  sources.push({ step: 1, kind: 'tiles', yields: tiles });

  // 2. Flat bonuses.
  if (tuning.baseCulture) sources.push({ step: 2, kind: 'city', yields: { ...zero(), culture: tuning.baseCulture } });
  for (const b of city.buildings ?? []) {
    const def = ruleset.buildings?.[b];
    if (def?.yields) sources.push({ step: 2, kind: 'building', id: b, yields: add(zero(), def.yields) });
  }
  for (const e of effects) {
    if (e.effect === 'yieldBonus' && inScope(e, city)) sources.push({ step: 2, kind: 'trait', yields: { ...zero(), [e.yield]: e.amount } });
  }

  const subtotal = zero();
  for (const s of sources) add(subtotal, s.yields);

  // 3. Percentages, last, on everything above.
  const percent = zero();
  for (const e of effects) if (e.effect === 'yieldPercent' && inScope(e, city)) percent[e.yield] += e.amount;
  for (const p of city.yieldPercent ?? []) percent[p.yield] += p.amount;
  const total = zero();
  for (const y of YIELD_NAMES) {
    total[y] = subtotal[y] + (subtotal[y] * percent[y]) / 100;
    if (percent[y]) sources.push({ step: 3, kind: 'percent', yields: { ...zero(), [y]: (subtotal[y] * percent[y]) / 100 } });
  }
  const eaten = city.pop * (tuning.foodPerCitizen ?? 2);
  return { sources, total, eaten, surplus: total.food - eaten };
}
