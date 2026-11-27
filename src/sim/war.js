// Theatre rules, supply and war infrastructure (Killzone Extrasolar War K3; docs/KILLZONE.md
// section 3). Optional and data-driven, like the front line:
//
// Supply (tuning.supply.enabled). Bases, and improvements whose war block names a supply
// range (depots, landing bays, command posts), supply hexes within that many steps, but the
// supply only spreads through hexes your side holds (front control past the threshold), so a
// broken front cuts units off. A supply drop from orbit (K2) supplies an area for a turn. A
// unit out of supply loses health each turn, cannot heal and fights weaker; after a few
// turns cut off it surrenders. On a world with no front, everyone is supplied.
//
// War infrastructure: improvements with a "war" block, built by engineers anywhere your side
// holds (not only inside your borders), sometimes over several turns. What each does is
// data: defence (as any improvement), a zone of control even when empty, stopping whoever
// walks in, a free shot at the first enemy to stop beside it each turn, hidden mines, anti-air
// cover, armour against strikes, an arc that hits every enemy beside it, a battery that fires
// on its own when crewed, a landing bay, a supply source, healing, revealing mines. Who built
// a work is kept in map.works[tile] (made only when the first one is built, so other games
// never carry it).
//
// Theatre rules per world (worlds.theatre): storms some turns (shorter sight, no orbital
// strikes or drops), toxic ground for whoever lacks the gear, low gravity (extra moves for
// units with a tag), stations with no room for vehicles, and the rule for capturing a world:
// hold every key site (the station's reactor) with no enemy army or base left on it.

import { random } from '../core/rng.js';
import { atWar } from './diplomacy.js';
import { neighbourCache } from './map.js';
import { distance } from './borders.js';
import { activeWorld, multiWorld } from './worlds.js';
import { sideOf } from './frontline.js';

const supplyTun = (ruleset) => ruleset.tuning?.supply ?? {};
export const supplyOn = (ruleset) => supplyTun(ruleset).enabled === true;

// ---------- Works (war infrastructure) ----------

const impDef = (state, ruleset, tile) => {
  const i = state.map.improvement?.[tile];
  return i >= 0 ? ruleset.improvements?.[state.map.improvementIds[i]] ?? null : null;
};
/** The war infrastructure on a tile: { id, def, war, faction } or null. */
export function workAt(state, ruleset, tile) {
  const def = impDef(state, ruleset, tile);
  if (!def?.war) return null;
  return { id: state.map.improvementIds[state.map.improvement[tile]], def, war: def.war, faction: state.map.works?.[tile]?.faction ?? null };
}
const enemyWork = (state, ruleset, faction, tile) => {
  const w = workAt(state, ruleset, tile);
  return w && w.faction && atWar(state, faction, w.faction) ? w : null;
};

/** Record who built a work (placeImprovement calls this for improvements with a war block). */
export function noteWork(state, tile, faction) {
  state.map.works ??= {};
  state.map.works[tile] = { faction, fired: 0 };
}

function removeWork(state, tile) {
  state.map.improvement[tile] = -1;
  if (state.map.works) delete state.map.works[tile];
}

/** Can `faction` build war infrastructure here (its side holds the hex, or its own land)? null if so. */
export function workProblem(state, ruleset, faction, def, tile) {
  if (def.war?.faction && state.factions.find((f) => f.id === faction)?.civ !== def.war.faction) return 'notYourFaction';
  const owner = state.owner?.[tile];
  const ownLand = owner !== null && owner !== undefined && state.cities?.[owner]?.faction === faction;
  const control = state.frontline?.control?.[tile];
  const side = sideOf(state, ruleset, faction);
  const held = control === undefined ? ownLand : side === 0 ? control > 0 : control < 0;
  if (!held && !ownLand) return 'notHeld';
  if (Object.values(state.units ?? {}).some((u) => u.tile === tile && atWar(state, faction, u.faction))) return 'occupied';
  return null;
}

/**
 * A unit has just stepped onto `tile`. Mines go off, wire and trenches stop it.
 * Returns { stop, dead }.
 */
