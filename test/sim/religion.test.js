// Phase 13: religion. Pressure maths by fixture, the religion limit, belief
// effects, missionaries, and the religious victory exactly at its threshold.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset, fixtureGame, play } from './fixtures.js';
import { applyCommand, majorityOf, religionLimit, cityYields, createGame, pantheonFaith, foundFaith, missionaryFaith } from '../../src/sim/index.js';
import { religionRound, pressureFrom, convert } from '../../src/sim/religion.js';
import { checkVictory } from '../../src/sim/victories/index.js';

const T = ruleset.tuning.religion;
const ROW = '.'.repeat(20);

/** Three cities on one row: A (f0) at column 1, B (f0) at column 7, C (f1) at column 18. */
function threeCities() {
  let s = fixtureGame([ROW, ROW, ROW], [{ type: 'settler', at: 21 }, { type: 'settler', at: 27 }, { type: 'settler', faction: 'f1', at: 38 }]);
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }).state;
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0002' }).state;
  s = play(s, { type: 'endTurn', faction: 'f0' }).state;
  s = play(s, { type: 'foundCity', faction: 'f1', unit: 'u_0003' }).state;
  s = play(s, { type: 'endTurn', faction: 'f1' }).state;
  const at = (tile) => Object.values(s.cities).find((c) => c.tile === tile);
  return { s, A: at(21).id, B: at(27).id, C: at(38).id };
}
/** Give f0 a founded religion with its holy city at A. */
function withReligion(s, A, beliefs = ['choral_music', 'tithe']) {
  s.religion.pantheons.f0 = 'forge_spirit';
  s.religion.religions.solar_way = { id: 'solar_way', name: null, founder: 'f0', holyCity: A, beliefs, founded: s.turn };
  s.cities[A].pop = 4;
  s.cities[A].followers = { solar_way: 4 };
  return s;
}

test('pressure maths: holy cities press harder, within range only, and convert at the threshold', () => {
  const { s, A, B, C } = threeCities();
  withReligion(s, A);
  const expected = (T.pressurePerCity + 4 * T.pressurePerFollower) * T.holyCityPressure;
  assert.equal(pressureFrom(s, ruleset, s.cities[A]), expected);
  assert.equal(pressureFrom(s, ruleset, s.cities[B]), 0, 'no religion, no pressure');
  religionRound(s, ruleset, []);
  // B (6 hexes away) gets A's pressure; C (17 away) is beyond pressureRange.
  const b = s.cities[B];
  const rounds = Math.ceil(T.convertAt / expected);
  assert.equal(Object.keys(s.cities[C].pressure ?? {}).length, 0);
  assert.equal(b.followers?.solar_way ?? 0, expected >= T.convertAt ? 1 : 0);
  for (let i = 1; i < rounds; i += 1) religionRound(s, ruleset, []);
  assert.equal(b.followers.solar_way, 1, `one convert after ${rounds} rounds`);
  assert.ok(Math.abs(b.pressure.solar_way - (expected * rounds - T.convertAt)) < 1e-9, 'pressure carries over');
  assert.equal(majorityOf(b), 'solar_way');
});

test('convert takes people of no religion first, then the biggest other group', () => {
  const city = { pop: 4, followers: { a: 1, b: 2 } };
  convert(city, 'c', 1);
  assert.deepEqual(city.followers, { a: 1, b: 2, c: 1 });
  convert(city, 'c', 1);
  assert.deepEqual(city.followers, { a: 1, b: 1, c: 2 });
  assert.equal(majorityOf(city), 'c');
  assert.equal(majorityOf({ pop: 4, followers: { a: 2, b: 2 } }), null, 'a tie is no majority');
});

test('the religion limit is half the factions, rounded up', () => {
  const g = createGame(ruleset, { seed: 2, players: Array.from({ length: 5 }, () => ({ kind: 'ai' })), map: { size: 'small', type: 'continents' } });
  assert.equal(religionLimit(g, ruleset), 3);
  const { s, A, C } = threeCities();
  assert.equal(religionLimit(s, ruleset), 1);
  withReligion(s, A);
  s.factions[1].stocks.faith = 1000;
  s.religion.pantheons.f1 = 'harvest_mother';
  s.cities[C].buildings.push('shrine');
  const r = applyCommand({ ...s, seatIndex: s.seatOrder.indexOf('f1') }, { type: 'foundReligion', faction: 'f1', religion: 'starward_faith', follower: 'feast_days', founder: 'pilgrimage', city: C }, ruleset);
  assert.equal(r.error.code, 'noReligionsLeft');
});

