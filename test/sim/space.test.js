// The star map (Killzone Extrasolar War K2; docs/KILLZONE.md sections 2 and 3.3): fleets,
// lanes, orbit, space battles with odds, army groups, landings, orbital strikes, supply
// drops and blockades. Every order and every refusal, and a scripted invasion.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal } from '../data/helpers.js';
import { createGame, applyCommand, view, fingerprint } from '../../src/sim/index.js';
import { cloneState } from '../../src/sim/commands.js';
import { switchTo, worldData, allCities } from '../../src/sim/worlds.js';
import { spaceOdds, holdsOrbit, orbitOf, laneBetween } from '../../src/sim/space.js';
import { buildOptions } from '../../src/sim/cities.js';
import { distance } from '../../src/sim/borders.js';

const rs = (await loadReal(['base-ancient', 'killzone', 'killzone-war'])).ruleset;
const setup = { seed: 3, players: [{ kind: 'human', faction: 'isa' }, { kind: 'human', faction: 'helghast' }], map: { preset: 'corinth_front' } };
const fresh = () => cloneState(createGame(rs, setup));

/** Make `faction` the one whose turn it is (tests only). */
function as(state, faction) {
  state.seatIndex = state.seatOrder.indexOf(faction);
  return state;
}
const fleetOf = (s, faction, world) => Object.values(s.space.fleets).find((f) => f.faction === faction && f.at === world && !f.transit);
const send = (s, cmd) => applyCommand(s, cmd, rs);
const code = (r) => (r.ok ? 'ok' : r.error.code);

test('a game on the star map: eight worlds, lanes, starting fleets, one capital a side', () => {
  const s = fresh();
  assert.equal(s.worldOrder.length, 8);
  assert.equal(Object.keys(rs.lanes).length, 11);
  assert.equal(s.scenario, 'balanced_war');
  for (const f of ['f0', 'f1']) assert.equal(Object.values(allCities(s)).filter((c) => c.faction === f && c.capital).length, 1);
  assert.ok(fleetOf(s, 'f0', 'vekta') && fleetOf(s, 'f1', 'helghan'));
  assert.ok(holdsOrbit(s, rs, 'f0', 'vekta'));
  assert.ok(!holdsOrbit(s, rs, 'f0', 'helghan'));
  assert.equal(laneBetween(rs, 'helghan', 'vekta').heavyOnly, true);
});

test('moving fleets: lanes, one move a turn, and the refusals', () => {
  const s = as(fresh(), 'f0');
  const fl = fleetOf(s, 'f0', 'vekta');
  assert.equal(code(send(s, { type: 'moveFleet', faction: 'f1', fleet: fl.id, to: 'halcyon' })), 'notYourTurn');
  assert.equal(code(send(s, { type: 'moveFleet', faction: 'f0', fleet: 'fl_nope', to: 'halcyon' })), 'unknownFleet');
  assert.equal(code(send(s, { type: 'moveFleet', faction: 'f0', fleet: fleetOf(s, 'f1', 'helghan').id, to: 'ardent' })), 'notYourFleet');
  assert.equal(code(send(s, { type: 'moveFleet', faction: 'f0', fleet: fl.id, to: 'morrow' })), 'noLane');
  assert.equal(code(send(s, { type: 'moveFleet', faction: 'f0', fleet: fl.id, to: 'helghan' })), 'heavyOnly', 'only cruisers make the long jump');
  const r = send(s, { type: 'moveFleet', faction: 'f0', fleet: fl.id, to: 'halcyon' });
  assert.equal(code(r), 'ok');
  assert.equal(r.state.space.fleets[fl.id].at, 'halcyon');
  assert.ok(r.events.some((e) => e.type === 'fleetArrived'));
  assert.equal(code(applyCommand(r.state, { type: 'moveFleet', faction: 'f0', fleet: fl.id, to: 'kerberos' }, rs)), 'alreadyMoved');
});

