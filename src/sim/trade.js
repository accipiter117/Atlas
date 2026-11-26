// Trade (section 3.9).
//
// A trader in one of your cities sets up a route to another city, yours or a
// rival's you have met and are not at war with, within landRange hexes over
// land or seaRange over water (both cities on the coast). The trader becomes
// the route: for routeTurns turns the origin gains yields by the tables in
// trade.json (domestic routes feed it, foreign ones pay it, plus a little per
// kind of resource the destination works) and the destination gains a smaller
// share. A road is laid along a land route at once. When the route ends, or
// war breaks out with the destination's owner, the trader comes home to be
// sent again. Routes also carry religious pressure (religion.js).
//
// Every number lives in tuning.trade and trade.json.

import { currentFactionId } from './queries.js';
import { neighbourCache } from './map.js';
import { atWar, hasMet } from './diplomacy.js';
import { createUnit, canStand } from './units.js';
import { yieldHook, effectsFor } from './effects/index.js';

const tun = (ruleset) => ruleset?.tuning?.trade ?? {};
const refuse = (code, message) => ({ code, message });

export const emptyTrade = () => ({ routes: [], nextRoute: 1 });
const trade = (state) => (state.trade ??= emptyTrade());

const isWater = (state, ruleset, t) => ruleset.terrain[state.map.terrainIds[state.map.terrain[t]]]?.water === true;
const isLand = (state, ruleset, t) => { const tr = ruleset.terrain[state.map.terrainIds[state.map.terrain[t]]]; return tr && !tr.water && !tr.impassable; };

/** Shortest path (breadth first) from a to b over allowed tiles, at most max steps; null if none. */
function bfs(state, a, b, ok, max) {
  const nbs = neighbourCache(state.map);
  const prev = new Map([[a, -1]]);
  let frontier = [a];
  for (let d = 0; d < max && frontier.length; d += 1) {
    const next = [];
    for (const t of frontier) {
      for (const j of nbs[t]) {
        if (j < 0 || prev.has(j)) continue;
        if (j !== b && !ok(j)) continue;
        prev.set(j, t);
        if (j === b) {
          const path = [];
          for (let k = b; k !== -1; k = prev.get(k)) path.push(k);
          return path.reverse();
        }
        next.push(j);
      }
    }
    frontier = next;
  }
  return null;
}

const coastal = (state, ruleset, tile) => neighbourCache(state.map)[tile].some((j) => j >= 0 && isWater(state, ruleset, j));

/** How a route between two cities would run: { domain, path } (land preferred), or null. */
export function routePath(state, ruleset, origin, dest) {
  const t = tun(ruleset);
  const land = bfs(state, origin.tile, dest.tile, (j) => isLand(state, ruleset, j), t.landRange ?? 15);
  if (land) return { domain: 'land', path: land };
  if (coastal(state, ruleset, origin.tile) && coastal(state, ruleset, dest.tile)) {
    const sea = bfs(state, origin.tile, dest.tile, (j) => isWater(state, ruleset, j), t.seaRange ?? 30);
    if (sea) return { domain: 'sea', path: sea };
  }
  return null;
}

/** Tiles within a few hexes of a tile (a city's land never reaches further), cached per map. */
const nearCache = new WeakMap();
function nearTiles(map, tile, radius = 6) {
  let byTile = nearCache.get(map);
  if (!byTile) { byTile = new Map(); nearCache.set(map, byTile); }
  let list = byTile.get(tile);
  if (!list) {
    const nbs = neighbourCache(map);
    const seen = new Set([tile]);
    let frontier = [tile];
    for (let d = 0; d < radius; d += 1) {
      const next = [];
      for (const t of frontier) for (const j of nbs[t]) if (j >= 0 && !seen.has(j)) { seen.add(j); next.push(j); }
      frontier = next;
    }
    list = [...seen];
    byTile.set(tile, list);
  }
  return list;
}

/** Kinds of improved luxury and strategic resource worked by a city's land. */
export function cityResourceKinds(state, ruleset, city) {
  const map = state.map;
  const kinds = new Set();
  for (const i of nearTiles(map, city.tile)) {
    if (state.owner[i] !== city.id || map.resource[i] < 0 || !map.improvement || map.improvement[i] < 0) continue;
    const id = map.resourceIds[map.resource[i]];
    const res = ruleset.resources[id];
    if (res && res.class !== 'bonus' && map.improvementIds[map.improvement[i]] === res.improvement) kinds.add(id);
  }
  return kinds.size;
}

const tableFor = (ruleset, kind, domain) => Object.values(ruleset.trade ?? {}).find((x) => x.kind === kind && x.domain === domain) ?? null;

/** What a route gives each end: { origin: yields, dest: yields }. originEffects: the origin faction's effects, if already worked out. */
export function routeYields(state, ruleset, route, originEffects = null) {
  const table = tableFor(ruleset, route.kind, route.domain);
  const origin = { ...(table?.originYields ?? {}) };
  const dest = { ...(table?.destinationYields ?? {}) };
  const destCity = state.cities?.[route.dest];
  const n = destCity ? cityResourceKinds(state, ruleset, destCity) : 0;
  for (const [y, a] of Object.entries(table?.perResource ?? {})) origin[y] = (origin[y] ?? 0) + a * n;
  const originCity = state.cities?.[route.origin];
  if (originCity) {
    const extra = yieldHook('tradeRoute', state, ruleset, originCity.faction, { city: originCity, route }, originEffects ?? effectsFor(state, ruleset, originCity.faction));
    for (const [y, a] of Object.entries(extra)) origin[y] = (origin[y] ?? 0) + a;
  }
  return { origin, dest };
}

