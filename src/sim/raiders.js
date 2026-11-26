// Raiders, the barbarians of section 6 (setup option raiders: off, on, raging).
//
// At the end of each round: now and then a camp appears on land nobody can
// see, away from every city; each camp sends out a raider every few turns
// (warriors at first, archers and horsemen later); raiders go for the
// nearest unit or city within aggroRange and attack it, otherwise they stay
// near their camp. A unit that walks into an empty camp clears it for gold.
// Every choice uses the game's seeded dice, so raids replay exactly.

import { random } from '../core/rng.js';
import { neighbourCache } from './map.js';
import { distance } from './borders.js';
import { createUnit, unitsAt, canStand } from './units.js';
import { findPath } from './movement.js';
import { attackProblem, buildSpec, combatKind, defenderAt } from './combat.js';
import { VISIBLE } from './visibility.js';

export const RAIDERS = 'raiders';

export function raidersOn(state) {
  return state.setup?.raiders === 'on' || state.setup?.raiders === 'raging';
}

/** Clear a camp if a non-raider fighting unit stands on it now. */
export function clearCampAt(state, ruleset, unit, tile, events) {
  if (!state.raiders?.camps?.[tile] || unit.faction === RAIDERS || combatKind(ruleset, unit) === 'none') return;
  if (unitsAt(state, tile).some((u) => u.faction === RAIDERS)) return;
  delete state.raiders.camps[tile];
  const gold = ruleset.tuning?.raiders?.campGold ?? 30;
  const f = state.factions.find((x) => x.id === unit.faction);
  if (f?.stocks) f.stocks.gold += gold;
  events.push({ type: 'campCleared', tile, faction: unit.faction, gold });
}

function landTiles(state, ruleset) {
  const out = [];
  const map = state.map;
  for (let i = 0; i < map.terrain.length; i += 1) {
    const t = ruleset.terrain[map.terrainIds[map.terrain[i]]];
    if (t && !t.water && !t.impassable) out.push(i);
  }
  return out;
}

function spawnCamp(state, ruleset, events) {
  const r = ruleset.tuning.raiders;
  const cities = Object.values(state.cities ?? {});
  const seenByAnyone = (t) => Object.values(state.fog ?? {}).some((f) => f[t] === VISIBLE);
  const options = landTiles(state, ruleset).filter((t) => state.owner[t] === null && !seenByAnyone(t) && !state.raiders.camps[t]
    && !unitsAt(state, t).length && cities.every((c) => distance(state.map, c.tile, t) >= (r.campDistance ?? 6)));
  if (!options.length) return;
  const tile = options[Math.floor(random(state) * options.length)];
  state.raiders.camps[tile] = { founded: state.turn, age: 0 };
  events.push({ type: 'campAppeared', tile });
}

function raiderType(state, ruleset) {
  let type = 'warrior';
  for (const u of ruleset.tuning.raiders.units ?? []) if (state.turn >= u.fromTurn && ruleset.units[u.unit]) type = u.unit;
  return type;
}