test('the long jump takes three turns, is seen coming, and the fleet cannot act on the way', () => {
  let s = as(fresh(), 'f0');
  const fl = fleetOf(s, 'f0', 'vekta');
  s.space.fleets[fl.id].ships = s.space.fleets[fl.id].ships.filter((x) => x.type === 'isa_cruiser');
  const r = send(s, { type: 'moveFleet', faction: 'f0', fleet: fl.id, to: 'helghan' });
  assert.equal(code(r), 'ok');
  assert.ok(r.events.some((e) => e.type === 'fleetJumping' && e.turns === 3));
  s = r.state;
  assert.deepEqual(s.space.fleets[fl.id].transit, { from: 'vekta', to: 'helghan', left: 3 });
  assert.ok(view(s, 'f1', rs).space.fleets.some((f) => f.id === fl.id), 'Helghan sees it coming');
  const turnOf = s.turn;
  let arrived = false;
  for (let k = 0; k < 6 && !arrived; k += 1) {
    const now = s.seatOrder[s.seatIndex];
    const e = send(s, { type: 'endTurn', faction: now });
    s = e.state;
    if (e.events.some((x) => x.type === 'fleetArrived' && x.fleet === fl.id)) arrived = true;
    if (s.space.fleets[fl.id]?.transit) assert.equal(code(send(as(cloneState(s), 'f0'), { type: 'setBlockade', faction: 'f0', fleet: fl.id, on: true })), 'inTransit');
  }
  assert.ok(arrived, 'it arrives');
  assert.equal(s.turn - turnOf, 3);
  // Helghan's home fleet was there: a space battle followed.
  assert.ok(!s.space.fleets[fl.id] || s.space.fleets[fl.id].at === 'helghan');
});

test('space battles: odds first (the game untouched), then a fight with losses', () => {
  const s = as(fresh(), 'f0');
  const isa = fleetOf(s, 'f0', 'vekta');
  // Put a lone Helghast destroyer in Halcyon's orbit.
  const enemy = fleetOf(s, 'f1', 'ardent');
  s.space.fleets[enemy.id].at = 'halcyon';
  assert.ok(orbitOf(s, rs, 'halcyon').factions.includes('f1'));
  const before = fingerprint(s);
  const odds = spaceOdds(s, rs, 'f0', isa.id, 'halcyon');
  assert.ok(odds && Math.abs(odds.win + odds.lose + odds.draw - 1) < 1e-9);
  assert.ok(odds.win > 0.5, `a full fleet should beat a destroyer (${JSON.stringify(odds)})`);
  assert.equal(fingerprint(s), before, 'odds never touch the game');
  assert.equal(spaceOdds(s, rs, 'f0', isa.id, 'bastion'), null, 'no enemy, no battle');
  const r = send(s, { type: 'moveFleet', faction: 'f0', fleet: isa.id, to: 'halcyon' });
  const battle = r.events.find((e) => e.type === 'spaceBattle');
  assert.ok(battle);
  if (battle.winner === 'attacker') {
    assert.equal(r.state.space.fleets[enemy.id], undefined, 'the beaten fleet is gone');
    assert.ok(holdsOrbit(r.state, rs, 'f0', 'halcyon'));
  }
});

test('army groups: embarking at a base, the refusals, and landing at a base or a drop zone', () => {
  const s = as(fresh(), 'f0');
  const fl = fleetOf(s, 'f0', 'vekta');
  const mine = Object.values(s.units).filter((u) => u.faction === 'f0');
  const base = Object.values(s.cities).find((c) => c.faction === 'f0');
  // Bring two units next to a base.
  const nb = (t) => [t, t + 1, t - 1, t + s.map.width, t - s.map.width].find((x) => !Object.values(s.units).some((u) => u.tile === x) && rs.terrain[s.map.terrainIds[s.map.terrain[x]]] && !rs.terrain[s.map.terrainIds[s.map.terrain[x]]].water);
  mine[0].tile = base.tile;
  mine[1].tile = nb(base.tile);
  const far = mine[2];
  assert.equal(code(send(s, { type: 'loadArmy', faction: 'f0', fleet: fl.id, units: [mine[0].id], world: 'halcyon' })), 'wrongWorld');
  assert.equal(code(send(s, { type: 'loadArmy', faction: 'f0', fleet: fl.id, units: [] })), 'unknownUnit');
  assert.equal(code(send(s, { type: 'loadArmy', faction: 'f0', fleet: fl.id, units: [mine[0].id, mine[1].id, far.id, mine[3].id, 'u_x'] })), 'unknownUnit');
  if (Math.min(...Object.values(s.cities).filter((c) => c.faction === 'f0').map((c) => Math.abs(c.tile - far.tile))) > 2) {
    assert.equal(code(send(s, { type: 'loadArmy', faction: 'f0', fleet: fl.id, units: [far.id] })), 'notAtBase');
  }
  const r = send(s, { type: 'loadArmy', faction: 'f0', fleet: fl.id, units: [mine[0].id, mine[1].id] });
  assert.equal(code(r), 'ok');
  let t = r.state;
  assert.equal(t.space.fleets[fl.id].cargo.length, 1);
  assert.equal(t.units[mine[0].id], undefined, 'off the map');
  // Fly to Halcyon (an ISA moon with a base) and land at the base: no dropships needed.
  t = applyCommand(t, { type: 'moveFleet', faction: 'f0', fleet: fl.id, to: 'halcyon' }, rs).state;
  switchTo(t, 'halcyon');
  const bay = Object.values(t.cities).find((c) => c.faction === 'f0');
  assert.equal(code(applyCommand(t, { type: 'landArmy', faction: 'f0', fleet: fl.id, group: 5, tile: bay.tile }, rs)), 'noGroup');
  const landed = applyCommand(t, { type: 'landArmy', faction: 'f0', fleet: fl.id, group: 0, tile: bay.tile, world: 'halcyon' }, rs);
  assert.equal(code(landed), 'ok');
  const ev = landed.events.find((e) => e.type === 'armyLanded');
  assert.equal(ev.units.length, 2);
  for (const id of ev.units) assert.ok(landed.state.units[id].moves <= rs.tuning.space.landingMoves);
  assert.equal(landed.state.space.fleets[fl.id].cargo.length, 0);
});

