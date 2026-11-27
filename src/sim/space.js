// The star map (Killzone Extrasolar War, phase K2; docs/KILLZONE.md sections 2 and 3.3).
//
// An optional system on top of several worlds (src/sim/worlds.js): a ruleset switches it on
// by listing lanes between its worlds. Ships are units with domain "space" that never stand
// on a hex map; they sail in fleets (up to tuning.space.fleetSize ships) from world to world
// along lanes. state.space holds them all:
//
//   state.space = { fleets: { id: { id, faction, at, ships: [{ id, type, hp }], cargo: [[unit, ...]],
//                                   transit: null | { from, to, left }, moved, struck: [shipId], blockade } } }
//
// Orbit: you hold a world's orbit when warships (ships with strength) of yours or of factions
// you are not at war with are there, and no enemy warship is. Holding orbit lets you land
// army groups, call orbital strikes and supply drops, and blockade the world. Contested orbit
// is fought out at once as an auto-resolved space battle (odds are offered first: spaceOdds).
//
// An army group is up to tuning.space.groupSize units taken off a world's map into a fleet's
// cargo; ships with capacity carry them. Landing puts a group back on the map: at one of
// your bases (a city, the landing bay until K3 adds bays) or, with a dropship in the fleet,
// on open ground that no enemy anti-air covers. Landed units arrive with few moves left.
//
// Everything here is rules only: deterministic, from the game's own dice (state.rng).

import { nextId } from '../core/ids.js';
import { random } from '../core/rng.js';
import { atWar } from './diplomacy.js';
import { activeWorld, multiWorld, worldData } from './worlds.js';
import { canStand, unitsAt } from './units.js';
import { neighbourCache } from './map.js';
import { distance } from './borders.js';
import { currentFactionId } from './queries.js';
import { antiAirWorksNear, strikeArmour, stormBlocksOrbit, stormNow, workAt } from './war.js';

const tun = (ruleset) => ruleset.tuning?.space ?? {};

/** Does this ruleset use the star map? Yes when it lists lanes (and several worlds). */
export const spaceOn = (ruleset) => Object.keys(ruleset?.lanes ?? {}).length > 0 && Object.keys(ruleset?.worlds ?? {}).length > 0;

const shipDef = (ruleset, ship) => ruleset.units[ship.type];
const isWarship = (ruleset, ship) => (shipDef(ruleset, ship)?.strength ?? 0) > 0;
const fleetsAt = (state, world) => Object.values(state.space?.fleets ?? {}).filter((f) => f.at === world && !f.transit);

/** The lane between two worlds (either way round), or null. */
export function laneBetween(ruleset, a, b) {
  return Object.values(ruleset.lanes ?? {}).find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a)) ?? null;
}

/** The worlds a lane leads to from `world`: [{ to, lane }]. */
export function lanesFrom(ruleset, world) {
  return Object.values(ruleset.lanes ?? {}).filter((l) => l.from === world || l.to === world).map((l) => ({ to: l.from === world ? l.to : l.from, lane: l }));
}

/** Who is in a world's orbit: { factions: [ids with warships], contested }. */
export function orbitOf(state, ruleset, world) {
  const factions = [...new Set(fleetsAt(state, world).filter((f) => f.ships.some((s) => isWarship(ruleset, s))).map((f) => f.faction))].sort();
  const contested = factions.some((a) => factions.some((b) => atWar(state, a, b)));
  return { factions, contested };
}

/** Does `faction` hold the orbit of `world` (a friendly warship there, no enemy one)? */
export function holdsOrbit(state, ruleset, faction, world) {
  const { factions } = orbitOf(state, ruleset, world);
  return factions.length > 0 && factions.every((f) => !atWar(state, faction, f));
}

/** The power a group of ships brings to a fight: strength scaled by health. */
function power(ruleset, ships) {
  return ships.reduce((n, s) => n + ((shipDef(ruleset, s)?.strength ?? 0) * s.hp) / 100, 0);
}

