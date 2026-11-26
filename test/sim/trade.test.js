// Phase 14: trade. Route ranges, yields by table, expiry after 30 turns,
// roads along the path, war ending routes, religion along routes, and
// resource deals that hand over the amenity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset, fixtureGame, play, passRound } from './fixtures.js';
import { applyCommand, cityTradeYields, previewRoute, routeProblem } from '../../src/sim/index.js';
import { religionRound } from '../../src/sim/religion.js';
import { luxuriesOf } from '../../src/sim/amenities.js';
import { pairKey } from '../../src/sim/diplomacy.js';

const T = ruleset.tuning.trade;
const W = 24;
const land = '.'.repeat(W);

/** Cities at the given columns of row 1 (f0 unless listed in theirs), a trader in the first. */
function cities(cols, { rows = [land, land, land], theirs = [] } = {}) {
  const units = cols.map((c, i) => ({ type: 'settler', faction: theirs.includes(i) ? 'f1' : 'f0', at: W + c }));
  units.push({ type: 'trader', at: W + cols[0] });
  let s = fixtureGame(rows, units);
  s.wars = [];
  s.diplomacy.met = [pairKey('f0', 'f1')];
  for (let i = 0; i < cols.length; i += 1) {
    const f = theirs.includes(i) ? 'f1' : 'f0';
    s = applyCommand({ ...s, seatIndex: s.seatOrder.indexOf(f) }, { type: 'foundCity', faction: f, unit: `u_${String(i + 1).padStart(4, '0')}` }, ruleset).state;
  }
  s = { ...s, seatIndex: s.seatOrder.indexOf('f0') };
  const at = (c) => Object.values(s.cities).find((x) => x.tile === W + c);
  return { s, city: at, trader: `u_${String(cols.length + 1).padStart(4, '0')}` };
}

test('route ranges: 15 hexes over land; out of reach beyond', () => {
  const near = cities([1, 1 + T.landRange]);
  assert.equal(routeProblem(near.s, ruleset, 'f0', near.trader, near.city(1 + T.landRange).id), null);
  const far = cities([1, 2 + T.landRange]);
  assert.equal(routeProblem(far.s, ruleset, 'f0', far.trader, far.city(2 + T.landRange).id), 'outOfRange');
});

test('sea routes link coastal cities across water, up to 30 hexes', () => {
  const sea = '~'.repeat(W);
  const rows = ['.....' + '~'.repeat(W - 10) + '.....', '.....' + '~'.repeat(W - 10) + '.....', sea];
  const { s, city, trader } = cities([4, W - 5], { rows });
  const p = previewRoute(s, ruleset, city(4).id, city(W - 5).id);
  assert.equal(p.domain, 'sea');
  assert.equal(routeProblem(s, ruleset, 'f0', trader, city(W - 5).id), null);
});

test('yields by the tables: domestic feeds both ends; foreign pays the origin', () => {
  const dom = cities([1, 7]);
  const table = Object.values(ruleset.trade).find((x) => x.kind === 'domestic' && x.domain === 'land');
  let s = play(dom.s, { type: 'startTradeRoute', faction: 'f0', unit: dom.trader, city: dom.city(7).id }).state;
  assert.deepEqual(cityTradeYields(s, ruleset, s.cities[dom.city(1).id]), table.originYields);
  assert.deepEqual(cityTradeYields(s, ruleset, s.cities[dom.city(7).id]), table.destinationYields);
  const fx = cities([1, 7], { theirs: [1] });
  const ft = Object.values(ruleset.trade).find((x) => x.kind === 'foreign' && x.domain === 'land');
  s = play(fx.s, { type: 'startTradeRoute', faction: 'f0', unit: fx.trader, city: fx.city(7).id }).state;
  assert.deepEqual(cityTradeYields(s, ruleset, s.cities[fx.city(1).id]), ft.originYields);
  assert.deepEqual(cityTradeYields(s, ruleset, s.cities[fx.city(7).id]), ft.destinationYields);
  assert.equal(s.trade.routes[0].kind, 'foreign');
});