test('drop zones need dropships and no enemy anti-air; enemy orbit, bases and hexes refuse a landing', async () => {
  const s = as(fresh(), 'f0');
  const fl = s.space.fleets[fleetOf(s, 'f0', 'vekta').id];
  const u = Object.values(s.units).find((x) => x.faction === 'f0');
  delete s.units[u.id];
  fl.cargo.push([{ ...u, tile: null }]);
  fl.at = 'morrow';
  switchTo(s, 'morrow');
  const enemyBase = Object.values(s.cities).find((c) => c.faction === 'f1');
  const open = s.map.terrain.findIndex((_, i) => !rs.terrain[s.map.terrainIds[s.map.terrain[i]]].water && rs.terrain[s.map.terrainIds[s.map.terrain[i]]].id !== 'mountain' && !Object.values(s.units).some((x) => x.tile === i) && !Object.values(s.cities).some((c) => c.tile === i) && Math.abs((i % s.map.width) - (enemyBase.tile % s.map.width)) > 4);
  assert.equal(code(send(s, { type: 'landArmy', faction: 'f0', fleet: fl.id, group: 0, tile: enemyBase.tile })), 'enemyBase');
  const guard = Object.values(s.units).find((x) => x.faction === 'f1');
  assert.equal(code(send(s, { type: 'landArmy', faction: 'f0', fleet: fl.id, group: 0, tile: guard.tile })), 'occupied');
  // Without dropships, only bases.
  const noDrop = cloneState(s);
  noDrop.space.fleets[fl.id].ships = noDrop.space.fleets[fl.id].ships.filter((x) => !rs.units[x.type].space.lands);
  assert.equal(code(send(noDrop, { type: 'landArmy', faction: 'f0', fleet: fl.id, group: 0, tile: open })), 'noDropships');
  // Enemy warships in orbit: no landing.
  const contested = cloneState(s);
  contested.space.fleets[fleetOf(contested, 'f1', 'ardent').id].at = 'morrow';
  assert.equal(code(send(contested, { type: 'landArmy', faction: 'f0', fleet: fl.id, group: 0, tile: open })), 'noOrbit');
  // Enemy anti-air within range covers the drop zone.
  const aa = JSON.parse(JSON.stringify(rs));
  aa.units[guard.type].tags = [...(aa.units[guard.type].tags ?? []), 'antiAir'];
  const covered = cloneState(s);
  covered.units[guard.id].tile = open + 1;
  assert.equal(code(applyCommand(covered, { type: 'landArmy', faction: 'f0', fleet: fl.id, group: 0, tile: open }, aa)), 'antiAir');
  // A clear drop zone, with dropships and the orbit: down they go.
  assert.equal(code(send(s, { type: 'landArmy', faction: 'f0', fleet: fl.id, group: 0, tile: open })), 'ok');
});