/**
 * One space battle at `world` between `attacker`'s side and its enemies there. Mutates the
 * fleets (damage, losses; a fleet with no ships left is gone, with any army aboard). dice: a
 * () => [0, 1) source. Returns { winner: 'attacker' | 'defender' | null, lost: { faction: n } }.
 */
function fight(state, ruleset, world, attacker, dice, { record = true } = {}) {
  const t = tun(ruleset);
  const here = fleetsAt(state, world);
  const sideA = here.filter((f) => !atWar(state, attacker, f.faction));
  const sideB = here.filter((f) => atWar(state, attacker, f.faction));
  const lost = {};
  const hit = (fleets, amount) => {
    // Warships first (they screen the others), the healthiest first.
    const ships = fleets.flatMap((f) => f.ships.map((s) => ({ f, s }))).sort((x, y) => (isWarship(ruleset, y.s) - isWarship(ruleset, x.s)) || (y.s.hp - x.s.hp) || (x.s.id < y.s.id ? -1 : 1));
    let left = amount;
    for (const { f, s } of ships) {
      if (left <= 0) break;
      const d = Math.min(s.hp, left);
      s.hp -= d;
      left -= d;
      if (s.hp <= 0) { f.ships = f.ships.filter((x) => x !== s); lost[f.faction] = (lost[f.faction] ?? 0) + 1; }
    }
  };
  for (let round = 0; round < (t.battleRounds ?? 3); round += 1) {
    const a = power(ruleset, sideA.flatMap((f) => f.ships));
    const b = power(ruleset, sideB.flatMap((f) => f.ships));
    if (a <= 0 || b <= 0) break;
    const base = (t.battleDamage ?? 35) * (sideA.length + sideB.length);
    const toB = Math.round(base * (a / (a + b)) * (0.8 + 0.4 * dice()));
    const toA = Math.round(base * (b / (a + b)) * (0.8 + 0.4 * dice()));
    hit(sideB, toB);
    hit(sideA, toA);
  }
  const warships = (fleets) => fleets.some((f) => f.ships.some((s) => isWarship(ruleset, s)));
  // A side with no warships left loses whatever ships it still has there (they are taken or scattered).
  let winner = null;
  if (warships(sideA) && !warships(sideB)) { winner = 'attacker'; for (const f of sideB) { lost[f.faction] = (lost[f.faction] ?? 0) + f.ships.length; f.ships = []; } }
  else if (warships(sideB) && !warships(sideA)) { winner = 'defender'; for (const f of sideA) { lost[f.faction] = (lost[f.faction] ?? 0) + f.ships.length; f.ships = []; } }
  if (record) for (const f of [...sideA, ...sideB]) if (!f.ships.length) delete state.space.fleets[f.id];
  return { winner, lost };
}

/**
 * The odds of a space battle before you commit to it (shown first, as for land attacks):
 * if `faction`'s fleet `fleetId` arrived at `world` now. Never touches the game or its dice.
 * Returns { win, lose, draw } as fractions, or null when there would be no battle.
 */
export function spaceOdds(state, ruleset, faction, fleetId, world) {
  const enemy = fleetsAt(state, world).some((f) => atWar(state, faction, f.faction) && f.ships.some((s) => isWarship(ruleset, s)));
  if (!enemy) return null;
  const trials = tun(ruleset).oddsTrials ?? 24;
  const out = { win: 0, lose: 0, draw: 0 };
  for (let k = 0; k < trials; k += 1) {
    const copy = { factions: state.factions, wars: state.wars, space: JSON.parse(JSON.stringify(state.space)) };
    const f = copy.space.fleets[fleetId];
    if (f) { f.at = world; f.transit = null; }
    let seed = (k + 1) * 2654435761;
    const dice = () => { seed = (seed ^ (seed << 13)) >>> 0; seed = (seed ^ (seed >>> 17)) >>> 0; seed = (seed ^ (seed << 5)) >>> 0; return seed / 4294967296; };
    const r = fight(copy, ruleset, world, faction, dice, { record: false });
    if (r.winner === 'attacker') out.win += 1; else if (r.winner === 'defender') out.lose += 1; else out.draw += 1;
  }
  return { win: out.win / trials, lose: out.lose / trials, draw: out.draw / trials };
}

