// Theatre rules, supply and war infrastructure (Killzone Extrasolar War K3; docs/KILLZONE.md 3).
// Every rule and every kind of work, on the Extrasolar War worlds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal } from '../data/helpers.js';
import { createGame, applyCommand, view } from '../../src/sim/index.js';
import { cloneState } from '../../src/sim/commands.js';
import { switchTo, activeWorld } from '../../src/sim/worlds.js';
import { suppliedTiles, supplyTurn, warTurn, captureRound, stormNow, workAt } from '../../src/sim/war.js';
import { placeImprovement } from '../../src/sim/improvements.js';
import { finishImprovement } from '../../src/sim/unitCommands.js';
import { createUnit, maxMoves, canStand } from '../../src/sim/units.js';
import { buildSpec } from '../../src/sim/combat.js';
import { sightRange } from '../../src/sim/visibility.js';
import { neighbourTiles } from '../../src/sim/index.js';

const rs = (await loadReal(['base-ancient', 'killzone', 'killzone-war'])).ruleset;
const setup = { seed: 3, players: [{ kind: 'human', faction: 'isa' }, { kind: 'human', faction: 'helghast' }], map: { preset: 'corinth_front' } };
const base = createGame(rs, setup);
const on = (world) => { const s = cloneState(base); switchTo(s, world); return s; };
const as = (s, f) => { s.seatIndex = s.seatOrder.indexOf(f); return s; };
const land = (s, from, avoid = []) => {
  for (let d = 1; d < 40; d += 1) {
    for (let t = 0; t < s.map.terrain.length; t += 1) {
      if (avoid.includes(t)) continue;
      const terr = rs.terrain[s.map.terrainIds[s.map.terrain[t]]];
      if (terr.water || terr.impassable || Object.values(s.units).some((u) => u.tile === t) || Object.values(s.cities).some((c) => c.tile === t)) continue;
      const r1 = Math.floor(t / s.map.width); const r0 = Math.floor(from / s.map.width);
      if (Math.abs(r1 - r0) + Math.abs((t % s.map.width) - (from % s.map.width)) === d) return t;
    }
  }
  throw new Error('no land');
};
const nbs = (s, t) => neighbourTiles(s.map, t).filter((j) => j >= 0 && !rs.terrain[s.map.terrainIds[s.map.terrain[j]]].water && !rs.terrain[s.map.terrainIds[s.map.terrain[j]]].impassable);

test('supply: your bases supply the ground your side holds; deep in enemy ground you are cut off', () => {
  const s = on('morrow');
  const enemyBase = Object.values(s.cities).find((c) => c.faction === 'f1');
  const t = land(s, enemyBase.tile);
  const u = createUnit(s, rs, 'warrior', 'f0', t);
  assert.ok(!suppliedTiles(s, rs, 'f0').has(t), 'ISA has no supply on Helghast ground');
  assert.ok(suppliedTiles(s, rs, 'f1').has(t), 'the Helghast do');
  u.hp = 80;
  const events = [];
  supplyTurn(s, rs, 'f0', events);
  assert.equal(u.cut, 1);
  assert.equal(u.hp, 80 - rs.tuning.supply.attrition);
  assert.ok(events.some((e) => e.type === 'outOfSupply'));
  // Cut off units fight weaker.
  const g = createUnit(s, rs, 'warrior', 'f1', nbs(s, t).find((j) => !Object.values(s.units).some((x) => x.tile === j) && !Object.values(s.cities).some((c) => c.tile === j)));
  const spec = buildSpec(s, rs, u, g.tile);
  assert.ok(spec.modifiers.attacker.some((m) => m.source === 'outOfSupply' && m.amount === -rs.tuning.supply.penalty));
  // After too many turns cut off, it surrenders.
  for (let k = 0; k < rs.tuning.supply.surrenderTurns + 1 && s.units[u.id]; k += 1) supplyTurn(s, rs, 'f0', events);
  assert.equal(s.units[u.id], undefined);
  assert.ok(events.some((e) => e.type === 'unitSurrendered'));
});

