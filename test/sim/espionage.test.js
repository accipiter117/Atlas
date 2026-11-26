// Phase 15: espionage. The odds formula, outcome probabilities over 10,000
// seeded rolls, the spy cap per era, mission effects, and opinion when caught.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset, fixtureGame, play } from './fixtures.js';
import { applyCommand, spyCap, cityYields, opinionOf, amenitiesFor } from '../../src/sim/index.js';
import { missionOdds, rollOutcome, outcomeChances, resolveMission } from '../../src/sim/espionage.js';
import { addModifier, pairKey } from '../../src/sim/diplomacy.js';
import { buildOptions } from '../../src/sim/cities.js';
import { researchOf } from '../../src/sim/progression.js';
import { createRng } from '../../src/core/rng.js';

const T = ruleset.tuning.espionage;
const ROW = '.'.repeat(16);

/** f0 capital at column 1, f1 capital at column 10, both met, a spy unit for f0 in its capital. */
function game() {
  let s = fixtureGame([ROW, ROW, ROW], [{ type: 'settler', at: 17 }, { type: 'settler', faction: 'f1', at: 26 }, { type: 'spy', at: 17 }]);
  s.wars = [];
  s.diplomacy.met = [pairKey('f0', 'f1')];
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }).state;
  s = applyCommand({ ...s, seatIndex: s.seatOrder.indexOf('f1') }, { type: 'foundCity', faction: 'f1', unit: 'u_0002' }, ruleset).state;
  s = { ...s, seatIndex: s.seatOrder.indexOf('f0') };
  const mine = Object.values(s.cities).find((c) => c.faction === 'f0');
  const theirs = Object.values(s.cities).find((c) => c.faction === 'f1');
  return { s, mine, theirs };
}

test('odds: 60% plus 10% a level, less each defending spy, kept within the limits', () => {
  const { s, theirs } = game();
  const spy = { id: 's1', faction: 'f0', level: 0, city: theirs.id };
  assert.equal(missionOdds(s, ruleset, spy, 'siphon_funds', theirs), 60);
  assert.equal(missionOdds(s, ruleset, { ...spy, level: 2 }, 'siphon_funds', theirs), 80);
  s.espionage.spies.push({ id: 's9', faction: 'f1', level: 1, city: theirs.id, mission: null });
  assert.equal(missionOdds(s, ruleset, { ...spy, level: 2 }, 'siphon_funds', theirs), 80 - (T.defencePerSpy + T.defencePerLevel));
  s.espionage.spies.push({ id: 's8', faction: 'f1', level: 3, city: theirs.id, mission: null }, { id: 's7', faction: 'f1', level: 3, city: theirs.id, mission: null });
  assert.equal(missionOdds(s, ruleset, spy, 'siphon_funds', theirs), T.minOdds);
});

test('outcomes over 10,000 seeded rolls land within 1% of their chances', () => {
  for (const odds of [30, 60, 85]) {
    const rng = createRng(1234 + odds);
    const counts = { success: 0, identified: 0, escaped: 0, captured: 0 };
    for (let i = 0; i < 10_000; i += 1) counts[rollOutcome(rng.next(), rng.next(), odds, ruleset)] += 1;
    const want = outcomeChances(odds, ruleset);
    for (const k of Object.keys(counts)) assert.ok(Math.abs(counts[k] / 10_000 - want[k]) < 0.01, `${odds}% ${k}: ${counts[k] / 100}% against ${(want[k] * 100).toFixed(1)}%`);
  }
});

test('spy cap: one plus the era index; a city cannot train beyond it', () => {
  const { s, mine } = game();
  researchOf(s.factions[0]).known = [];
  researchOf(s.factions[0], 'civics').known.push('recorded_history');
  assert.equal(spyCap(s, ruleset, 'f0'), T.capBase + ruleset.eras[Object.values(ruleset.eras).sort((a, b) => a.index - b.index)[0].id].index);
  // f0 already has a spy unit: at the cap, no more spies in the build list.
  const options = (st) => buildOptions(st, ruleset, st.cities[mine.id]).map((o) => o.id);
  if (spyCap(s, ruleset, 'f0') <= 1) assert.ok(!options(s).includes('spy'));
  const classical = Object.values(ruleset.techs).filter((t) => t.era === 'classical').map((t) => t.id);
  researchOf(s.factions[0]).known.push(...classical);
  assert.equal(spyCap(s, ruleset, 'f0'), T.capBase + ruleset.eras.classical.index);
  assert.ok(options(s).includes('spy'), 'a new era, room for another');
});