export function onEnter(state, ruleset, unit, tile, events) {
  if (!state.map.works) return { stop: false, dead: false };
  const here = enemyWork(state, ruleset, unit.faction, tile);
  if (here?.war.mineDamage) {
    unit.hp -= here.war.mineDamage;
    events.push({ type: 'mineExploded', unit: unit.id, faction: unit.faction, tile, damage: here.war.mineDamage, owner: here.faction });
    removeWork(state, tile);
    if (unit.hp <= 0) {
      delete state.units[unit.id];
      events.push({ type: 'unitKilled', unit: unit.id, unitType: unit.type, faction: unit.faction, tile });
      return { stop: true, dead: true };
    }
    return { stop: true, dead: false };
  }
  if (here?.war.stopsEntry) return { stop: true, dead: false };
  // A zone of control, even with nobody in it: entering beside an enemy trench ends the move.
  for (const j of [tile, ...neighbourCache(state.map)[tile]]) {
    if (j >= 0 && enemyWork(state, ruleset, unit.faction, j)?.war.zoc) return { stop: true, dead: false };
  }
  return { stop: false, dead: false };
}

/** A unit has ended a move: a machine gun nest beside it takes its free shot (once a turn). */
export function afterMove(state, ruleset, unit, events) {
  if (!state.map.works || !state.units[unit.id]) return;
  for (const j of neighbourCache(state.map)[unit.tile]) {
    if (j < 0) continue;
    const w = enemyWork(state, ruleset, unit.faction, j);
    if (!w?.war.freeShot || state.map.works[j].fired === state.turn) continue;
    state.map.works[j].fired = state.turn;
    unit.hp -= w.war.freeShot;
    events.push({ type: 'freeShot', tile: j, target: unit.id, damage: w.war.freeShot, faction: w.faction, targetFaction: unit.faction });
    if (unit.hp <= 0) {
      delete state.units[unit.id];
      events.push({ type: 'unitKilled', unit: unit.id, unitType: unit.type, faction: unit.faction, tile: unit.tile });
    }
    return;
  }
}

/** Enemy anti-air works within range of a hex (the space rules add anti-air units). */
export function antiAirWorksNear(state, ruleset, faction, tile) {
  if (!state.map.works) return false;
  for (const t of Object.keys(state.map.works)) {
    const w = enemyWork(state, ruleset, faction, Number(t));
    if (w?.war.antiAir && distance(state.map, Number(t), tile) <= w.war.antiAir) return true;
  }
  return false;
}

/** How much of a strike's damage a hex's works stop (a bunker's garrison takes half). */
export function strikeArmour(state, ruleset, tile) {
  return workAt(state, ruleset, tile)?.war.strikeArmour ?? 0;
}

/** Is a hidden work (a minefield) hidden from `viewer`? Its own side sees it; comms relays reveal. */
export function hiddenFrom(state, ruleset, viewer, tile) {
  const w = workAt(state, ruleset, tile);
  if (!w?.war.hidden || !w.faction || !atWar(state, viewer, w.faction)) return false;
  for (const t of Object.keys(state.map.works ?? {})) {
    const r = workAt(state, ruleset, Number(t));
    if (r?.war.reveal && r.faction && !atWar(state, viewer, r.faction) && distance(state.map, Number(t), tile) <= r.war.reveal) return false;
  }
  return true;
}

// ---------- Supply ----------

/** The hexes `faction` can supply on the active world (a Set), or null when everything is supplied. */
export function suppliedTiles(state, ruleset, faction) {
  const control = state.frontline?.control;
  if (!supplyOn(ruleset) || !control) return null;
  const t = supplyTun(ruleset);
  const side = sideOf(state, ruleset, faction);
  const threshold = t.controlThreshold ?? 25;
  const held = (tile) => (side === 0 ? control[tile] > threshold : control[tile] < -threshold);
  const friend = (f) => f === faction || (f && !atWar(state, faction, f) && sideOf(state, ruleset, f) === side);
  const sources = [];
  // K4: a base's buildings may reach further (a logistics hub's supplyRange).
  const extra = (c) => c.buildings.reduce((n, b) => n + (ruleset.buildings?.[b]?.supplyRange ?? ruleset.wonders?.[b]?.supplyRange ?? 0), 0);
  for (const c of Object.values(state.cities ?? {})) if (friend(c.faction)) sources.push([c.tile, (t.cityRange ?? 4) + extra(c)]);
  for (const k of Object.keys(state.map.works ?? {})) {
    const w = workAt(state, ruleset, Number(k));
    if (w?.war.supply && friend(w.faction)) sources.push([Number(k), w.war.supply]);
  }
  for (const d of state.space?.drops ?? []) {
    if (d.world === activeWorld(state) && friend(d.faction) && d.turn >= state.turn - 1) sources.push([d.tile, t.dropRadius ?? 2]);
  }
  const out = new Set();
  const nbs = neighbourCache(state.map);
  for (const [start, range] of sources) {
    // Breadth first through held hexes (the source itself always counts).
    const dist = new Map([[start, 0]]);
    const queue = [start];
    out.add(start);
    while (queue.length) {
      const at = queue.shift();
      const d = dist.get(at);
      if (d >= range) continue;
      for (const j of nbs[at]) {
        if (j < 0 || dist.has(j) || !held(j)) continue;
        dist.set(j, d + 1);
        out.add(j);
        queue.push(j);
      }
    }
  }
  return out;
}