test('supply: a cut off unit does not heal; a supply drop or a depot puts it back in supply', () => {
  const s = as(on('morrow'), 'f0');
  const enemyBase = Object.values(s.cities).find((c) => c.faction === 'f1');
  const t = land(s, enemyBase.tile, []);
  const u = createUnit(s, rs, 'warrior', 'f0', t);
  u.hp = 50;
  u.cut = 1;
  const r = applyCommand(s, { type: 'endTurn', faction: 'f0' }, rs).state;
  const after = applyCommand(r, { type: 'endTurn', faction: r.seatOrder[r.seatIndex] }, rs).state;
  const back = after.world === 'morrow' ? after.units[u.id] : after.worlds.morrow.units[u.id];
  assert.ok(!back || back.hp < 50, 'no healing while cut off');
  // A supply drop recorded on Morrow supplies the area.
  const d = on('morrow');
  d.space.drops = [{ world: 'morrow', tile: t, faction: 'f0', turn: d.turn }];
  assert.ok(suppliedTiles(d, rs, 'f0').has(t));
  // A depot only reaches through ground your side holds.
  const dep = on('vekta');
  const myBase = Object.values(dep.cities).find((c) => c.faction === 'f0');
  const spot = land(dep, myBase.tile);
  const far = land(dep, myBase.tile, [spot]);
  for (const c of Object.values(dep.cities)) if (c.faction === 'f0') { delete dep.cities[c.id]; }
  dep.frontline.control.fill(100);
  assert.equal(suppliedTiles(dep, rs, 'f0').size, 0, 'no bases, no supply');
  placeImprovement(dep, rs, 'supply_depot', spot, 'f0');
  assert.ok(suppliedTiles(dep, rs, 'f0').has(spot));
  dep.frontline.control.fill(-100);
  dep.frontline.control[spot] = 100;
  assert.ok(!suppliedTiles(dep, rs, 'f0').has(far), 'not through enemy ground');
});

test('works: engineers build where their side holds, over several turns; moving off stops the job', () => {
  const s = as(on('vekta'), 'f0');
  const myBase = Object.values(s.cities).find((c) => c.faction === 'f0');
  const t = land(s, myBase.tile);
  const eng = createUnit(s, rs, 'builder', 'f0', t);
  const r = applyCommand(s, { type: 'buildImprovement', faction: 'f0', unit: eng.id, improvement: 'trench', world: 'vekta' }, rs);
  assert.ok(r.ok, r.error?.message);
  assert.deepEqual(r.state.units[eng.id].building, { improvement: 'trench', tile: t, left: 1 });
  assert.equal(r.state.map.improvement[t], -1, 'not yet');
  const t2 = cloneState(r.state);
  const events = [];
  warTurn(t2, rs, 'f0', events, finishImprovement);
  assert.equal(workAt(t2, rs, t)?.id, 'trench');
  assert.equal(t2.map.works[t].faction, 'f0');
  // Helghast cannot build on ISA ground, and the ISA cannot build arc towers.
  const h = on('vekta');
  const he = createUnit(h, rs, 'builder', 'f1', t);
  as(h, 'f1');
  assert.equal(applyCommand(h, { type: 'buildImprovement', faction: 'f1', unit: he.id, improvement: 'wire' }, rs).error.code, 'notHeld');
  const i = as(on('vekta'), 'f0');
  const ie = createUnit(i, rs, 'builder', 'f0', t);
  assert.equal(applyCommand(i, { type: 'buildImprovement', faction: 'f0', unit: ie.id, improvement: 'arc_tower' }, rs).error.code, 'notYourFaction');
  // Walking away cancels a job in progress.
  const m = cloneState(r.state);
  m.units[eng.id].tile = land(m, t, [t]);
  warTurn(m, rs, 'f0', [], finishImprovement);
  assert.equal(m.units[eng.id].building, undefined);
  assert.equal(m.map.improvement[t], -1);
});