test('posting a spy and starting a mission records its odds', () => {
  let { s, theirs } = game();
  s = play(s, { type: 'assignSpy', faction: 'f0', unit: 'u_0003', city: theirs.id }).state;
  const spy = s.espionage.spies[0];
  assert.equal(spy.city, theirs.id);
  assert.equal(applyCommand(s, { type: 'startMission', faction: 'f0', spy: spy.id, mission: 'steal_boost' }, ruleset).error.code, 'spyTooGreen');
  s = play(s, { type: 'startMission', faction: 'f0', spy: spy.id, mission: 'siphon_funds' }).state;
  assert.deepEqual(s.espionage.spies[0].mission, { id: 'siphon_funds', until: s.turn + ruleset.espionage.siphon_funds.turns, odds: 60 });
});

test('mission effects: siphon, sabotage, unrest, intel and a stolen boost', () => {
  const { s, theirs } = game();
  const spy = { id: 's1', faction: 'f0', level: 0, city: theirs.id, mission: null };
  s.espionage.spies.push(spy);
  const run = (id, outcome = 'success') => resolveMission(s, ruleset, spy, s.cities[theirs.id], ruleset.espionage[id], outcome, [], addModifier);
  s.factions[1].stocks.gold = 300;
  const g0 = s.factions[0].stocks.gold;
  assert.deepEqual(run('siphon_funds'), { gold: 60 });
  assert.equal(s.factions[0].stocks.gold, g0 + 60);
  assert.equal(spy.level, 1, 'a success is experience');
  s.cities[theirs.id].progress = 25;
  run('sabotage_production');
  assert.equal(s.cities[theirs.id].progress, 0);
  const before = amenitiesFor(s, ruleset, 'f1')[theirs.id].have;
  run('incite_unrest');
  assert.equal(amenitiesFor(s, ruleset, 'f1')[theirs.id].have, before - ruleset.espionage.incite_unrest.amount);
  s.factions[1].research.known.push('pottery');
  s.factions[0].research.known = s.factions[0].research.known.filter((x) => x !== 'pottery');
  researchOf(s.factions[0]).boosted = [];
  const r = run('steal_boost');
  assert.ok(r.tech);
  assert.ok(researchOf(s.factions[0]).progress[r.tech] > 0);
  run('gather_intel');
  assert.ok(s.espionage.intel.f0.f1, 'intel recorded');
  assert.ok(Number.isFinite(cityYields(s, ruleset, s.cities[theirs.id]).total.food));
});

test('being identified or captured costs opinion with a reason; captured spies are lost', () => {
  const { s, theirs } = game();
  const spy = { id: 's1', faction: 'f0', level: 0, city: theirs.id, mission: null };
  s.espionage.spies.push(spy);
  resolveMission(s, ruleset, spy, s.cities[theirs.id], ruleset.espionage.siphon_funds, 'identified', [], addModifier);
  const r = opinionOf(s, ruleset, 'f1', 'f0').reasons.find((x) => x.id === 'caughtSpying');
  assert.equal(r.amount, ruleset.diplomacy.caughtSpying.amount);
  resolveMission(s, ruleset, spy, s.cities[theirs.id], ruleset.espionage.siphon_funds, 'captured', [], addModifier);
  assert.equal(s.espionage.spies.length, 0);
  const esc = { id: 's2', faction: 'f0', level: 0, city: theirs.id, mission: null };
  s.espionage.spies.push(esc);
  resolveMission(s, ruleset, esc, s.cities[theirs.id], ruleset.espionage.siphon_funds, 'escaped', [], addModifier);
  assert.equal(s.cities[esc.city].faction, 'f0', 'an escaped spy goes home');
});
