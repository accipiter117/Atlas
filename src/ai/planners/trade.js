// Trade planner (phase 14, section 3.9): how many traders to keep, and where
// each one goes: every reachable city (own, or a rival's at peace), valued by
// what the route brings each end we own, by the category weights. Numbers in
// ai/weights.json ("trade").

import { previewRoute, routeProblem } from '../../sim/index.js';
import { categoryWeight, weightsOf } from '../evaluate.js';

const YIELDS = ['food', 'production', 'gold', 'science', 'culture', 'faith'];

function routeValue(view, ruleset, memory, p) {
  let v = 0;
  for (const y of YIELDS) v += (p.origin[y] ?? 0) * categoryWeight(ruleset, view, memory, y);
  // Domestic routes help our other city too.
  if (p.kind === 'domestic') for (const y of YIELDS) v += (p.dest[y] ?? 0) * categoryWeight(ruleset, view, memory, y);
  return v;
}

/** Destinations for a trader, best first: [{ city, value, preview }]. */
export function rankRoutes(world, view, ruleset, memory, unit) {
  const origin = view.cities.find((c) => c.tile === unit.tile && c.faction === view.me);
  if (!origin) return [];
  const out = [];
  for (const c of view.cities) {
    if (routeProblem(world, ruleset, view.me, unit.id, c.id)) continue;
    const p = previewRoute(world, ruleset, origin.id, c.id);
    if (p) out.push({ city: c, value: routeValue(view, ruleset, memory, p), preview: p });
  }
  return out.sort((a, b) => b.value - a.value || (a.city.id < b.city.id ? -1 : 1));
}

/** How many traders and routes the AI wants in all. */
export function wantedTraders(ruleset, view) {
  const w = weightsOf(ruleset, 'trade');
  const cities = view.cities.filter((c) => c.faction === view.me).length;
  return Math.max(cities > 1 ? 1 : 0, Math.floor(cities * (w.tradersPerCity ?? 0.5)));
}

/** A trader's move: start the best route from here, or go to the city with the best one. */
export function traderMove(world, view, ruleset, memory, unit, move) {
  const ranked = rankRoutes(world, view, ruleset, memory, unit);
  if (ranked.length) {
    const best = ranked[0];
    return { cmd: { type: 'startTradeRoute', faction: view.me, unit: unit.id, city: best.city.id }, score: best.value, reasonKey: 'ai.reason.tradeRoute', params: { city: best.city.name } };
  }
  const home = view.cities.filter((c) => c.faction === view.me && c.tile !== unit.tile)
    .sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1))[0];
  return home ? move(view, unit, home.tile, 'ai.reason.toTradeCity', { city: home.name }, 1) : null;
}
