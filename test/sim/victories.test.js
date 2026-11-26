// Phase 9: each victory fires in a scripted scenario, and not before; knock-outs;
// projects; the turn limit; and a won game refusing further commands.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset, fixtureGame, play } from './fixtures.js';
import { applyCommand, currentFactionId, scoreOf, turnLimit, victoryProgress } from '../../src/sim/index.js';
import { buildingProblem } from '../../src/sim/buildings.js';
import { completeItem } from '../../src/sim/cities.js';

const ROWS = ['..........', '..........', '..........', '..........'];

/** Two factions, each with a capital far apart, at the start of f0's turn. */
function twoCapitals(extraSetup = {}) {
  let s = fixtureGame(ROWS, [{ type: 'settler', at: 1 }, { type: 'settler', faction: 'f1', at: 38 }, { type: 'warrior', at: 11 }, { type: 'warrior', faction: 'f1', at: 28 }]);
  s.setup = { ...s.setup, ...extraSetup };
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }).state;
  s = play(s, { type: 'endTurn', faction: 'f0' }).state;
  s = play(s, { type: 'foundCity', faction: 'f1', unit: 'u_0002' }).state;
  s = play(s, { type: 'endTurn', faction: 'f1' }).state;
  assert.equal(currentFactionId(s), 'f0');
  return s;
}
const cityOf = (s, f) => Object.values(s.cities).find((c) => c.foundedBy === f);
/** End turns until the round ends (or the game does). */
function endRound(s) {
  let state = s;
  const turn = state.turn;
  while (state.turn === turn && !state.winner) state = play(state, { type: 'endTurn', faction: currentFactionId(state) }).state;
  return state;
}

test('conquest: holding every original capital wins at the end of the round, not before', () => {
  let s = twoCapitals();
  assert.ok(cityOf(s, 'f0').originalCapital && cityOf(s, 'f1').originalCapital);
  s = endRound(s);
  assert.equal(s.winner ?? null, null, 'nothing won while each holds its own capital');
  // f0 takes f1's capital (scripted).
  s.cities[cityOf(s, 'f1').id].faction = 'f0';
  s = play(s, { type: 'endTurn', faction: 'f0' }).state;
  assert.equal(s.winner ?? null, null, 'not mid-round');
  s = endRound(s);
  assert.deepEqual({ ...s.winner, turn: undefined }, { faction: 'f0', victory: 'conquest', turn: undefined, team: null });
});

test('conquest needs every rival to have founded a capital first', () => {
  let s = fixtureGame(ROWS, [{ type: 'settler', at: 1 }, { type: 'settler', faction: 'f1', at: 38 }]);
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }).state;
  s = endRound(s);
  assert.equal(s.winner ?? null, null);
});

test('a faction with no cities and no settler is knocked out; the last one standing wins', () => {
  let s = twoCapitals({ elimination: true });
  const theirs = cityOf(s, 'f1');
  delete s.cities[theirs.id];
  s.owner = s.owner.map((o) => (o === theirs.id ? null : o));
  s = endRound(s);
  assert.equal(s.factions.find((f) => f.id === 'f1').alive, false);
  assert.ok(!Object.values(s.units).some((u) => u.faction === 'f1'), 'their units are gone');
  assert.equal(s.winner.faction, 'f0');
  assert.equal(s.winner.victory, 'conquest');
});

test('science: the third project wins; two are not enough', () => {
  let s = twoCapitals();
  const city = cityOf(s, 'f0');
  // Voyage Beyond needs the other two first.
  assert.equal(buildingProblem(s, ruleset, city, 'voyage_beyond', 'wonder'), 'needsProject');
  for (const p of ['great_observatory', 'atlas_of_the_world']) {
    assert.equal(buildingProblem(s, ruleset, city, p, 'wonder'), null);
    const events = completeItem(s, ruleset, s.cities[city.id], { kind: 'wonder', id: p });
    assert.ok(events.some((e) => e.type === 'projectCompleted' && e.project === p));
    assert.equal(buildingProblem(s, ruleset, city, p, 'wonder'), 'built', 'each project once per faction');
  }
  assert.ok(!s.cities[city.id].buildings.includes('great_observatory'), 'projects are not buildings');
  assert.equal(buildingProblem(s, ruleset, cityOf(s, 'f1'), 'great_observatory', 'wonder'), null, 'rivals build their own');
  s = endRound(s);
  assert.equal(s.winner ?? null, null);
  completeItem(s, ruleset, s.cities[city.id], { kind: 'wonder', id: 'voyage_beyond' });
  s = endRound(s);
  assert.equal(s.winner.victory, 'science');
  assert.equal(s.winner.faction, 'f0');
});

test('score: the highest score wins when the turn-limit round ends', () => {
  let s = twoCapitals({ turnLimit: 4 });
  s.cities[cityOf(s, 'f1').id].pop = 6;
  while (s.turn < 4) {
    s = endRound(s);
    if (s.turn < 4) assert.equal(s.winner ?? null, null, `turn ${s.turn}`);
  }
  assert.equal(s.winner ?? null, null, 'turn 4 has started but not ended');
  s = endRound(s);
  assert.equal(s.winner.victory, 'score');
  assert.equal(s.winner.turn, 4);
  assert.equal(s.winner.faction, 'f1');
  assert.ok(scoreOf(s, ruleset, 'f1') > scoreOf(s, ruleset, 'f0'));
});

test('a won game refuses every further command', () => {
  let s = twoCapitals({ turnLimit: 2 });
  s = endRound(s);
  assert.ok(s.winner);
  const r = applyCommand(s, { type: 'endTurn', faction: 'f0' }, ruleset);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'gameOver');
});

test('only the victories chosen in setup can be won', () => {
  let s = twoCapitals({ victories: ['score'] });
  s.cities[cityOf(s, 'f1').id].faction = 'f0';
  s = endRound(s);
  assert.equal(s.winner ?? null, null);
  assert.deepEqual(victoryProgress(s, ruleset).map((v) => v.id), ['score']);
});

test('turn limits: by game speed, a custom number, or none', () => {
  const s = twoCapitals();
  assert.equal(turnLimit(s, ruleset), 330);
  assert.equal(turnLimit({ setup: { speed: 'quick' } }, ruleset), 220);
  assert.equal(turnLimit({ setup: { speed: 'epic' } }, ruleset), 500);
  assert.equal(turnLimit({ setup: { turnLimit: 99 } }, ruleset), 99);
  assert.equal(turnLimit({ setup: { turnLimit: null } }, ruleset), null);
});

test('victory progress reports every faction on every active path, in range', () => {
  const s = twoCapitals();
  s.projects = { f0: ['great_observatory'] };
  const p = Object.fromEntries(victoryProgress(s, ruleset).map((v) => [v.id, v.rows]));
  assert.deepEqual(Object.keys(p).sort(), ['conquest', 'religious', 'science', 'score']);
  assert.deepEqual(p.conquest.map((r) => [r.value, r.target]), [[1, 2], [1, 2]]);
  assert.deepEqual(p.science.map((r) => [r.value, r.target]), [[1, 3], [0, 3]]);
  for (const r of p.score) assert.ok(Number.isFinite(r.value) && r.value > 0 && r.turnsLeft >= 0);
});