/**
 * Supply at the start of a faction's turn on the active world: who is cut off (unit.cut counts
 * the turns), attrition, and surrender. Runs before units heal, so the cut off do not.
 */
export function supplyTurn(state, ruleset, factionId, events) {
  const supplied = suppliedTiles(state, ruleset, factionId);
  const t = supplyTun(ruleset);
  for (const u of Object.values(state.units ?? {})) {
    if (u.faction !== factionId) continue;
    const def = ruleset.units[u.type];
    if (!supplied || supplied.has(u.tile) || !def?.strength) { if (u.cut) delete u.cut; continue; }
    u.cut = (u.cut ?? 0) + 1;
    u.hp -= t.attrition ?? 10;
    events.push({ type: 'outOfSupply', unit: u.id, faction: factionId, tile: u.tile, turns: u.cut });
    if (u.hp <= 0 || u.cut > (t.surrenderTurns ?? 3)) {
      delete state.units[u.id];
      events.push({ type: u.hp <= 0 ? 'unitKilled' : 'unitSurrendered', unit: u.id, unitType: u.type, faction: factionId, tile: u.tile });
    }
  }
}

/** Combat modifiers for being cut off. */
export function supplyModifiers(ruleset, unit) {
  return unit?.cut ? [{ source: 'outOfSupply', amount: -(supplyTun(ruleset).penalty ?? 5) }] : [];
}

// ---------- Theatre rules ----------

const theatre = (state, ruleset) => (multiWorld(state) ? ruleset.worlds?.[activeWorld(state)]?.theatre ?? null : null);

/** Is a storm raging on the active world this turn? */
export function stormNow(state, ruleset, world = activeWorld(state)) {
  const s = ruleset.worlds?.[world]?.theatre?.storm;
  if (!s?.every) return false;
  return (state.turn + (s.offset ?? 0)) % s.every === 0;
}

/** Extra sight on the active world (a storm shortens it). */
export function theatreSight(state, ruleset) {
  const th = theatre(state, ruleset);
  return th?.storm && stormNow(state, ruleset) ? th.storm.sight ?? 0 : 0;
}

/** Extra moves on the active world (low gravity, for units with its tag). */
export function theatreMoves(state, ruleset, unit) {
  const g = theatre(state, ruleset)?.lowGravity;
  if (!g) return 0;
  return !g.tag || (ruleset.units[unit.type]?.tags ?? []).includes(g.tag) ? g.moves ?? 1 : 0;
}

/** Can this kind of unit stand on the active world at all (stations have no room for vehicles)? */
export function theatreAllows(state, ruleset, typeId) {
  const th = theatre(state, ruleset);
  if (!th?.noVehicles) return true;
  return !(ruleset.units[typeId]?.tags ?? []).includes(th.vehicleTag ?? 'vehicle');
}

/** Does a storm on `world` stop orbital strikes, drops and landings away from bases? */
export function stormBlocksOrbit(state, ruleset, world) {
  const s = ruleset.worlds?.[world]?.theatre?.storm;
  return Boolean(s?.blocksOrbit) && stormNow(state, ruleset, world);
}

function strikeDamage(state, ruleset, strength, unit) {
  const combat = ruleset.tuning?.combat ?? {};
  const def = ruleset.units[unit.type]?.strength ?? 0;
  const roll = (combat.randomMin ?? 0.8) + ((combat.randomMax ?? 1.2) - (combat.randomMin ?? 0.8)) * random(state);
  return Math.max(1, Math.min(100, Math.round((combat.baseDamage ?? 30) * Math.exp((strength - def) / ((combat.strengthScale ?? 25) * 2)) * roll)));
}

function hurt(state, u, dmg, events, cause) {
  u.hp -= dmg;
  events.push({ type: 'unitHurt', cause, unit: u.id, faction: u.faction, tile: u.tile, damage: dmg });
  if (u.hp <= 0) {
    delete state.units[u.id];
    events.push({ type: 'unitKilled', unit: u.id, unitType: u.type, faction: u.faction, tile: u.tile });
  }
}

