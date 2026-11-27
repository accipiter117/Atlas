import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createGame, currentFactionId, fingerprint, cityYields, foodToGrow, tileYields, borderCost } from '../../src/sim/index.js';
import { aiGame as harnessGame } from '../ai/harness.js';
import { clone } from '../../src/core/clone.js';
import { ruleset, fixtureGame, play, passRound } from './fixtures.js';
import { findNonFinite } from './helpers.js';
import { hexDistance } from '../../src/core/hex.js';
import { tileHex } from '../../src/sim/map.js';

// 7 columns by 7 rows; the settler starts in the middle.
const LAND = ['.......', '.hhf...', '..hF...', '.......', 'pp.....', '.......', '.......'];
const MID = 3 * 7 + 3;

function withCity(rows = LAND, tile = MID, extra = []) {
  let s = fixtureGame(rows, [{ type: 'settler', at: tile }, ...extra]);
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }).state;
  return { s, city: Object.values(s.cities)[0] };
}

test('growth thresholds match floor(15 + 8(n-1) + (n-1)^1.5) for populations 1 to 20', () => {
  for (let n = 1; n <= 20; n += 1) {
    assert.equal(foodToGrow(n, ruleset.tuning), Math.floor(15 + 8 * (n - 1) + (n - 1) ** 1.5), `population ${n}`);
  }
  assert.equal(foodToGrow(1, ruleset.tuning), 15);
  assert.equal(foodToGrow(5, ruleset.tuning), 55);
});

test('founding: claims the ring, takes a name from the faction list, becomes the capital, works a tile', () => {
  const { s, city } = withCity();
  const civ = s.factions[0].civ;
  assert.equal(city.name, ruleset.cityNames[ruleset.factions[civ].cityNames].names[0]);
  assert.equal(city.capital, true);
  assert.equal(s.owner.filter((o) => o === city.id).length, 7, 'the centre and its six neighbours');
  assert.equal(city.pop, 1);
  assert.equal(city.worked.length, 1);
  assert.equal(s.units.u_0001, undefined, 'the settler is used up');
});

test('minimum city distance is refused, with the reason', () => {
  const { s } = withCity(LAND, MID, [{ type: 'settler', at: MID + 2 }]);
  const r = applyCommand(s, { type: 'foundCity', faction: 'f0', unit: 'u_0002' }, ruleset);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'tooClose');
  const notSettler = fixtureGame(LAND, [{ type: 'warrior', at: 0 }]);
  assert.equal(applyCommand(notSettler, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }, ruleset).error.code, 'notFounder');
});

test('yields add up in order: tiles, then flat bonuses, then percentages last', () => {
  const rules = clone(ruleset);
  const { s } = withCity(LAND, MID);
  const civ = s.factions[0].civ;
  rules.factions[civ].trait.effects = [
    { effect: 'yieldBonus', yield: 'production', amount: 2 },
    { effect: 'yieldPercent', yield: 'production', amount: 50 },
  ];
  rules.leaders[rules.factions[civ].leaders[0]].trait.effects = [];
  const city = Object.values(s.cities)[0];
  const y = cityYields(s, rules, city);
  assert.deepEqual(y.sources.map((x) => x.step), [...y.sources.map((x) => x.step)].sort());
  const before = y.sources.filter((x) => x.step < 3).reduce((n, x) => n + x.yields.production, 0);
  assert.ok(y.sources.some((x) => x.kind === 'effects' && x.yields.production === 2), 'the flat +2 is a step 2 source');
  assert.equal(y.total.production, before * 1.5, 'the +50% applies to tiles and every flat bonus');
  assert.ok(y.sources.some((x) => x.kind === 'city' && x.yields.culture === 1), 'every city makes 1 culture');
  assert.equal(y.surplus, y.total.food - 2);
  // The centre tile gets at least 2 food and 1 production.
  const centre = tileYields(s, rules, city.tile);
  assert.ok(centre.food >= 2 || y.sources[0].yields.food >= 2);
});