test('works: trenches and wire stop the enemy, mines go off and are hidden, comms relays reveal them', () => {
  const s = as(on('vekta'), 'f1');
  const myBase = Object.values(s.cities).find((c) => c.faction === 'f0');
  const a = land(s, myBase.tile);
  const path = [a, ...nbs(s, a).filter((j) => !Object.values(s.units).some((u) => u.tile === j) && !Object.values(s.cities).some((c) => c.tile === j))].slice(0, 3);
  const enemy = createUnit(s, rs, 'warrior', 'f1', path[1]);
  enemy.moves = 3;
  placeImprovement(s, rs, 'minefield', a, 'f0');
  // Hidden from the Helghast, seen by the ISA.
  const idx = s.map.improvementIds.indexOf('minefield');
  assert.equal(view(s, 'f1', rs).map.improvement[a], -1);
  assert.equal(view(s, 'f0', rs).map.improvement[a], idx);
  const relay = cloneState(s);
  const near = nbs(relay, a).find((j) => j !== path[1] && !Object.values(relay.units).some((u) => u.tile === j));
  placeImprovement(relay, rs, 'comms_relay', near, 'f1');
  assert.equal(view(relay, 'f1', rs).map.improvement[a], idx, 'revealed by the relay');
  // Walking in sets it off.
  const r = applyCommand(s, { type: 'moveUnit', faction: 'f1', unit: enemy.id, to: a }, rs);
  assert.ok(r.ok, r.error?.message);
  assert.ok(r.events.some((e) => e.type === 'mineExploded'));
  assert.equal(r.state.map.improvement[a], -1, 'spent');
  const hurt = r.state.units[enemy.id];
  assert.ok(!hurt || hurt.hp === 100 - rs.improvements.minefield.war.mineDamage);
  // Wire: walking in costs every move left.
  const w = as(on('vekta'), 'f1');
  const e2 = createUnit(w, rs, 'warrior', 'f1', path[1]);
  e2.moves = 3;
  placeImprovement(w, rs, 'wire', a, 'f0');
  const rw = applyCommand(w, { type: 'moveUnit', faction: 'f1', unit: e2.id, to: a }, rs);
  assert.equal(rw.state.units[e2.id].moves, 0);
  // A trench stops the enemy beside it, even empty.
  const tr = as(on('vekta'), 'f1');
  const e3 = createUnit(tr, rs, 'warrior', 'f1', path[1]);
  e3.moves = 3;
  placeImprovement(tr, rs, 'trench', a, 'f0');
  const beside = nbs(tr, a).find((j) => j !== path[1] && !Object.values(tr.units).some((u) => u.tile === j) && !Object.values(tr.cities).some((c) => c.tile === j));
  const rt = applyCommand(tr, { type: 'moveUnit', faction: 'f1', unit: e3.id, to: beside }, rs);
  assert.ok(rt.ok, rt.error?.message);
  assert.equal(rt.state.units[e3.id].moves, 0, 'stopped beside the trench');
  // And it is +4 defence to whoever holds it.
  assert.equal(rs.improvements.trench.defence, 4);
});

