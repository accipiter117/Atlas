// Expansion planner: where settlers should go. Every few turns it scores
// every hex the faction could found a city on (only hexes whose whole
// neighbourhood has been explored, so no hidden city can be too close) and
// keeps the best few.

import { foundingProblem } from '../../sim/index.js';
import { weightsOf, siteScore, dist } from '../evaluate.js';

/** Is every hex closer than the minimum city distance explored (so no hidden city can be too close)? */
export function surroundingsKnown(view, ruleset, t) {
  const map = view.map;
  const fog = view.fog;
  const minDist = ruleset.tuning?.cities?.minCityDistance ?? 4;
  const r = Math.floor(t / map.width);
  for (let rr = Math.max(0, r - minDist); rr <= Math.min(map.height - 1, r + minDist); rr += 1) {
    for (let c = 0; c < map.width; c += 1) {
      const i = rr * map.width + c;
      if (fog[i] === 0 && dist(map, t, i) < minDist) return false;
    }
  }
  return true;
}

export function scanSites(world, view, ruleset, memory) {
  const w = weightsOf(ruleset, 'expansion');
  if (memory.sites && view.turn - (memory.sitesTurn ?? -99) < (w.rescanEvery ?? 5)) return memory.sites;
  const fog = view.fog;
  const capital = view.cities.find((c) => c.faction === view.me && c.capital)?.tile ?? null;
  const sites = [];
  const map = view.map;
  for (let t = 0; t < fog.length; t += 1) {
    if (fog[t] === 0 || map.terrain[t] < 0) continue;
    if (foundingProblem(world, ruleset, view.me, t)) continue;
    if (!surroundingsKnown(view, ruleset, t)) continue;
    sites.push({ tile: t, score: siteScore(world, ruleset, t, capital, w) });
  }
  sites.sort((a, b) => b.score - a.score || a.tile - b.tile);
  memory.sites = sites.slice(0, 30);
  memory.sitesTurn = view.turn;
  return memory.sites;
}