test('orbital strikes: one per cruiser a turn, need a target and no anti-air', () => {
  const s = as(fresh(), 'f0');
  const fl = s.space.fleets[fleetOf(s, 'f0', 'vekta').id];
  fl.at = 'morrow';
  switchTo(s, 'morrow');
  const guard = Object.values(s.units).find((x) => x.faction === 'f1');
  const empty = s.map.terrain.findIndex((_, i) => !Object.values(s.units).some((x) => x.tile === i));
  assert.equal(code(send(s, { type: 'orbitalStrike', faction: 'f0', fleet: fl.id, tile: empty })), 'noTarget');
  const r = send(s, { type: 'orbitalStrike', faction: 'f0', fleet: fl.id, tile: guard.tile });
  assert.equal(code(r), 'ok');
  const hit = r.events.find((e) => e.type === 'orbitalStrike').hits[0];
  assert.ok(hit.damage > 0);
  assert.equal(code(applyCommand(r.state, { type: 'orbitalStrike', faction: 'f0', fleet: fl.id, tile: guard.tile }, rs)), r.state.units[guard.id] ? 'noBombard' : 'noTarget');
  const aa = JSON.parse(JSON.stringify(rs));
  aa.units[guard.type].tags = [...(aa.units[guard.type].tags ?? []), 'antiAir'];
  assert.equal(code(applyCommand(s, { type: 'orbitalStrike', faction: 'f0', fleet: fl.id, tile: guard.tile }, aa)), 'antiAir');
});

test('supply drops heal nearby troops; blockades need the orbit and warships, and cut the credits', () => {
  let s = as(fresh(), 'f0');
  const fl = s.space.fleets[fleetOf(s, 'f0', 'vekta').id];
  const u = Object.values(s.units).find((x) => x.faction === 'f0');
  u.hp = 50;
  const drop = send(s, { type: 'supplyDrop', faction: 'f0', fleet: fl.id, tile: u.tile });
  assert.equal(code(drop), 'ok');
  assert.equal(drop.state.units[u.id].hp, 50 + rs.tuning.space.supplyDropHeal);
  assert.equal(drop.state.space.drops.length, 1);
  // Blockade Helghan (its home fleet gone): needs the orbit (empty of enemies) and a warship.
  delete s.space.fleets[fleetOf(s, 'f1', 'helghan').id];
  s.space.fleets[fl.id].at = 'helghan';
  const transportOnly = cloneState(s);
  transportOnly.space.fleets[fl.id].ships = transportOnly.space.fleets[fl.id].ships.filter((x) => !rs.units[x.type].strength);
  assert.equal(code(send(transportOnly, { type: 'setBlockade', faction: 'f0', fleet: fl.id, on: true })), 'noOrbit');
  const b = send(s, { type: 'setBlockade', faction: 'f0', fleet: fl.id, on: true });
  assert.equal(code(b), 'ok');
  s = b.state;
  // Helghast's credits from Helghan are cut: compare a few turns with and without the blockade.
  let cut = 0;
  const run = (state) => {
    let x = state;
    const gold0 = x.factions[1].stocks.gold;
    for (let k = 0; k < 4; k += 1) {
      const r = applyCommand(x, { type: 'endTurn', faction: x.seatOrder[x.seatIndex] }, rs);
      cut += r.events.filter((e) => e.type === 'blockadeCost').length;
      x = r.state;
    }
    return x.factions[1].stocks.gold - gold0;
  };
  const free = cloneState(s);
  free.space.fleets[fl.id].blockade = false;
  const blockaded = run(s);
  assert.ok(cut > 0, 'the blockade cut some credits');
  assert.ok(blockaded < run(free), 'the blockade costs the Helghast credits');
});

test('ships are built at bases on home worlds and stations, and join the fleet in orbit', () => {
  const s = as(fresh(), 'f0');
  const vekta = Object.values(s.cities).find((c) => c.faction === 'f0');
  assert.ok(buildOptions(s, rs, vekta).some((o) => o.kind === 'unit' && o.id === 'isa_destroyer'));
  assert.ok(!buildOptions(s, rs, vekta).some((o) => o.id === 'helghast_destroyer'), 'each side its own ships');
  const moon = cloneState(s);
  switchTo(moon, 'halcyon');
  const hal = Object.values(moon.cities).find((c) => c.faction === 'f0');
  assert.ok(!buildOptions(moon, rs, hal).some((o) => o.id === 'isa_destroyer'), 'no shipyard on a moon');
  const before = fleetOf(s, 'f0', 'vekta').ships.length;
  vekta.queue = [{ kind: 'unit', id: 'isa_destroyer' }];
  vekta.progress = 10_000;
  let t = s;
  for (let k = 0; k < 2; k += 1) t = applyCommand(t, { type: 'endTurn', faction: t.seatOrder[t.seatIndex] }, rs).state;
  const ships = Object.values(t.space.fleets).filter((f) => f.faction === 'f0' && f.at === 'vekta').flatMap((f) => f.ships);
  assert.ok(ships.length > before, 'a new destroyer in orbit');
  assert.ok(!Object.values(worldData(t, 'vekta').units).some((u) => u.type === 'isa_destroyer'), 'never on the map');
});