test('works: a machine gun nest fires once a turn; bunkers soften strikes; batteries need a crew; arcs hit beside them', () => {
  const s = as(on('vekta'), 'f1');
  const myBase = Object.values(s.cities).find((c) => c.faction === 'f0');
  const nest = land(s, myBase.tile);
  placeImprovement(s, rs, 'mg_nest', nest, 'f0');
  const free = nbs(s, nest).filter((j) => !Object.values(s.units).some((u) => u.tile === j) && !Object.values(s.cities).some((c) => c.tile === j));
  const start = land(s, free[0], [nest, ...free]);
  const e1 = createUnit(s, rs, 'warrior', 'f1', free[1] ?? start);
  e1.moves = 0;
  const e2 = createUnit(s, rs, 'scout', 'f1', start);
  e2.moves = 5;
  const r = applyCommand(s, { type: 'moveUnit', faction: 'f1', unit: e2.id, to: free[0] }, rs);
  assert.ok(r.ok, r.error?.message);
  const shots = r.events.filter((e) => e.type === 'freeShot');
  assert.equal(shots.length, 1, 'one free shot');
  assert.equal(r.state.map.works[nest].fired, r.state.turn);
  // Bunker: the strike's damage is halved for the garrison.
  assert.equal(rs.improvements.bunker.war.strikeArmour, 50);
  // A battery fires only with one of yours standing in it.
  const b = on('vekta');
  const bt = land(b, myBase.tile);
  placeImprovement(b, rs, 'artillery_battery', bt, 'f0');
  const target = createUnit(b, rs, 'warrior', 'f1', land(b, bt, [bt]));
  let ev = [];
  warTurn(b, rs, 'f0', ev, finishImprovement);
  assert.ok(!ev.some((e) => e.type === 'batteryFire'), 'no crew, no fire');
  createUnit(b, rs, 'warrior', 'f0', bt);
  ev = [];
  warTurn(b, rs, 'f0', ev, finishImprovement);
  assert.ok(ev.some((e) => e.type === 'batteryFire'));
  assert.ok(!b.units[target.id] || b.units[target.id].hp < 100);
  // Arc tower: every enemy beside it is hit each turn.
  const a = on('helghan');
  const hb = Object.values(a.cities).find((c) => c.faction === 'f1');
  const at = land(a, hb.tile);
  placeImprovement(a, rs, 'arc_tower', at, 'f1');
  const victim = createUnit(a, rs, 'warrior', 'f0', nbs(a, at).find((j) => !Object.values(a.units).some((u) => u.tile === j) && !Object.values(a.cities).some((c) => c.tile === j)));
  warTurn(a, rs, 'f1', [], finishImprovement);
  assert.equal(a.units[victim.id].hp, 100 - rs.improvements.arc_tower.war.arcDamage);
});

test('works: landing bays take army groups without dropships; anti-air batteries cover drop zones; field hospitals heal', () => {
  const s = as(on('vekta'), 'f0');
  const fl = Object.values(s.space.fleets).find((f) => f.faction === 'f0' && f.at === 'vekta');
  const myBase = Object.values(s.cities).find((c) => c.faction === 'f0');
  const bay = land(s, myBase.tile);
  placeImprovement(s, rs, 'landing_bay', bay, 'f0');
  const u = Object.values(s.units).find((x) => x.faction === 'f0');
  delete s.units[u.id];
  fl.cargo.push([{ ...u, tile: null }]);
  fl.ships = fl.ships.filter((x) => !rs.units[x.type].space.lands);
  assert.ok(applyCommand(s, { type: 'landArmy', faction: 'f0', fleet: fl.id, group: 0, tile: bay }, rs).ok, 'lands at the bay without dropships');
  // Anti-air: no drop zone within range.
  const m = as(on('morrow'), 'f0');
  const mf = Object.values(m.space.fleets).find((f) => f.faction === 'f0' && f.at === 'vekta');
  mf.at = 'morrow';
  const mu = Object.values(base.units).find((x) => x.faction === 'f0');
  mf.cargo.push([{ ...mu, tile: null }]);
  const hb = Object.values(m.cities).find((c) => c.faction === 'f1');
  const zone = land(m, hb.tile);
  const clear = applyCommand(m, { type: 'landArmy', faction: 'f0', fleet: mf.id, group: 0, tile: zone }, rs);
  placeImprovement(m, rs, 'anti_air_battery', nbs(m, zone)[0], 'f1');
  const covered = applyCommand(m, { type: 'landArmy', faction: 'f0', fleet: mf.id, group: 0, tile: zone }, rs);
  assert.ok(clear.ok, clear.error?.message);
  assert.equal(covered.error.code, 'antiAir');
  // Field hospital: +20 a turn.
  const h = on('vekta');
  const ht = land(h, myBase.tile);
  placeImprovement(h, rs, 'field_hospital', ht, 'f0');
  const p = createUnit(h, rs, 'warrior', 'f0', ht);
  p.hp = 40;
  warTurn(h, rs, 'f0', [], finishImprovement);
  assert.equal(p.hp, 60);
});