/** Move and fight one raider (working copy). */
function actRaider(state, ruleset, unit, events, runBattle) {
  const r = ruleset.tuning.raiders;
  const range = r.aggroRange ?? 4;
  const targets = [];
  for (const u of Object.values(state.units)) if (u.faction !== RAIDERS && distance(state.map, unit.tile, u.tile) <= range) targets.push(u.tile);
  for (const c of Object.values(state.cities ?? {})) if (distance(state.map, unit.tile, c.tile) <= range) targets.push(c.tile);
  targets.sort((a, b) => distance(state.map, unit.tile, a) - distance(state.map, unit.tile, b) || a - b);
  const target = targets[0];
  if (target === undefined) {
    // Nothing near: drift back towards the nearest camp.
    const camps = Object.keys(state.raiders.camps).map(Number).sort((a, b) => distance(state.map, unit.tile, a) - distance(state.map, unit.tile, b) || a - b);
    if (camps.length && distance(state.map, unit.tile, camps[0]) > 2) walkTowards(state, ruleset, unit, camps[0]);
    return;
  }
  if (attackProblem(state, ruleset, unit, target) !== null) walkTowards(state, ruleset, unit, target);
  if (state.units[unit.id] && attackProblem(state, ruleset, unit, target) === null) {
    // Only civilians there: the raiders carry them off.
    const city = Object.values(state.cities ?? {}).find((c) => c.tile === target);
    if (!city && !defenderAt(state, ruleset, unit.faction, target)) {
      for (const u of unitsAt(state, target)) {
        if (u.faction === RAIDERS) continue;
        delete state.units[u.id];
        events.push({ type: 'unitKilled', unit: u.id, unitType: u.type, faction: u.faction, tile: target, by: RAIDERS });
      }
      unit.tile = target;
      unit.moves = 0;
      return;
    }
    const spec = buildSpec(state, ruleset, unit, target);
    spec.from = unit.tile;
    // Raiders never take cities: they wound units and batter walls.
    if (spec.kind === 'city') {
      const city = state.cities[spec.defender.city.ref];
      if ((city.hp ?? 1) <= 1) return;
    }
    runBattle(state, ruleset, spec, events, { forceAuto: true });
    if (city && city.hp === 0) city.hp = 1;
    if (state.pendingCapture?.faction === RAIDERS) state.pendingCapture = null;
  }
}

function walkTowards(state, ruleset, unit, goal) {
  const nbs = neighbourCache(state.map);
  let best = null;
  for (const j of nbs[goal]) {
    if (j < 0 || !canStand(state, ruleset, unit.type, unit.faction, j, unit.id)) continue;
    const plan = j === unit.tile ? { tiles: [] } : findPath(state, ruleset, unit, j);
    if (plan && (!best || plan.tiles.length < best.tiles.length)) best = { tiles: plan.tiles };
  }
  if (!best) return;
  for (const t of best.tiles) {
    if (unit.moves <= 0 || !canStand(state, ruleset, unit.type, unit.faction, t, unit.id)) break;
    unit.tile = t;
    unit.moves -= 1;
  }
}

/** End of round: camps appear, camps send out raiders, raiders act and heal. */
export function runRaiders(state, ruleset, events, runBattle) {
  if (!raidersOn(state) || !state.map || !ruleset.tuning?.raiders) return;
  const r = ruleset.tuning.raiders;
  const raging = state.setup.raiders === 'raging' ? 2 : 1;
  state.raiders ??= { camps: {}, lastCamp: 0 };
  const maxCamps = Math.max(1, Math.floor(landTiles(state, ruleset).length / (r.campsPerLand ?? 250))) * raging;
  if (state.turn >= (r.firstCampTurn ?? 6) && state.turn - state.raiders.lastCamp >= Math.ceil((r.campEvery ?? 10) / raging)
    && Object.keys(state.raiders.camps).length < maxCamps) {
    spawnCamp(state, ruleset, events);
    state.raiders.lastCamp = state.turn;
  }
  for (const [key, camp] of Object.entries(state.raiders.camps)) {
    const tile = Number(key);
    camp.age += 1;
    const near = Object.values(state.units).filter((u) => u.faction === RAIDERS && distance(state.map, u.tile, tile) <= 3).length;
    if (camp.age % Math.ceil((r.spawnEvery ?? 6) / raging) === 0 && near < (r.maxPerCamp ?? 2)) {
      const type = raiderType(state, ruleset);
      const spot = [tile, ...neighbourCache(state.map)[tile].filter((j) => j >= 0)].find((t) => canStand(state, ruleset, type, RAIDERS, t));
      if (spot !== undefined) {
        const u = createUnit(state, ruleset, type, RAIDERS, spot);
        events.push({ type: 'raiderAppeared', unit: u.id, tile: spot });
      }
    }
  }
  const raiders = Object.values(state.units).filter((u) => u.faction === RAIDERS).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const unit of raiders) {
    if (!state.units[unit.id]) continue;
    unit.moves = ruleset.units[unit.type].moves;
    if (unit.hp < 100 && !unit.acted) unit.hp = Math.min(100, unit.hp + (ruleset.tuning?.healing?.neutral ?? 10));
    unit.acted = false;
    actRaider(state, ruleset, unit, events, runBattle);
  }
}
