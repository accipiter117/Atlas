// Phase 19: the optional front-line system. Control maths, sites changing
// hands and their bonuses, battles pushing the front, no settling, raiders or
// peace in a front-line war, the fixed map, and base-ancient untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal } from '../data/helpers.js';
import { createGame, applyCommand, cityYields, frontShares, frontlineOn } from '../../src/sim/index.js';
import { frontlineRound, frontlineBattle, sideOf, updateSites } from '../../src/sim/frontline.js';
import { canBuild } from '../../src/sim/cities.js';
import { ruleset as base } from './fixtures.js';

const rs = (await loadReal(['base-ancient', 'killzone'])).ruleset;
const T = rs.tuning.frontline;

function game(seed = 1) {
  const s = createGame(rs, { seed, players: [{ kind: 'human', faction: 'isa' }, { kind: 'ai', faction: 'helghast' }], map: { preset: 'corinth_front' }, speed: 'quick' });
  return s;
}

test('a front-line game starts on its fixed map: cities, units, sites, a split front, at war, map known', () => {
  const s = game();
  assert.equal(frontlineOn(rs), true);
  assert.equal(s.map.width, 36);
  assert.equal(s.map.height, 20);
  assert.equal(Object.values(s.cities).filter((c) => c.faction === 'f0').length, 3);
  assert.equal(Object.values(s.cities).filter((c) => c.faction === 'f1').length, 3);
  assert.equal(Object.values(s.units).filter((u) => u.type === 'settler').length, 0);
  assert.equal(Object.keys(s.frontline.sites).length, 3);
  assert.deepEqual(s.wars, ['f0|f1']);
  assert.equal(sideOf(s, rs, 'f0'), 0);
  assert.equal(sideOf(s, rs, 'f1'), 1);
  const [west, east] = frontShares(s, rs);
  assert.ok(west > 200 && east > 200, `${west} against ${east}`);
  // West of the front column is the ISA's, east the Helghast's.
  assert.ok(s.frontline.control[10 * 36 + 5] > 0);
  assert.ok(s.frontline.control[10 * 36 + 30] < 0);
  for (const fog of Object.values(s.fog)) assert.ok(fog.every((v) => v >= 1), 'every tile explored');
});

test('control maths: armies push control towards their side by at most maxStep, it stays within -100 to 100, cities hold', () => {
  const s = game();
  // Clear the board of units, then put one ISA rifle squad deep in Helghast ground.
  s.units = {};
  const tile = 10 * 36 + 24;
  s.frontline.control[tile] = -60;
  s.units.u1 = { id: 'u1', type: 'warrior', faction: 'f0', tile, hp: 100, moves: 2, activity: 'none', fortifiedTurns: 0, goto: null };
  const before = s.frontline.control.slice();
  frontlineRound(s, rs, []);
  const after = s.frontline.control;
  assert.ok(after[tile] > before[tile], 'pushed towards the ISA');
  assert.ok(after[tile] - before[tile] <= T.maxStep + Math.ceil(T.spread * 200), 'by a bounded step');
  for (const v of after) assert.ok(v >= -100 && v <= 100);
  for (const c of Object.values(s.cities)) assert.equal(after[c.tile], c.faction === 'f0' ? 100 : -100);
  // With nobody near it, a tile only drifts towards its neighbours.
  const far = 1 * 36 + 30;
  assert.ok(Math.abs(after[far] - before[far]) <= Math.ceil(T.spread * 200));
});