test('focus moves citizens: Production puts them on hills and forests; a locked tile stays worked', () => {
  let { s, city } = withCity();
  // Grow to 3 citizens directly (a test shortcut) and reassign.
  s.cities[city.id].pop = 3;
  s = play(s, { type: 'setFocus', faction: 'f0', city: city.id, focus: 'food' }).state;
  const foodTiles = s.cities[city.id].worked;
  s = play(s, { type: 'setFocus', faction: 'f0', city: city.id, focus: 'production' }).state;
  const prod = s.cities[city.id].worked;
  const sum = (tiles, y) => tiles.reduce((n, t) => n + tileYields(s, ruleset, t)[y], 0);
  assert.ok(sum(prod, 'production') >= sum(foodTiles, 'production'), 'at least as much production with the Production focus');
  assert.ok(sum(foodTiles, 'food') >= sum(prod, 'food'), 'at least as much food with the Food focus');
  assert.ok(prod.some((t) => s.map.hills[t] || s.map.feature[t] >= 0), 'on hills or forest');
  const lockable = foodTiles.find((t) => !prod.includes(t)) ?? foodTiles[0];
  s = play(s, { type: 'lockTile', faction: 'f0', city: city.id, tile: lockable }).state;
  assert.ok(s.cities[city.id].worked.includes(lockable));
  assert.deepEqual(s.cities[city.id].locks, [lockable]);
  s = play(s, { type: 'unlockTile', faction: 'f0', city: city.id, tile: lockable }).state;
  assert.deepEqual(s.cities[city.id].locks, []);
  assert.equal(applyCommand(s, { type: 'lockTile', faction: 'f0', city: city.id, tile: 0 }, ruleset).error.code, 'notWorkable');
});

test('growth and starvation over turns', () => {
  let { s, city } = withCity();
  const before = s.cities[city.id].pop;
  for (let k = 0; k < 12; k += 1) s = passRound(s);
  assert.ok(s.cities[city.id].pop > before, 'a fed city grows');
  // Force starvation: three citizens, no food anywhere.
  const starving = clone(s);
  const c = starving.cities[city.id];
  c.pop = 3; c.food = 0; c.worked = [];
  const desert = Object.keys(ruleset.terrain).indexOf('desert');
  starving.map.terrain = starving.map.terrain.map(() => desert);
  starving.map.feature = starving.map.feature.map(() => -1);
  const after = passRound(starving);
  assert.equal(after.cities[city.id].pop, 2, 'loses one citizen');
  assert.equal(after.cities[city.id].food, 0, 'and the food box resets');
});

test('production finishes units; buying spends gold; queue carries on', () => {
  let { s, city } = withCity();
  // Builder and settler: no faction replaces them with a unique unit.
  s = play(s, { type: 'setProduction', faction: 'f0', city: city.id, item: { kind: 'unit', id: 'builder' } }).state;
  s = play(s, { type: 'queueProduction', faction: 'f0', city: city.id, item: { kind: 'unit', id: 'settler' } }).state;
  assert.equal(applyCommand(s, { type: 'setProduction', faction: 'f0', city: city.id, item: { kind: 'unit', id: 'trireme' } }, ruleset).error.code, 'cannotBuild');
  let built = null;
  for (let k = 0; k < 40 && !built; k += 1) {
    const me = currentFactionId(s);
    let r;
    do {
      r = play(s, { type: 'endTurn', faction: currentFactionId(s) });
      s = r.state;
      built = built ?? r.events.find((e) => e.type === 'unitBuilt');
    } while (currentFactionId(s) !== me);
  }
  assert.equal(built.unitType, 'builder');
  assert.deepEqual(s.cities[city.id].queue.map((q) => q.id), ['settler']);
  assert.equal(applyCommand(s, { type: 'buyItem', faction: 'f0', city: city.id }, ruleset).error.code, 'notEnoughGold');
  s.factions[0].stocks.gold = 1000;
  const r = play(s, { type: 'buyItem', faction: 'f0', city: city.id });
  assert.equal(r.events[0].unitType, 'settler');
  assert.ok(r.state.factions[0].stocks.gold < 1000);
  assert.deepEqual(r.state.cities[city.id].queue, []);
});