test('theatre: Helghan storms ground orbital strikes and shorten sight; its ash hurts the ISA, not the Helghast', () => {
  const s = on('helghan');
  let turn = 1;
  while (!stormNow({ turn }, rs, 'helghan')) turn += 1;
  s.turn = turn;
  const u = createUnit(s, rs, 'warrior', 'f0', land(s, Object.values(s.cities)[0].tile));
  const calm = cloneState(s);
  calm.turn = turn + 1;
  assert.equal(sightRange(s, rs, u), sightRange(calm, rs, calm.units[u.id]) + rs.worlds.helghan.theatre.storm.sight);
  const fl = Object.values(s.space.fleets).find((f) => f.faction === 'f0');
  delete s.space.fleets[Object.values(s.space.fleets).find((f) => f.faction === 'f1' && f.at === 'helghan').id];
  fl.at = 'helghan';
  const foe = Object.values(s.units).find((x) => x.faction === 'f1');
  as(s, 'f0');
  assert.equal(applyCommand(s, { type: 'orbitalStrike', faction: 'f0', fleet: fl.id, tile: foe.tile }, rs).error.code, 'storm');
  // Toxic ash (desert): the ISA trooper standing on it loses health, a Helghast one does not.
  const ash = cloneState(calm);
  const desert = ash.map.terrain.findIndex((t, i) => ash.map.terrainIds[t] === 'desert' && !Object.values(ash.units).some((x) => x.tile === i) && !Object.values(ash.cities).some((c) => c.tile === i));
  const isa = createUnit(ash, rs, 'warrior', 'f0', desert);
  warTurn(ash, rs, 'f0', [], finishImprovement);
  assert.equal(isa.hp, 100 - rs.worlds.helghan.theatre.toxic.damage);
  const hel = cloneState(calm);
  const hu = createUnit(hel, rs, 'warrior', 'f1', desert);
  warTurn(hel, rs, 'f1', [], finishImprovement);
  assert.equal(hu.hp, 100);
});

test('theatre: low gravity speeds jump troops on the moons; stations have no room for vehicles', () => {
  const tagged = JSON.parse(JSON.stringify(rs));
  tagged.units.scout.tags = [...(tagged.units.scout.tags ?? []), 'jump'];
  tagged.units.warrior.tags = [...(tagged.units.warrior.tags ?? []), 'vehicle'];
  const moon = on('halcyon');
  const j = createUnit(moon, tagged, 'scout', 'f0', land(moon, Object.values(moon.cities)[0].tile));
  const plain = on('vekta');
  const p = createUnit(plain, tagged, 'scout', 'f0', land(plain, Object.values(plain.cities)[0].tile));
  assert.equal(maxMoves(tagged, j, moon), maxMoves(tagged, p, plain) + 1);
  const st = on('bastion');
  const spot = land(st, Object.values(st.cities)[0].tile);
  assert.equal(canStand(st, tagged, 'warrior', 'f0', spot), false, 'no vehicles on a station');
  assert.equal(canStand(st, tagged, 'scout', 'f0', spot), true);
});

test('capturing a world: hold its reactor with no enemy left, and the star map says so', () => {
  const s = on('midway');
  assert.equal(activeWorld(s), 'midway');
  const reactor = Object.values(s.frontline.sites).find((x) => x.site === 'reactor');
  assert.ok(reactor, 'Midway has a reactor');
  const events = [];
  captureRound(s, rs, events);
  assert.equal(s.holders?.midway ?? null, null, 'neutral at the start');
  createUnit(s, rs, 'warrior', 'f0', land(s, reactor.tile));
  reactor.owner = 0;
  captureRound(s, rs, events);
  assert.equal(s.holders.midway, 0);
  assert.ok(events.some((e) => e.type === 'worldCaptured' && e.world === 'midway' && e.side === 0));
  assert.equal(view(s, 'f0', rs).space.worlds.find((w) => w.id === 'midway').holder, 0);
  // With an enemy still on it, nobody takes it.
  const c = on('midway');
  createUnit(c, rs, 'warrior', 'f0', land(c, reactor.tile));
  createUnit(c, rs, 'warrior', 'f1', land(c, reactor.tile, [land(c, reactor.tile)]));
  c.frontline.sites[reactor.tile].owner = 0;
  captureRound(c, rs, []);
  assert.equal(c.holders?.midway ?? null, null);
  // The game records who holds each world from the start.
  assert.equal(base.holders.vekta, 0);
  assert.equal(base.holders.helghan, 1);
});