test('a scripted 60-turn invasion of Morrow plays the same every time', () => {
  const play = () => {
    let s = createGame(rs, setup);
    const log = [];
    const go = (cmd) => { const r = applyCommand(s, cmd, rs); if (r.ok) { s = r.state; log.push(cmd); } return r; };
    const fl = fleetOf(s, 'f0', 'vekta').id;
    const route = ['halcyon', 'kerberos', 'morrow'];
    let landed = false;
    let strikes = 0;
    for (let k = 0; k < 120 && s.turn <= 60 && !s.winner; k += 1) {
      const me = s.seatOrder[s.seatIndex];
      if (me === 'f0') {
        const f = s.space.fleets[fl];
        if (f && !f.cargo.length && !landed && f.at === 'vekta') {
          const w = worldData(s, 'vekta');
          const bases = Object.values(w.cities).filter((c) => c.faction === 'f0');
          const near = Object.values(w.units).filter((u) => u.faction === 'f0' && bases.some((c) => distance(w.map, c.tile, u.tile) <= 1));
          if (near.length) go({ type: 'loadArmy', faction: 'f0', fleet: fl, units: near.slice(0, 2).map((u) => u.id), world: 'vekta' });
        }
        if (f && route.includes(f.at) ? route.indexOf(f.at) < route.length - 1 : f?.at === 'vekta') go({ type: 'moveFleet', faction: 'f0', fleet: fl, to: route[route.indexOf(f.at) + 1] });
        const g = s.space.fleets[fl];
        if (g?.at === 'morrow' && !g.transit) {
          const m = worldData(s, 'morrow');
          const guard = Object.values(m.units).find((u) => u.faction === 'f1');
          // Before landing the cruiser strikes the garrison; after, it keeps the beachhead in supply (K3).
          const ours = Object.values(m.units).find((u) => u.faction === 'f0');
          if (landed && ours) go({ type: 'supplyDrop', faction: 'f0', fleet: fl, tile: ours.tile, world: 'morrow' });
          else if (guard && go({ type: 'orbitalStrike', faction: 'f0', fleet: fl, tile: guard.tile, world: 'morrow' }).ok) strikes += 1;
          if (!landed && g.cargo.length) {
            const map = worldData(s, 'morrow').map;
            const city = Object.values(worldData(s, 'morrow').cities)[0];
            for (let t = 0; t < map.terrain.length && !landed; t += 1) {
              const d = Math.abs((t % map.width) - (city.tile % map.width)) + Math.abs(Math.floor(t / map.width) - Math.floor(city.tile / map.width));
              if (d >= 3 && d <= 5 && go({ type: 'landArmy', faction: 'f0', fleet: fl, group: 0, tile: t, world: 'morrow' }).ok) landed = true;
            }
          }
        }
      }
      go({ type: 'endTurn', faction: me });
    }
    return { s, log, landed, strikes };
  };
  const a = play();
  assert.ok(a.landed, 'the army landed on Morrow');
  assert.ok(a.strikes >= 1, 'the cruiser struck the garrison');
  assert.ok(holdsOrbit(a.s, rs, 'f0', 'morrow'), 'ISA holds Morrow\'s orbit');
  const morrow = view(a.s, 'f0', rs).space.worlds.find((w) => w.id === 'morrow');
  assert.ok(morrow.share > 0, `the ISA has pushed into Morrow's front (${morrow.share}%)`);
  assert.equal(fingerprint(play().s), fingerprint(a.s), 'reproducible');
  // And it replays from the log alone.
  let r = createGame(rs, setup);
  for (const cmd of a.log) r = applyCommand(r, cmd, rs).state;
  assert.equal(fingerprint(r), fingerprint(a.s));
});
