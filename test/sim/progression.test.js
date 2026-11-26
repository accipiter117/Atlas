// Phase 8: technology costs, research flow, boosts and eras.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset, fixtureGame, play } from './fixtures.js';
import { costOf, available, eraOf, knows, researchOf, applyCommand, view } from '../../src/sim/index.js';
import { addResearch, applyBoosts, grantErasBefore } from '../../src/sim/progression.js';

const game = () => fixtureGame(['.....', '.....'], [{ type: 'warrior', at: 0 }], { knowAll: false });
const f0 = (s) => s.factions.find((f) => f.id === 'f0');

test('tech cost follows data, era multiplier and game speed', () => {
  const s = game();
  const base = ruleset.techs.pottery.cost * ruleset.eras.ancient.costMultiplier;
  assert.equal(costOf(s, ruleset, 'pottery'), base);
  s.setup = { ...s.setup, speed: 'epic' };
  assert.equal(costOf(s, ruleset, 'pottery'), Math.round(base * ruleset.tuning.speeds.epic));
  s.setup = { ...s.setup, speed: 'quick' };
  assert.equal(costOf(s, ruleset, 'pottery'), Math.round(base * ruleset.tuning.speeds.quick));
  assert.equal(costOf(s, ruleset, 'no_such_tech'), Infinity);
});

test('only techs with every prerequisite known can be chosen', () => {
  let s = game();
  assert.ok(available(s, ruleset, 'f0').includes('pottery'));
  assert.ok(!available(s, ruleset, 'f0').includes('irrigation'));
  const res = applyCommand(s, { type: 'setResearch', faction: 'f0', item: 'irrigation' }, ruleset);
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'notAvailable');
  s = play(s, { type: 'setResearch', faction: 'f0', item: 'pottery' }).state;
  assert.equal(researchOf(f0(s)).current, 'pottery');
});

test('queueing a far tech queues its whole path, prerequisites first', () => {
  let s = game();
  s = play(s, { type: 'queueResearch', faction: 'f0', item: 'currency' }).state;
  const r = researchOf(f0(s));
  assert.equal(r.current, 'pottery');
  assert.deepEqual(r.queue, ['writing', 'currency']);
});

test('science fills the current tech and overflow carries into the queue', () => {
  let s = game();
  s = play(s, { type: 'queueResearch', faction: 'f0', item: 'writing' }).state;
  const events = [];
  const pottery = costOf(s, ruleset, 'pottery');
  addResearch(s, ruleset, 'f0', pottery + 7, events);
  const r = researchOf(f0(s));
  assert.ok(knows(s, 'f0', 'pottery'));
  assert.equal(r.current, 'writing');
  assert.equal(r.progress.writing, 7);
  assert.deepEqual(events.map((e) => e.type), ['techLearned']);
});

test('science earned with nothing chosen waits for the next choice', () => {
  const s = game();
  f0(s).stocks.science = 0;
  addResearch(s, ruleset, 'f0', 12, []);
  assert.equal(f0(s).stocks.science, 12);
  researchOf(f0(s)).current = 'pottery';
  addResearch(s, ruleset, 'f0', 3, []);
  assert.equal(researchOf(f0(s)).progress.pottery, 15);
  assert.equal(f0(s).stocks.science, 0);
});

test('boost triggers pay their share of the cost once', () => {
  const s = game();
  const share = ruleset.tuning.progression.boostShare;
  const events = [{ type: 'cityFounded', faction: 'f0' }];
  applyBoosts(s, ruleset, events);
  assert.ok(!events.some((e) => e.type === 'boost'), 'sailing needs two cities');
  const more = [{ type: 'cityFounded', faction: 'f0' }];
  applyBoosts(s, ruleset, more);
  const boosts = more.filter((e) => e.type === 'boost').map((e) => e.item).sort();
  assert.deepEqual(boosts, ['sailing', 'writing']);
  assert.equal(researchOf(f0(s)).progress.sailing, Math.round(costOf(s, ruleset, 'sailing') * share));
  const again = [{ type: 'cityFounded', faction: 'f0' }];
  applyBoosts(s, ruleset, again);
  assert.ok(!again.some((e) => e.type === 'boost'), 'a boost pays only once');
});

test('kill boosts go to the killer, building boosts match the building id', () => {
  const s = game();
  const ev = [{ type: 'unitKilled', faction: 'f1', by: 'f0' }];
  applyBoosts(s, ruleset, ev);
  assert.ok(ev.some((e) => e.type === 'boost' && e.faction === 'f0' && e.item === 'archery'));
  assert.ok(!researchOf(s.factions.find((f) => f.id === 'f1')).boosted.includes('archery'));
  const b = [{ type: 'improvementBuilt', faction: 'f0', improvement: 'farm' }, { type: 'improvementBuilt', faction: 'f0', improvement: 'pasture' }];
  applyBoosts(s, ruleset, b);
  const got = b.filter((e) => e.type === 'boost').map((e) => e.item).sort();
  assert.deepEqual(got, ['horseback_riding', 'irrigation']);
});

test('a faction moves to the next era when it knows half of that era', () => {
  const s = game();
  assert.equal(eraOf(s, ruleset, 'f0'), 'ancient');
  const classical = Object.values(ruleset.techs).filter((t) => t.era === 'classical').map((t) => t.id);
  const r = researchOf(f0(s));
  r.known.push(...classical.slice(0, Math.ceil(classical.length / 2) - 1));
  assert.equal(eraOf(s, ruleset, 'f0'), 'ancient');
  r.known.push(classical[Math.ceil(classical.length / 2) - 1]);
  assert.equal(eraOf(s, ruleset, 'f0'), 'classical');
});

test('later start eras grant every tech of the eras before', () => {
  const s = game();
  grantErasBefore(s, ruleset, 'f0', 'medieval');
  const want = Object.values(ruleset.techs).filter((t) => ['ancient', 'classical'].includes(t.era)).map((t) => t.id).sort();
  assert.deepEqual([...researchOf(f0(s)).known].sort(), want);
});

test('strategic resources stay hidden in the view until their tech is known', () => {
  const s = game();
  const hidden = Object.values(ruleset.resources).find((r) => r.revealedBy);
  s.map.resource[3] = s.map.resourceIds.indexOf(hidden.id);
  assert.equal(view(s, 'f0', ruleset).map.resource[3], -1);
  researchOf(f0(s)).known.push(hidden.revealedBy);
  assert.equal(view(s, 'f0', ruleset).map.resource[3], s.map.resourceIds.indexOf(hidden.id));
});