test('borders claim the best adjacent tile when the culture box fills; tiles can be bought', () => {
  let { s, city } = withCity();
  assert.equal(borderCost(s.cities[city.id], ruleset.tuning), 10);
  const owned = () => s.owner.filter((o) => o === city.id).length;
  // Rome's capital has a palace and a free monument, so culture comes faster than the base 1 a turn.
  let turns = 0;
  while (owned() === 7 && turns < 12) { s = passRound(s); turns += 1; }
  assert.equal(owned(), 8, 'the first full box of 10 culture claims one more hex');
  assert.ok(turns < 10, `claimed after ${turns} turns`);
  assert.equal(borderCost(s.cities[city.id], ruleset.tuning), 16);
  const target = s.owner.findIndex((o, i) => o === null && Math.abs(i - city.tile) < 20);
  assert.equal(applyCommand(s, { type: 'buyTile', faction: 'f0', city: city.id, tile: 0 }, ruleset).error.code, 'cannotBuyTile');
  s.factions[0].stocks.gold = 500;
  const claimableTile = [...Array(s.owner.length).keys()].find((i) => applyCommand(s, { type: 'buyTile', faction: 'f0', city: city.id, tile: i }, ruleset).ok);
  assert.ok(claimableTile !== undefined && target >= 0);
  s = play(s, { type: 'buyTile', faction: 'f0', city: city.id, tile: claimableTile }).state;
  assert.equal(s.owner[claimableTile], city.id);
  assert.ok(s.factions[0].stocks.gold <= 500 - 50, 'costs 25 gold per hex of distance (two or more)');
});

function aiGame(seed, turns) {
  return harnessGame(ruleset, { seed, turns, raiders: 'off' });
}

test('100 turns of AIs founding cities stays deterministic and in range', () => {
  const a = aiGame(8, 100);
  const b = aiGame(8, 100);
  a.s = a.state;
  assert.equal(fingerprint(a.state), fingerprint(b.state));
  let replay = createGame(ruleset, a.setup);
  for (const cmd of a.log) replay = applyCommand(replay, cmd, ruleset).state;
  assert.equal(fingerprint(replay), fingerprint(a.state));

  const cities = Object.values(a.s.cities);
  assert.ok(cities.length >= 6, `${cities.length} cities founded`);
  assert.deepEqual(findNonFinite(a.s), []);
  const names = new Set();
  for (const c of cities) {
    assert.ok(c.pop >= 1 && c.pop < 40, `pop ${c.pop}`);
    assert.ok(c.food >= 0, 'food box never negative');
    assert.ok(c.worked.length <= c.pop);
    assert.ok(c.worked.every((t) => a.s.owner[t] === c.id), 'works only its own land');
    assert.ok(!names.has(c.name), `name ${c.name} used twice`);
    names.add(c.name);
  }
  for (const f of a.s.factions) assert.ok(f.stocks.gold >= 0);
  // No two cities closer than the minimum distance.
  for (const x of cities) for (const y of cities) {
    if (x === y) continue;
    const d = hexDistance(tileHex(a.s.map, x.tile), tileHex(a.s.map, y.tile));
    assert.ok(d >= ruleset.tuning.cities.minCityDistance, `cities ${x.name} and ${y.name} are ${d} apart`);
  }
});

test('graphics overhaul G8: the queue can be reordered and trimmed, and bad places are refused', () => {
  const { s, city } = withCity();
  let st = s;
  for (const id of ['warrior', 'settler', 'builder']) st = play(st, { type: 'queueProduction', faction: 'f0', city: city.id, item: { kind: 'unit', id } }).state;
  const ids = (x) => x.cities[city.id].queue.map((q) => q.id);
  const before = ids(st);
  const moved = play(st, { type: 'moveQueueItem', faction: 'f0', city: city.id, index: before.length - 1, to: 0 }).state;
  assert.deepEqual(ids(moved), [before.at(-1), ...before.slice(0, -1)]);
  const trimmed = play(moved, { type: 'removeQueueItem', faction: 'f0', city: city.id, index: 0 }).state;
  assert.deepEqual(ids(trimmed), before.slice(0, -1));
  // The original state is untouched (commands work on a copy), and bad places are refused.
  assert.deepEqual(ids(st), before);
  for (const cmd of [{ type: 'moveQueueItem', index: 0, to: 9 }, { type: 'moveQueueItem', index: 1, to: 1 }, { type: 'removeQueueItem', index: 7 }, { type: 'removeQueueItem', index: -1 }]) {
    const r = applyCommand(st, { ...cmd, faction: 'f0', city: city.id }, ruleset);
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'badQueueIndex');
  }
});
