// Movement and pathfinding (section 3.5).
//
// Rules, all read from data:
//   - entering a tile costs its terrain's moveCost, +1 for hills (tuning),
//     plus the feature's extra cost (forest 2 means +1); a road on both ends
//     costs roadCost instead
//   - crossing a river edge uses all remaining movement (until bridges exist)
//   - a unit with full movement may always move one tile, however costly
//   - entering a tile next to an enemy combat unit ends movement (zone of
//     control), unless the unit's class has ignoresZoc
//   - one combat unit and one civilian per tile; never into an enemy's tile
//   - land units stay on land, ships on water, nobody enters impassable tiles
// Paths are planned with A* over the tiles the faction has explored, and come
// back as per-turn waypoints so the screen can show "2" where turn 2 ends.

import { hexDistance } from '../core/hex.js';
import { neighbourCache, tileHex } from './map.js';
import { domainOf, slotOf, unitsAt, isEnemy, unitClass, maxMoves } from './units.js';

function terrainAt(state, ruleset, t) {
  return ruleset.terrain[state.map.terrainIds[state.map.terrain[t]]];
}

/** Can this kind of unit ever be on this tile (terrain and domain only)? */
export function passable(state, ruleset, typeId, t) {
  const terrain = terrainAt(state, ruleset, t);
  if (!terrain || terrain.impassable) return false;
  const domain = domainOf(ruleset, typeId);
  return domain === 'sea' ? terrain.water === true : terrain.water !== true;
}

/** Movement points to enter tile `to` from neighbouring tile `from`, and whether it crosses a river. */
export function enterCost(state, ruleset, from, to) {
  const map = state.map;
  const tun = ruleset.tuning?.movement ?? {};
  const terrain = terrainAt(state, ruleset, to);
  const d = neighbourCache(map)[from].indexOf(to);
  const river = d >= 0 && (map.river[from] & (1 << d)) !== 0;
  if (map.road && map.road[from] && map.road[to] && !river) return { cost: tun.roadCost ?? 0.5, river: false };
  let cost = terrain.moveCost ?? 1;
  if (map.hills[to]) cost += tun.hillsExtraCost ?? 1;
  const f = map.feature[to] >= 0 ? ruleset.features[map.featureIds[map.feature[to]]] : null;
  if (f?.moveCost > 1) cost += f.moveCost - 1;
  return { cost, river };
}

/** Is tile `t` next to a combat unit hostile to `factionId`? `seen` limits it to units the faction can see. */
export function inEnemyZoc(state, ruleset, factionId, t, seen = null) {
  for (const j of neighbourCache(state.map)[t]) {
    if (j < 0 || (seen && !seen(j))) continue;
    for (const u of unitsAt(state, j)) {
      if (isEnemy(state, factionId, u.faction) && slotOf(ruleset, u.type) !== 'civilian') return true;
    }
  }
  return false;
}

/**
 * One step: from `from` with `moves` left (of `full`), into neighbour `to`.
 * Returns the moves left afterwards, or null if the step is not possible now
 * (not enough movement and not at full movement).
 */
export function stepMoves(state, ruleset, unit, from, to, moves, full, seen = null) {
  const { cost, river } = enterCost(state, ruleset, from, to);
  const endsByRiver = river && (ruleset.tuning?.movement?.riverCrossingEndsMove ?? true);
  if (moves <= 0) return null;
  if (!endsByRiver && moves < cost && moves < full) return null;
  let left = endsByRiver ? 0 : Math.max(0, moves - cost);
  if (!unitClass(ruleset, unit).ignoresZoc && inEnemyZoc(state, ruleset, unit.faction, to, seen)) left = 0;
  return left;
}

/** May the unit end a turn (or its move) on tile t? Own units of the other slot are fine. */
export function canStop(state, ruleset, unit, t, seen = null) {
  const slot = slotOf(ruleset, unit.type);
  for (const u of unitsAt(state, t)) {
    if (u.id === unit.id) continue;
    if (seen && !seen(t)) continue;
    if (u.faction !== unit.faction || slotOf(ruleset, u.type) === slot) return false;
  }
  return true;
}

/** May the unit pass through tile t (no enemy unit it knows about)? */
function canPass(state, unit, t, seen) {
  if (seen && !seen(t)) return true;
  for (const u of unitsAt(state, t)) if (u.faction !== unit.faction) return false;
  return true;
}

class Heap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (Heap.less(a[p], a[i])) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && Heap.less(a[l], a[m])) m = l;
        if (r < a.length && Heap.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  static less(x, y) {
    return x.f < y.f || (x.f === y.f && x.tile < y.tile);
  }
}

/**
 * Plan a path for a unit to `target`.
 * `known(t)` says whether the faction has explored tile t; `seen(t)` whether it can see it now.
 * Returns null if there is no way, else { tiles, turns, ends } where turns[k] is the turn
 * (0 = this one) on which tiles[k] is reached and ends lists the tiles where a turn ends.
 */
export function findPath(state, ruleset, unit, target, { known = null, seen = null } = {}) {
  const map = state.map;
  const nbs = neighbourCache(map);
  const full = maxMoves(ruleset, unit);
  const start = unit.tile;
  if (target === start || target < 0 || target >= map.width * map.height) return null;
  if (known && !known(target)) return null;
  if (!passable(state, ruleset, unit.type, target) || !canStop(state, ruleset, unit, target, seen) || !canPass(state, unit, target, seen)) return null;
  const goal = tileHex(map, target);
  const h = (t) => hexDistance(tileHex(map, t), goal) * 0.5 / full;
  const best = new Map();
  const heap = new Heap();
  const first = { tile: start, turn: 0, moves: unit.moves, parent: null };
  first.f = h(start);
  best.set(start, first);
  heap.push(first);
  const better = (a, b) => a.turn < b.turn || (a.turn === b.turn && a.moves > b.moves);
  let found = null;
  let expanded = 0;
  while (heap.size && expanded < 20000) {
    const cur = heap.pop();
    if (best.get(cur.tile) !== cur) continue;
    if (cur.tile === target) { found = cur; break; }
    expanded += 1;
    for (const j of nbs[cur.tile]) {
      if (j < 0 || (known && !known(j)) || !passable(state, ruleset, unit.type, j) || !canPass(state, unit, j, seen)) continue;
      let turn = cur.turn;
      let moves = cur.moves;
      let left = moves > 0 ? stepMoves(state, ruleset, unit, cur.tile, j, moves, full, seen) : null;
      if (left === null) {
        // Wait here for next turn, which needs a tile the unit may stop on.
        if (cur.tile !== start && !canStop(state, ruleset, unit, cur.tile, seen)) continue;
        turn += 1;
        moves = full;
        left = stepMoves(state, ruleset, unit, cur.tile, j, moves, full, seen);
        if (left === null) continue;
      }
      const label = { tile: j, turn, moves: left, parent: cur };
      const old = best.get(j);
      if (old && !better(label, old)) continue;
      label.f = turn + (1 - left / full) + h(j);
      best.set(j, label);
      heap.push(label);
    }
  }
  if (!found) return null;
  const chain = [];
  for (let n = found; n; n = n.parent) chain.push(n);
  chain.reverse();
  const tiles = chain.slice(1).map((n) => n.tile);
  const turns = chain.slice(1).map((n) => n.turn);
  const ends = [];
  for (let k = 0; k < chain.length - 1; k += 1) {
    if (chain[k + 1].turn > chain[k].turn && k > 0) ends.push(chain[k].tile);
  }
  ends.push(target);
  return { tiles, turns, ends, arrivesOnTurn: found.turn };
}
