// The AI's front door. Until the real planners arrive (phase 8) this is a
// simple rule-based player, enough for test games: settlers found a city
// where they stand if allowed, or walk to the best nearby spot; cities with
// nothing to build pick a settler, a warrior or a scout; everyone else
// fortifies. Like every AI to come, it sees only view(state, faction) and
// answers with ordinary commands; any it gets wrong are simply refused.

import { foundingProblem, buildOptions, tileYields, findPath, UNEXPLORED, VISIBLE } from '../sim/index.js';
import { hexDistance } from '../core/hex.js';
import { tileHex } from '../sim/index.js';

/** A state-shaped object made only from what the faction knows. */
function known(view) {
  return {
    map: view.map,
    units: Object.fromEntries(view.units.map((u) => [u.id, u])),
    cities: Object.fromEntries(view.cities.map((c) => [c.id, c])),
    owner: view.map.owner,
    factions: view.factions,
    turn: view.turn,
  };
}

function siteScore(world, ruleset, tile) {
  let food = 0;
  const here = tileHex(world.map, tile);
  for (let i = 0; i < world.map.terrain.length; i += 1) {
    if (world.map.terrain[i] < 0) continue;
    if (hexDistance(here, tileHex(world.map, i)) > 2) continue;
    const y = tileYields(world, ruleset, i);
    food += y.food * 2 + y.production;
  }
  return food + (world.map.river[tile] ? 4 : 0);
}

/** Commands an AI faction issues on its turn, given only its view and the rules. */
export function takeTurn(view, ruleset) {
  const me = view.me;
  const out = [];
  if (!ruleset || !view.map) return [{ type: 'endTurn', faction: me }];
  const world = known(view);
  const fog = view.fog;
  const mine = view.units.filter((u) => u.faction === me);
  const myCities = view.cities.filter((c) => c.faction === me);

  for (const u of mine) {
    const def = ruleset.units[u.type];
    if ((def.tags ?? []).includes('founder') && u.moves > 0) {
      if (!foundingProblem(world, ruleset, me, u.tile)) { out.push({ type: 'foundCity', faction: me, unit: u.id }); continue; }
      // Walk to the best reachable site within six hexes.
      const here = tileHex(world.map, u.tile);
      let best = null;
      for (let i = 0; i < fog.length; i += 1) {
        if (fog[i] === UNEXPLORED || hexDistance(here, tileHex(world.map, i)) > 6) continue;
        if (foundingProblem(world, ruleset, me, i)) continue;
        const score = siteScore(world, ruleset, i) - hexDistance(here, tileHex(world.map, i)) * 2;
        if (!best || score > best.score) best = { tile: i, score };
      }
      if (best && findPath(world, ruleset, u, best.tile, { known: (t) => fog[t] !== UNEXPLORED, seen: (t) => fog[t] === VISIBLE })) {
        out.push({ type: 'moveUnit', faction: me, unit: u.id, to: best.tile });
      }
    } else if (u.activity === 'none' && u.goto === null && ruleset.unitClasses[def.class]?.civilian !== true) {
      out.push({ type: 'fortify', faction: me, unit: u.id });
    } else if (u.activity === 'none' && u.goto === null) {
      out.push({ type: 'sleep', faction: me, unit: u.id });
    }
  }

  const settlers = mine.filter((u) => (ruleset.units[u.type].tags ?? []).includes('founder')).length;
  const warriors = mine.filter((u) => ruleset.unitClasses[ruleset.units[u.type].class]?.civilian !== true).length;
  for (const c of myCities) {
    if (c.queue.length) continue;
    const options = buildOptions(world, ruleset, c).filter((o) => o.kind === 'unit');
    const has = (id) => options.some((o) => o.id === id);
    let pick;
    if (myCities.length + settlers < 4 && c.pop >= 2 && has('settler')) pick = 'settler';
    else if (warriors < myCities.length + 1 && has('warrior')) pick = 'warrior';
    else pick = has('scout') ? 'scout' : options[0]?.id;
    if (pick) out.push({ type: 'setProduction', faction: me, city: c.id, item: { kind: 'unit', id: pick } });
  }

  out.push({ type: 'endTurn', faction: me });
  return out;
}