test('sites switch owners when control crosses captureAt, and their bonus moves with them', () => {
  const s = game();
  const factory = Object.values(s.frontline.sites).find((x) => x.site === 'factory');
  assert.equal(factory.owner, 0);
  const isaCity = Object.values(s.cities).find((c) => c.faction === 'f0');
  const helCity = Object.values(s.cities).find((c) => c.faction === 'f1');
  const prodIsa = cityYields(s, rs, isaCity).total.production;
  const prodHel = cityYields(s, rs, helCity).total.production;
  // Not yet: control just short of captureAt keeps the holder.
  s.frontline.control[factory.tile] = -(T.captureAt - 1);
  const events = [];
  updateSites(s, rs, events);
  assert.equal(factory.owner, 0);
  s.frontline.control[factory.tile] = -T.captureAt;
  updateSites(s, rs, events);
  assert.equal(factory.owner, 1);
  assert.deepEqual(events.map((e) => [e.type, e.site, e.side]), [['siteCaptured', 'factory', 1]]);
  assert.equal(cityYields(s, rs, isaCity).total.production, prodIsa - 2);
  assert.ok(cityYields(s, rs, helCity).total.production >= prodHel + 2, 'at least +2 (the Helghast leader adds 10% on top)');
});

test('a battle pushes the front towards the side that came off better', () => {
  const s = game();
  const target = 10 * 36 + 18;
  s.frontline.control[target] = 0;
  const spec = { attacker: { faction: 'f0', units: [{ ref: 'a', hp: 100 }] }, defender: { faction: 'f1', units: [{ ref: 'd', hp: 100 }], city: null }, target };
  frontlineBattle(s, rs, spec, { winner: 'none', units: [{ ref: 'a', hp: 90 }, { ref: 'd', hp: 40 }] }, []);
  assert.ok(s.frontline.control[target] > 0, 'the ISA did better: towards them');
  const s2 = game();
  s2.frontline.control[target] = 0;
  frontlineBattle(s2, rs, spec, { winner: 'defender', units: [{ ref: 'a', hp: 0 }, { ref: 'd', hp: 80 }] }, []);
  assert.ok(s2.frontline.control[target] < 0, 'the Helghast held: towards them');
});

test('no settling, no raiders and no peace in a front-line war', () => {
  const s = game();
  const city = Object.values(s.cities).find((c) => c.faction === 'f0');
  assert.equal(canBuild(s, rs, city, { kind: 'unit', id: 'settler' }), false);
  s.units.us = { id: 'us', type: 'settler', faction: 'f0', tile: 10 * 36 + 2, hp: 100, moves: 2, activity: 'none', fortifiedTurns: 0, goto: null };
  const seat = { ...s, seatIndex: s.seatOrder.indexOf('f0') };
  assert.equal(applyCommand(seat, { type: 'foundCity', faction: 'f0', unit: 'us' }, rs).error.code, 'noSettling');
  s.diplomacy.met = ['f0|f1'];
  const peace = applyCommand(seat, { type: 'proposeDeal', faction: 'f0', target: 'f1', deal: { give: [{ type: 'peace' }], get: [] } }, rs);
  assert.equal(peace.ok, false);
  // Play a few rounds: raiders never appear.
  let st = s;
  for (let i = 0; i < 12; i += 1) {
    for (const f of st.seatOrder) {
      const at = { ...st, seatIndex: st.seatOrder.indexOf(f) };
      const r = applyCommand(at, { type: 'endTurn', faction: f }, rs);
      if (r.ok) st = r.state;
    }
  }
  assert.equal(Object.values(st.units).filter((u) => u.faction === 'raiders').length, 0);
});

test('base-ancient games are untouched: no front, settlers found cities, raiders as before', () => {
  assert.equal(frontlineOn(base), false);
  const s = createGame(base, { seed: 5, players: [{ kind: 'human' }, { kind: 'ai' }], map: { size: 'small', type: 'continents' }, speed: 'quick' });
  assert.equal(s.frontline, undefined);
  assert.ok(Object.values(s.units).some((u) => u.type === 'settler'));
  const settler = Object.values(s.units).find((u) => u.type === 'settler' && u.faction === s.seatOrder[0]);
  const r = applyCommand(s, { type: 'foundCity', faction: settler.faction, unit: settler.id }, base);
  assert.equal(r.ok, true);
});