/** A fleet arrives somewhere: fight if enemy warships are there. */
function arrive(state, ruleset, fleet, events) {
  events.push({ type: 'fleetArrived', fleet: fleet.id, faction: fleet.faction, world: fleet.at, global: true });
  if (!orbitOf(state, ruleset, fleet.at).contested) return;
  const r = fight(state, ruleset, fleet.at, fleet.faction, () => random(state));
  events.push({ type: 'spaceBattle', world: fleet.at, attacker: fleet.faction, winner: r.winner, lost: r.lost, global: true });
}

/** Put a newly built ship into its faction's fleet in this world's orbit (a new fleet if full). */
export function spawnShip(state, ruleset, city, typeId) {
  const world = activeWorld(state);
  const size = tun(ruleset).fleetSize ?? 6;
  let fleet = fleetsAt(state, world).find((f) => f.faction === city.faction && f.ships.length < size);
  if (!fleet) fleet = newFleet(state, city.faction, world);
  const ship = { id: nextId(state, 's'), type: typeId, hp: 100 };
  fleet.ships.push(ship);
  return { type: 'unitBuilt', city: city.id, unitType: typeId, faction: city.faction, ship: ship.id, fleet: fleet.id, world };
}

function newFleet(state, faction, world) {
  const fleet = { id: nextId(state, 'fl'), faction, at: world, ships: [], cargo: [], transit: null, moved: false, struck: [], blockade: false };
  state.space.fleets[fleet.id] = fleet;
  return fleet;
}

/** Set up the star map at the start of a game: each world's starting fleets. */
export function setUpSpace(state, ruleset, sideOf) {
  state.space = { fleets: {} };
  for (const id of state.worldOrder) {
    for (const spec of ruleset.worlds[id].fleets ?? []) {
      const owner = state.factions.find((f) => sideOf(state, ruleset, f.id) === spec.side);
      if (!owner) continue;
      const fleet = newFleet(state, owner.id, id);
      for (const type of spec.ships) if (ruleset.units[type]) fleet.ships.push({ id: nextId(state, 's'), type, hp: 100 });
    }
  }
}

/** Space at the start of a faction's turn: its fleets may move and strike again; ships mend in friendly orbit. */
export function startSpaceTurn(state, ruleset, factionId) {
  for (const f of Object.values(state.space?.fleets ?? {})) {
    if (f.faction !== factionId) continue;
    f.moved = false;
    f.struck = [];
    if (!f.transit && holdsOrbit(state, ruleset, factionId, f.at)) for (const s of f.ships) s.hp = Math.min(100, s.hp + 10);
  }
}

/** Space at the end of each round: fleets on long jumps come closer, and arrive. */
export function spaceRound(state, ruleset, events) {
  for (const f of Object.values(state.space?.fleets ?? {}).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!f.transit || !state.space.fleets[f.id]) continue;
    f.transit.left -= 1;
    if (f.transit.left > 0) continue;
    f.at = f.transit.to;
    f.transit = null;
    arrive(state, ruleset, f, events);
  }
}

/** Is `world` blockaded against `faction` (an enemy fleet blockading it)? */
export function blockadedFor(state, faction, world) {
  return Object.values(state.space?.fleets ?? {}).some((f) => f.blockade && f.at === world && !f.transit && atWar(state, faction, f.faction));
}

// ---------- Commands ----------

const err = (code, message) => ({ code, message });

function ownFleet(state, cmd) {
  if (!state.space) return { error: err('noSpace', 'This game has no star map') };
  if (cmd.faction !== currentFactionId(state)) return { error: err('notYourTurn', 'It is not your turn') };
  const fleet = state.space.fleets[cmd.fleet];
  if (!fleet) return { error: err('unknownFleet', `No fleet "${cmd.fleet}"`) };
  if (fleet.faction !== cmd.faction) return { error: err('notYourFleet', 'That fleet is not yours') };
  return { fleet };
}