test('a road is laid along a land route, and the trader becomes the route', () => {
  const { s: s0, city, trader } = cities([1, 9]);
  const p = previewRoute(s0, ruleset, city(1).id, city(9).id);
  const s = play(s0, { type: 'startTradeRoute', faction: 'f0', unit: trader, city: city(9).id }).state;
  assert.ok(p.path.length >= 9);
  for (const t of p.path) assert.equal(s.map.road[t], 1, `road on ${t}`);
  assert.equal(s.units[trader], undefined);
  assert.equal(s.trade.routes[0].until, s.turn + T.routeTurns);
});

test('routes end after 30 turns and the trader comes home; war ends them early', () => {
  let { s, city, trader } = cities([1, 7]);
  s = play(s, { type: 'startTradeRoute', faction: 'f0', unit: trader, city: city(7).id }).state;
  s.turn += T.routeTurns - 1;
  s = passRound(s);
  assert.equal(s.trade.routes.length, 0, 'ended at its 30th turn');
  assert.ok(Object.values(s.units).some((u) => u.type === 'trader' && u.tile === city(1).tile), 'the trader is back');
  const fx = cities([1, 7], { theirs: [1] });
  let t = play(fx.s, { type: 'startTradeRoute', faction: 'f0', unit: fx.trader, city: fx.city(7).id }).state;
  t = play(t, { type: 'declareWar', faction: 'f0', target: 'f1' }).state;
  t = passRound(t);
  assert.equal(t.trade.routes.length, 0, 'war ends the route');
});

test('routes carry religion beyond the 10-hex pressure range', () => {
  let { s, city, trader } = cities([1, 14]);
  const a = city(1).id;
  const b = city(14).id;
  s.religion.religions.solar_way = { id: 'solar_way', name: null, founder: 'f0', holyCity: a, beliefs: ['choral_music', 'tithe'], founded: 1 };
  s.cities[a].pop = 4;
  s.cities[a].followers = { solar_way: 4 };
  const without = structuredClone(s);
  religionRound(without, ruleset, []);
  assert.equal(without.cities[b].pressure?.solar_way ?? 0, 0, '13 hexes is beyond range');
  s = play(s, { type: 'startTradeRoute', faction: 'f0', unit: trader, city: b }).state;
  religionRound(s, ruleset, []);
  assert.ok((s.cities[b].pressure?.solar_way ?? 0) > 0 || (s.cities[b].followers?.solar_way ?? 0) > 0, 'the route carries it');
});

test('a luxury traded away: the receiver gains its amenity; the giver loses it unless it has a spare', () => {
  const { s } = cities([1, 7], { theirs: [1] });
  const lux = Object.values(ruleset.resources).find((r) => r.class === 'luxury');
  const home = Object.values(s.cities).find((c) => c.faction === 'f0');
  const tiles = s.owner.map((o, i) => (o === home.id && i !== home.tile ? i : -1)).filter((i) => i >= 0);
  const imp = s.map.improvementIds.indexOf(lux.improvement);
  const place = (t) => { s.map.resource = s.map.resource.slice(); s.map.resource[t] = s.map.resourceIds.indexOf(lux.id); s.map.improvement[t] = imp; };
  place(tiles[0]);
  assert.ok(luxuriesOf(s, ruleset, 'f0').includes(lux.id));
  s.diplomacy.resources.push({ from: 'f0', to: 'f1', resource: lux.id, until: s.turn + 30 });
  assert.ok(!luxuriesOf(s, ruleset, 'f0').includes(lux.id), 'the only copy has gone');
  assert.ok(luxuriesOf(s, ruleset, 'f1').includes(lux.id), 'the receiver has it');
  place(tiles[1]);
  assert.ok(luxuriesOf(s, ruleset, 'f0').includes(lux.id), 'with a second copy, one is kept');
});