test('pantheon then founding: faith costs, a name, beliefs taken once', () => {
  let { s, A } = threeCities();
  s.factions[0].stocks.faith = pantheonFaith(s, ruleset) - 1;
  assert.equal(applyCommand(s, { type: 'choosePantheon', faction: 'f0', belief: 'forge_spirit' }, ruleset).error.code, 'notEnoughFaith');
  s.factions[0].stocks.faith = pantheonFaith(s, ruleset) + foundFaith(s, ruleset);
  s = play(s, { type: 'choosePantheon', faction: 'f0', belief: 'forge_spirit' }).state;
  const found = { type: 'foundReligion', faction: 'f0', religion: 'solar_way', follower: 'choral_music', founder: 'tithe', city: A, name: 'The Way of Dawn' };
  assert.equal(applyCommand(s, found, ruleset).error.code, 'needsHolyCity');
  s.cities[A].buildings.push('shrine');
  s = play(s, found).state;
  assert.equal(s.religion.religions.solar_way.name, 'The Way of Dawn');
  assert.equal(majorityOf(s.cities[A]), 'solar_way', 'the holy city converts at once');
  assert.equal(s.factions[0].stocks.faith, 0);
  assert.equal(applyCommand(s, { type: 'choosePantheon', faction: 'f0', belief: 'war_drums' }, ruleset).error.code, 'hasPantheon');
});

test('belief effects: pantheon in all your cities, follower beliefs in following cities, founder pays per follower city', () => {
  const { s, A, C } = threeCities();
  withReligion(s, A, ['choral_music', 'tithe']);
  const now = (id) => cityYields(s, ruleset, s.cities[id]).total;
  // Pantheon Forge Spirit: +1 production in f0's cities.
  const withPantheon = now(A).production;
  delete s.religion.pantheons.f0;
  assert.ok(withPantheon - now(A).production > 0.5, 'Forge Spirit adds about 1 (the city mood percentage scales it)');
  s.religion.pantheons.f0 = 'forge_spirit';
  // C (f1) starts to follow the religion: Choral Music works there for f1, and Tithe pays f0 per follower city.
  const cultureC = now(C).culture;
  const goldA = now(A).gold;
  s.cities[C].followers = { solar_way: s.cities[C].pop };
  assert.ok(now(C).culture > cultureC + 0.5, 'Choral Music in a following city, whoever owns it (percentages may add a little more)');
  assert.ok(now(A).gold > goldA + 0.5, 'Tithe: +1 gold per follower city (now 2 of them)');
});

test('missionaries: bought with faith where your religion holds, convert 2, three uses', () => {
  let { s, A, B } = threeCities();
  withReligion(s, A);
  s.factions[0].stocks.faith = missionaryFaith(s, ruleset) * 2;
  assert.equal(applyCommand(s, { type: 'buyWithFaith', faction: 'f0', city: B, item: { kind: 'unit', id: 'missionary' } }, ruleset).error.code, 'cannotBuyWithFaith', 'B does not follow it');
  const r = play(s, { type: 'buyWithFaith', faction: 'f0', city: A, item: { kind: 'unit', id: 'missionary' } });
  s = r.state;
  const m = Object.values(s.units).find((u) => u.type === 'missionary');
  assert.equal(m.religion, 'solar_way');
  assert.equal(m.charges, ruleset.units.missionary.charges);
  assert.equal(s.factions[0].stocks.faith, missionaryFaith(s, ruleset));
  assert.equal(applyCommand(s, { type: 'setProduction', faction: 'f0', city: A, item: { kind: 'unit', id: 'missionary' } }, ruleset).ok, false, 'never built with production');
  // Walk it next to B and preach (moves restored for the test).
  s.units[m.id].tile = 26;
  s.units[m.id].moves = 4;
  s.cities[B].pop = 3;
  s = play(s, { type: 'spreadReligion', faction: 'f0', unit: m.id }).state;
  assert.equal(s.cities[B].followers.solar_way, T.missionaryFollowers);
  assert.equal(s.units[m.id].charges, ruleset.units.missionary.charges - 1);
});

test('religious victory fires when more than half of every faction\'s cities follow, not at exactly half', () => {
  const { s, A, B, C } = threeCities();
  withReligion(s, A);
  s.turn = 10;
  // f0: A follows (1 of 2 cities: exactly half); f1: C follows (1 of 1).
  s.cities[B].followers = {};
  s.cities[C].followers = { solar_way: s.cities[C].pop };
  checkVictory(s, ruleset, []);
  assert.equal(s.winner ?? null, null, 'exactly half is not enough');
  s.cities[B].followers = { solar_way: s.cities[B].pop };
  checkVictory(s, ruleset, []);
  assert.equal(s.winner.victory, 'religious');
  assert.equal(s.winner.faction, 'f0');
});