/** The fleet's world must be the one the order is given on (cmd.world, or the active world). */
function onFleetWorld(state, fleet) {
  if (fleet.transit) return err('inTransit', 'The fleet is between worlds');
  if (!multiWorld(state) || activeWorld(state) !== fleet.at) return err('wrongWorld', 'Give that order on the fleet\'s world');
  return null;
}

const capacity = (ruleset, fleet) => fleet.ships.reduce((n, s) => n + (shipDef(ruleset, s)?.space?.capacity ?? 0), 0);

/** Your landing bays on the active world (K3 war infrastructure with landingBay). */
export function bayTiles(state, ruleset, faction) {
  return Object.keys(state.map?.works ?? {}).map(Number).filter((t) => { const w = workAt(state, ruleset, t); return w?.war.landingBay && w.faction === faction; });
}

/** Enemy anti-air (units tagged antiAir) within range of a hex, on the active world. */
export function antiAirNear(state, ruleset, faction, tile) {
  const range = tun(ruleset).antiAirRange ?? 2;
  if (antiAirWorksNear(state, ruleset, faction, tile)) return true; // K3: anti-air batteries
  return Object.values(state.units ?? {}).some((u) => atWar(state, faction, u.faction) && (ruleset.units[u.type]?.tags ?? []).includes('antiAir') && distance(state.map, u.tile, tile) <= range);
}

export const moveFleet = {
  validate(state, cmd, ruleset) {
    const { fleet, error } = ownFleet(state, cmd);
    if (error) return error;
    if (fleet.transit) return err('inTransit', 'The fleet is already between worlds');
    if (fleet.moved) return err('alreadyMoved', 'The fleet has already moved this turn');
    const lane = laneBetween(ruleset, fleet.at, cmd.to);
    if (!lane) return err('noLane', 'No lane leads there');
    if (lane.heavyOnly && !fleet.ships.every((s) => shipDef(ruleset, s)?.space?.heavy)) return err('heavyOnly', 'Only heavy ships can make that jump');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const fleet = state.space.fleets[cmd.fleet];
    const lane = laneBetween(ruleset, fleet.at, cmd.to);
    fleet.moved = true;
    fleet.blockade = false;
    if (lane.turns > 1) {
      fleet.transit = { from: fleet.at, to: cmd.to, left: lane.turns };
      // A long jump is seen coming.
      events.push({ type: 'fleetJumping', fleet: fleet.id, faction: fleet.faction, from: fleet.at, to: cmd.to, turns: lane.turns, global: true });
      return;
    }
    fleet.at = cmd.to;
    arrive(state, ruleset, fleet, events);
  },
};

export const loadArmy = {
  validate(state, cmd, ruleset) {
    const { fleet, error } = ownFleet(state, cmd);
    if (error) return error;
    const where = onFleetWorld(state, fleet);
    if (where) return where;
    const units = Array.isArray(cmd.units) ? cmd.units.map((id) => state.units?.[id]) : [];
    if (!units.length || units.some((u) => !u)) return err('unknownUnit', 'Choose units on this world');
    if (units.length > (tun(ruleset).groupSize ?? 4)) return err('groupTooBig', 'Too many units for one army group');
    if (units.some((u) => u.faction !== cmd.faction)) return err('notYourUnit', 'Those units are not yours');
    if (units.some((u) => ruleset.units[u.type]?.domain === 'space')) return err('badUnit', 'Ships cannot be carried');
    if (fleet.cargo.length >= capacity(ruleset, fleet)) return err('noRoom', 'The fleet has no room for another army group');
    if (!holdsOrbit(state, ruleset, cmd.faction, fleet.at) && orbitOf(state, ruleset, fleet.at).factions.length) return err('noOrbit', 'You need the orbit to embark');
    // Units embark from one of your bases, or next to one.
    const range = tun(ruleset).loadRange ?? 1;
    const bases = [...Object.values(state.cities ?? {}).filter((c) => c.faction === cmd.faction).map((c) => c.tile), ...bayTiles(state, ruleset, cmd.faction)];
    if (units.some((u) => !bases.some((t) => distance(state.map, t, u.tile) <= range))) return err('notAtBase', 'Units embark at or next to one of your bases');
    return null;
  },
  apply(state, cmd, events) {
    const fleet = state.space.fleets[cmd.fleet];
    const group = cmd.units.map((id) => {
      const u = state.units[id];
      delete state.units[id];
      return { ...u, tile: null, goto: null, activity: 'none' };
    });
    fleet.cargo.push(group);
    events.push({ type: 'armyEmbarked', fleet: fleet.id, faction: fleet.faction, world: fleet.at, units: group.map((u) => u.id) });
  },
};