/**
 * The war on the active world at the start of a faction's turn, after its units have healed
 * and moved on: engineers' works in progress, field hospitals, arc towers and batteries
 * firing, and toxic ground.
 */
export function warTurn(state, ruleset, factionId, events, place) {
  const nbs = neighbourCache(state.map);
  // Works in progress.
  for (const u of Object.values(state.units ?? {})) {
    if (u.faction !== factionId || !u.building) continue;
    if (u.tile !== u.building.tile) { delete u.building; continue; }
    u.building.left -= 1;
    u.moves = 0;
    if (u.building.left > 0) continue;
    const { improvement, tile } = u.building;
    delete u.building;
    place(state, ruleset, improvement, tile, u, events);
  }
  if (state.map.works) {
    for (const k of Object.keys(state.map.works).map(Number).sort((a, b) => a - b)) {
      const w = workAt(state, ruleset, k);
      if (!w || w.faction !== factionId) continue;
      if (w.war.heal) for (const u of Object.values(state.units)) if (u.faction === factionId && u.tile === k) u.hp = Math.min(100, u.hp + w.war.heal);
      if (w.war.arcDamage) {
        for (const j of nbs[k]) for (const u of Object.values(state.units).filter((x) => x.tile === j && atWar(state, factionId, x.faction))) hurt(state, u, w.war.arcDamage, events, 'arc');
      }
      const b = w.war.bombard;
      if (b && (!b.crew || Object.values(state.units).some((u) => u.tile === k && u.faction === factionId))) {
        const targets = Object.values(state.units).filter((u) => atWar(state, factionId, u.faction) && distance(state.map, k, u.tile) <= b.range)
          .sort((x, y) => distance(state.map, k, x.tile) - distance(state.map, k, y.tile) || (x.id < y.id ? -1 : 1));
        if (targets[0]) {
          const dmg = Math.round(strikeDamage(state, ruleset, b.strength, targets[0]) * (100 - strikeArmour(state, ruleset, targets[0].tile)) / 100);
          events.push({ type: 'batteryFire', tile: k, target: targets[0].tile, faction: factionId });
          hurt(state, targets[0], Math.max(1, dmg), events, 'battery');
        }
      }
    }
  }
  // Toxic ground hurts whoever lacks the gear.
  const tox = theatre(state, ruleset)?.toxic;
  const civ = state.factions.find((f) => f.id === factionId)?.civ;
  if (tox && !(tox.immune ?? []).includes(civ)) {
    for (const u of Object.values(state.units ?? {})) {
      if (u.faction !== factionId || !ruleset.units[u.type]?.strength) continue;
      const terr = state.map.terrainIds[state.map.terrain[u.tile]];
      if (!tox.terrain || tox.terrain.includes(terr)) hurt(state, u, tox.damage ?? 5, events, 'toxic');
    }
  }
}

// ---------- Capturing a world ----------

/**
 * At the end of each round, on the active world: a side holds the world when it holds every
 * key site and no enemy army or base is left there (with no sites, when only its armies and
 * bases are there). state.holders records who holds each world.
 */
export function captureRound(state, ruleset, events) {
  if (!multiWorld(state)) return;
  const world = activeWorld(state);
  const sideOfF = (f) => (f === 'raiders' ? null : sideOf(state, ruleset, f));
  const present = new Set();
  for (const u of Object.values(state.units ?? {})) if (ruleset.units[u.type]?.strength && sideOfF(u.faction) !== null) present.add(sideOfF(u.faction));
  for (const c of Object.values(state.cities ?? {})) present.add(sideOfF(c.faction));
  const sites = Object.values(state.frontline?.sites ?? {});
  const objective = ruleset.worlds?.[world]?.theatre?.objective;
  const key = objective ? sites.filter((s) => s.site === objective) : sites;
  let holder = null;
  if (present.size === 1) {
    const side = [...present][0];
    if (key.every((s) => s.owner === side)) holder = side;
  } else if (present.size === 0 && key.length && key.every((s) => s.owner === key[0].owner) && key[0].owner !== null) holder = key[0].owner;
  state.holders ??= {};
  const before = state.holders[world] ?? null;
  if (holder !== null && holder !== before) {
    state.holders[world] = holder;
    events.push({ type: 'worldCaptured', world, side: holder, from: before, turn: state.turn, global: true });
  }
}