/** A would-be route from a city to another, for the screen and the AI: { kind, domain, path, origin, dest } or null. */
export function previewRoute(state, ruleset, originId, destId) {
  const o = state.cities?.[originId];
  const d = state.cities?.[destId];
  if (!o || !d || o.id === d.id) return null;
  const how = routePath(state, ruleset, o, d);
  if (!how) return null;
  const route = { origin: o.id, dest: d.id, kind: o.faction === d.faction ? 'domestic' : 'foreign', domain: how.domain, path: how.path };
  return { ...route, ...routeYields(state, ruleset, route) };
}

/** Trade yields a city gets from every route that starts or ends there. effects: the city owner's effects, if known. */
export function cityTradeYields(state, ruleset, city, effects = null) {
  const out = {};
  for (const r of state.trade?.routes ?? []) {
    if (r.origin !== city.id && r.dest !== city.id) continue;
    const y = routeYields(state, ruleset, r, r.origin === city.id ? effects : null);
    for (const [k, v] of Object.entries(r.origin === city.id ? y.origin : y.dest)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

export const routesFrom = (state, cityId) => (state.trade?.routes ?? []).filter((r) => r.origin === cityId);

/** Why a trader in `unitId` cannot start a route to `destId` (a code), or null. */
export function routeProblem(state, ruleset, factionId, unitId, destId) {
  const unit = state.units?.[unitId];
  if (!unit || unit.faction !== factionId) return 'notYourUnit';
  if (!(ruleset.units[unit.type]?.tags ?? []).includes('trader')) return 'notTrader';
  const origin = Object.values(state.cities ?? {}).find((c) => c.tile === unit.tile && c.faction === factionId);
  if (!origin) return 'traderNotInCity';
  const dest = state.cities?.[destId];
  if (!dest || dest.id === origin.id) return 'noSuchCity';
  if (dest.faction !== factionId && (!hasMet(state, factionId, dest.faction) || atWar(state, factionId, dest.faction))) return 'cannotTradeWith';
  if (routesFrom(state, origin.id).some((r) => r.dest === dest.id)) return 'routeExists';
  if (routesFrom(state, origin.id).length >= (tun(ruleset).routesPerCity ?? 3)) return 'tooManyRoutes';
  if (!routePath(state, ruleset, origin, dest)) return 'outOfRange';
  return null;
}

export const startTradeRoute = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const p = routeProblem(state, ruleset, cmd.faction, cmd.unit, cmd.city);
    return p ? refuse(p, 'That trade route cannot be made') : null;
  },
  apply(state, cmd, events, ruleset) {
    const unit = state.units[cmd.unit];
    const origin = Object.values(state.cities).find((c) => c.tile === unit.tile && c.faction === cmd.faction);
    const dest = state.cities[cmd.city];
    const how = routePath(state, ruleset, origin, dest);
    const t = trade(state);
    const route = { id: `r${t.nextRoute++}`, faction: cmd.faction, origin: origin.id, dest: dest.id, kind: origin.faction === dest.faction ? 'domestic' : 'foreign',
      domain: how.domain, path: how.path, until: state.turn + (tun(ruleset).routeTurns ?? 30), unitType: unit.type };
    t.routes.push(route);
    delete state.units[unit.id];
    // A road along a land route, at once.
    if (how.domain === 'land' && tun(ruleset).roads !== false && state.map.road) for (const tile of how.path) state.map.road[tile] = 1;
    events.push({ type: 'tradeRouteStarted', route: route.id, faction: cmd.faction, origin: origin.id, dest: dest.id, destFaction: dest.faction, domain: how.domain });
  },
};

/** Start of a faction's turn: its finished or broken routes end and the traders come home. */
export function startTradeTurn(state, ruleset, factionId, events) {
  const t = state.trade;
  if (!t?.routes.length) return;
  const ending = t.routes.filter((r) => r.faction === factionId && (state.turn >= r.until || !state.cities[r.origin] || state.cities[r.origin].faction !== factionId
    || !state.cities[r.dest] || atWar(state, factionId, state.cities[r.dest].faction)));
  if (!ending.length) return;
  t.routes = t.routes.filter((r) => !ending.includes(r));
  for (const r of ending) {
    const home = state.cities[r.origin];
    let unit = null;
    if (home && home.faction === factionId) {
      const spots = [home.tile, ...neighbourCache(state.map)[home.tile].filter((j) => j >= 0)];
      const spot = spots.find((s) => canStand(state, ruleset, r.unitType, factionId, s));
      if (spot !== undefined) unit = createUnit(state, ruleset, r.unitType, factionId, spot);
    }
    events.push({ type: 'tradeRouteEnded', route: r.id, faction: factionId, origin: r.origin, dest: r.dest, unit: unit?.id ?? null });
  }
}