export const landArmy = {
  validate(state, cmd, ruleset) {
    const { fleet, error } = ownFleet(state, cmd);
    if (error) return error;
    const where = onFleetWorld(state, fleet);
    if (where) return where;
    const group = fleet.cargo[cmd.group];
    if (!group) return err('noGroup', 'No such army group aboard');
    if (!holdsOrbit(state, ruleset, cmd.faction, fleet.at)) return err('noOrbit', 'You need to hold the orbit to land');
    const t = cmd.tile;
    if (!Number.isInteger(t) || t < 0 || t >= state.map.terrain.length) return err('badTile', 'Choose a hex on this world');
    const base = Object.values(state.cities ?? {}).find((c) => c.tile === t);
    if (base && base.faction !== cmd.faction) return err('enemyBase', 'You cannot land in an enemy base');
    if (unitsAt(state, t).some((u) => atWar(state, cmd.faction, u.faction))) return err('occupied', 'The enemy holds that hex');
    if (!canStand(state, ruleset, group[0].type, cmd.faction, t) && !base) return err('badTile', 'Troops cannot land there');
    // K3: your landing bays take army groups from orbit like your bases do.
    const bay = bayTiles(state, ruleset, cmd.faction).includes(t);
    if (!base && !bay) {
      if (!fleet.ships.some((s) => shipDef(ruleset, s)?.space?.lands)) return err('noDropships', 'Landing away from a base needs dropships');
      if (antiAirNear(state, ruleset, cmd.faction, t)) return err('antiAir', 'Enemy anti-air covers that drop zone');
      if (stormBlocksOrbit(state, ruleset, fleet.at)) return err('storm', 'A storm grounds the dropships this turn');
    }
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const fleet = state.space.fleets[cmd.fleet];
    const group = fleet.cargo[cmd.group];
    const spots = [cmd.tile, ...neighbourCache(state.map)[cmd.tile].filter((j) => j >= 0)];
    const landed = [];
    const left = [];
    for (const u of group) {
      const spot = spots.find((s) => canStand(state, ruleset, u.type, cmd.faction, s));
      if (spot === undefined) { left.push(u); continue; }
      state.units[u.id] = { ...u, tile: spot, moves: Math.min(u.moves, tun(ruleset).landingMoves ?? 1) };
      landed.push(u.id);
    }
    if (left.length) fleet.cargo[cmd.group] = left; else fleet.cargo.splice(cmd.group, 1);
    events.push({ type: 'armyLanded', fleet: fleet.id, faction: fleet.faction, world: fleet.at, tile: cmd.tile, units: landed, aboard: left.length });
  },
};

export const orbitalStrike = {
  validate(state, cmd, ruleset) {
    const { fleet, error } = ownFleet(state, cmd);
    if (error) return error;
    const where = onFleetWorld(state, fleet);
    if (where) return where;
    if (!holdsOrbit(state, ruleset, cmd.faction, fleet.at)) return err('noOrbit', 'You need to hold the orbit to strike');
    if (!fleet.ships.some((s) => shipDef(ruleset, s)?.space?.bombard && !fleet.struck.includes(s.id))) return err('noBombard', 'No cruiser in this fleet can strike again this turn');
    if (stormBlocksOrbit(state, ruleset, fleet.at)) return err('storm', 'A storm hides the ground this turn');
    const t = cmd.tile;
    if (!Number.isInteger(t) || t < 0 || t >= state.map.terrain.length) return err('badTile', 'Choose a hex on this world');
    if (antiAirNear(state, ruleset, cmd.faction, t)) return err('antiAir', 'Enemy anti-air covers that hex');
    if (!unitsAt(state, t).some((u) => atWar(state, cmd.faction, u.faction))) return err('noTarget', 'No enemy there to strike');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const fleet = state.space.fleets[cmd.fleet];
    const ship = fleet.ships.find((s) => shipDef(ruleset, s)?.space?.bombard && !fleet.struck.includes(s.id));
    fleet.struck.push(ship.id);
    const combat = ruleset.tuning?.combat ?? {};
    const strength = tun(ruleset).strikeStrength ?? 60;
    const hits = [];
    for (const u of unitsAt(state, cmd.tile).filter((x) => atWar(state, cmd.faction, x.faction))) {
      const def = ruleset.units[u.type]?.strength ?? 0;
      const roll = (combat.randomMin ?? 0.8) + ((combat.randomMax ?? 1.2) - (combat.randomMin ?? 0.8)) * random(state);
      const raw = Math.round((combat.baseDamage ?? 30) * Math.exp((strength - def) / ((combat.strengthScale ?? 25) * 2)) * roll);
      // K3: a bunker's garrison takes less from strikes.
      const dmg = Math.max(1, Math.min(100, Math.round((raw * (100 - strikeArmour(state, ruleset, cmd.tile))) / 100)));
      u.hp -= dmg;
      hits.push({ unit: u.id, damage: dmg, killed: u.hp <= 0 });
      if (u.hp <= 0) { delete state.units[u.id]; events.push({ type: 'unitKilled', unit: u.id, unitType: u.type, faction: u.faction, tile: cmd.tile }); }
    }
    events.push({ type: 'orbitalStrike', fleet: fleet.id, faction: cmd.faction, world: fleet.at, tile: cmd.tile, hits, global: true });
  },
};

export const supplyDrop = {
  validate(state, cmd, ruleset) {
    const { fleet, error } = ownFleet(state, cmd);
    if (error) return error;
    const where = onFleetWorld(state, fleet);
    if (where) return where;
    if (!holdsOrbit(state, ruleset, cmd.faction, fleet.at)) return err('noOrbit', 'You need to hold the orbit for a supply drop');
    if (!fleet.ships.some((s) => shipDef(ruleset, s)?.space?.bombard && !fleet.struck.includes(s.id))) return err('noBombard', 'No cruiser in this fleet is free this turn');
    if (stormBlocksOrbit(state, ruleset, fleet.at)) return err('storm', 'A storm hides the ground this turn');
    const t = cmd.tile;
    if (!Number.isInteger(t) || t < 0 || t >= state.map.terrain.length) return err('badTile', 'Choose a hex on this world');
    if (antiAirNear(state, ruleset, cmd.faction, t)) return err('antiAir', 'Enemy anti-air covers that hex');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const fleet = state.space.fleets[cmd.fleet];
    const ship = fleet.ships.find((s) => shipDef(ruleset, s)?.space?.bombard && !fleet.struck.includes(s.id));
    fleet.struck.push(ship.id);
    const t = tun(ruleset);
    const healed = [];
    for (const u of Object.values(state.units)) {
      if (u.faction !== cmd.faction || distance(state.map, u.tile, cmd.tile) > (t.supplyDropRadius ?? 1)) continue;
      u.hp = Math.min(100, u.hp + (t.supplyDropHeal ?? 15));
      healed.push(u.id);
    }
    // Recorded for the supply rules (K3): this area counts as supplied for the turn.
    state.space.drops = [...(state.space.drops ?? []).filter((d) => d.turn >= state.turn), { world: fleet.at, tile: cmd.tile, faction: cmd.faction, turn: state.turn }];
    events.push({ type: 'supplyDrop', fleet: fleet.id, faction: cmd.faction, world: fleet.at, tile: cmd.tile, units: healed });
  },
};

export const setBlockade = {
  validate(state, cmd, ruleset) {
    const { fleet, error } = ownFleet(state, cmd);
    if (error) return error;
    if (fleet.transit) return err('inTransit', 'The fleet is between worlds');
    if (cmd.on && !holdsOrbit(state, ruleset, cmd.faction, fleet.at)) return err('noOrbit', 'You need to hold the orbit to blockade');
    if (cmd.on && !fleet.ships.some((s) => isWarship(ruleset, s))) return err('noWarships', 'A blockade needs warships');
    return null;
  },
  apply(state, cmd, events) {
    const fleet = state.space.fleets[cmd.fleet];
    fleet.blockade = Boolean(cmd.on);
    events.push({ type: cmd.on ? 'blockadeStarted' : 'blockadeLifted', fleet: fleet.id, faction: cmd.faction, world: fleet.at, global: true });
  },
};

/** Which world's data a fleet's world is, for read-only questions (the screen). */
export const fleetWorldData = (state, fleet) => worldData(state, fleet.at);

// ---------- What a faction knows of the star map ----------

/**
 * The star map as `faction` may know it (docs/KILLZONE.md section 2): every world, who holds
 * its bases and how its front stands; your own fleets in full; enemy fleets only at worlds
 * where you are (a base or a fleet) or next to one, and every long jump that is coming.
 */
export function spaceView(state, ruleset, faction, sideOf) {
  if (!state.space) return null;
  const mySide = sideOf(state, ruleset, faction);
  const present = new Set();
  for (const w of state.worldOrder) if (Object.values(worldData(state, w).cities ?? {}).some((c) => c.faction === faction)) present.add(w);
  for (const f of Object.values(state.space.fleets)) if (f.faction === faction && !f.transit) present.add(f.at);
  const seen = new Set(present);
  for (const w of present) for (const { to } of lanesFrom(ruleset, w)) seen.add(to);
  const worlds = state.worldOrder.map((id) => {
    const data = worldData(state, id);
    const cities = Object.values(data.cities ?? {});
    const sides = new Set(cities.map((c) => sideOf(state, ruleset, c.faction)));
    // K3: a world captured (every key site, no enemy left) is held whatever its bases say.
    const holder = state.holders?.[id] !== undefined && sides.size <= 1 ? state.holders[id] : sides.size === 1 ? [...sides][0] : sides.size > 1 ? 'contested' : null;
    const control = data.frontline?.control ?? [];
    let a = 0;
    let b = 0;
    for (const v of control) { if (v > 0) a += 1; else if (v < 0) b += 1; }
    const share = a + b ? Math.round((100 * (mySide === 0 ? a : b)) / (a + b)) : null;
    const orbit = orbitOf(state, ruleset, id);
    return { id, kind: ruleset.worlds[id].kind, holder, share, myBases: cities.filter((c) => c.faction === faction).length, bases: cities.length,
      armies: Object.values(data.units ?? {}).filter((u) => u.faction !== 'raiders' && (ruleset.units[u.type]?.strength ?? 0) > 0).length,
      seen: seen.has(id), orbit: seen.has(id) ? { factions: orbit.factions, contested: orbit.contested, mine: holdsOrbit(state, ruleset, faction, id) } : null,
      blockaded: seen.has(id) && Object.values(state.space.fleets).some((f) => f.blockade && f.at === id && !f.transit), storm: stormNow(state, ruleset, id) };
  });
  const fleets = Object.values(state.space.fleets).filter((f) => f.faction === faction || (f.transit ? true : seen.has(f.at))).map((f) => (f.faction === faction
    ? JSON.parse(JSON.stringify(f))
    : { id: f.id, faction: f.faction, at: f.at, transit: f.transit ? { ...f.transit } : null, ships: f.ships.map((s) => ({ id: s.id, type: s.type, hp: s.hp })), groups: f.cargo.length, blockade: f.blockade }));
  const lanes = Object.values(ruleset.lanes).map((l) => ({ id: l.id, from: l.from, to: l.to, turns: l.turns, heavyOnly: Boolean(l.heavyOnly) }));
  return { worlds, fleets, lanes };
}
