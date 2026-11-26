// Phase 16: events with choices and the culture victory. Events fire only
// when their conditions hold, the turn waits for a choice, choices apply
// their effects, disasters need the setup option, and the culture victory
// needs influence above every living rival's lifetime culture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset, fixtureGame, play } from './fixtures.js';
import { applyCommand, cityYields, influencePerTurn, view } from '../../src/sim/index.js';
import { eventCities, startEventsTurn, emptyEvents } from '../../src/sim/events.js';
import { checkVictory } from '../../src/sim/victories/index.js';

const winner = (s) => { const c = { ...s, winner: null }; checkVictory(c, ruleset, []); return c.winner?.faction ?? null; };
import { chooseEventChoice } from '../../src/ai/planners/events.js';

const ROW = '.'.repeat(16);

function game(setup = {}) {
  let s = fixtureGame([ROW, ROW, ROW], [{ type: 'settler', at: 17 }, { type: 'settler', faction: 'f1', at: 26 }]);
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }).state;
  s = applyCommand({ ...s, seatIndex: s.seatOrder.indexOf('f1') }, { type: 'foundCity', faction: 'f1', unit: 'u_0002' }, ruleset).state;
  s = { ...s, seatIndex: s.seatOrder.indexOf('f0'), setup: { ...s.setup, events: 'occasional', ...setup } };
  s.events = emptyEvents();
  const mine = Object.values(s.cities).find((c) => c.faction === 'f0');
  return { s, mine };
}

test('there are about twenty events, five of them disasters, every choice with text', () => {
  const evs = Object.values(ruleset.events);
  assert.ok(evs.length >= 20);
  assert.equal(evs.filter((e) => e.disaster).length, 5);
  for (const e of evs) {
    assert.ok(e.choices.length >= 2, e.id);
    for (const c of e.choices) assert.ok(ruleset.text[c.textKey], `${e.id} choice text`);
  }
});

test('conditions: an event qualifies only in cities where they all hold', () => {
  const { s, mine } = game();
  const harvest = ruleset.events.bountiful_harvest; // pop 3 and on a river
  mine.pop = 1;
  assert.deepEqual(eventCities(s, ruleset, 'f0', harvest), []);
  mine.pop = 4;
  const onRiver = s.map.river[mine.tile] !== 0;
  assert.equal(eventCities(s, ruleset, 'f0', harvest).length, onRiver ? 1 : 0);
  // Faction conditions: mercenaries only at war.
  s.wars = [];
  assert.deepEqual(eventCities(s, ruleset, 'f0', ruleset.events.veteran_mercenaries), []);
  s.wars = ['f0|f1'];
  assert.equal(eventCities(s, ruleset, 'f0', ruleset.events.veteran_mercenaries).length, 1);
});

test('events never fire when switched off, and disasters only with the option on', () => {
  for (const events of ['off']) {
    const { s, mine } = game({ events });
    mine.pop = 8;
    for (let turn = 0; turn < 300; turn += 1) { s.turn = turn; startEventsTurn(s, ruleset, 'f0', []); }
    assert.equal(s.events.pending.f0, undefined);
  }
  const seen = new Set();
  const { s, mine } = game({ events: 'frequent', disasters: 'off' });
  mine.pop = 8;
  for (let turn = 0; turn < 3000; turn += 1) {
    s.turn = turn;
    startEventsTurn(s, ruleset, 'f0', []);
    if (s.events.pending.f0) { seen.add(s.events.pending.f0.event); delete s.events.pending.f0; }
  }
  assert.ok(seen.size > 3, 'some events happen');
  for (const id of seen) assert.ok(!ruleset.events[id].disaster, `${id} is a disaster`);
});

test('an event waits for a choice: end turn is refused, the choice applies its effects', () => {
  const { s, mine } = game();
  s.events.pending.f0 = { id: 'e1', event: 'rich_seam', city: mine.id, turn: s.turn };
  assert.equal(applyCommand(s, { type: 'endTurn', faction: 'f0' }, ruleset).error.code, 'eventPending');
  assert.equal(applyCommand(s, { type: 'chooseEvent', faction: 'f0', event: 'e1', choice: 7 }, ruleset).error.code, 'noSuchChoice');
  const before = cityYields(s, ruleset, mine).total.production;
  const r = applyCommand(s, { type: 'chooseEvent', faction: 'f0', event: 'e1', choice: 0 }, ruleset);
  assert.equal(r.error, undefined);
  const after = r.state.cities[mine.id];
  assert.equal(cityYields(r.state, ruleset, after).total.production, before + 3);
  assert.equal(after.timed.at(-1).turns, 8);
  assert.equal(r.state.events.pending.f0, undefined);
  assert.equal(applyCommand(r.state, { type: 'endTurn', faction: 'f0' }, ruleset).error, undefined);
});

test('instant effects: citizens and free units, never below one citizen', () => {
  const { s, mine } = game();
  mine.pop = 2;
  s.events.pending.f0 = { id: 'e1', event: 'great_fire', city: mine.id, turn: s.turn };
  let r = applyCommand(s, { type: 'chooseEvent', faction: 'f0', event: 'e1', choice: 1 }, ruleset);
  assert.equal(r.state.cities[mine.id].pop, 1);
  r.state.events.pending.f0 = { id: 'e2', event: 'great_fire', city: mine.id, turn: s.turn };
  r = applyCommand(r.state, { type: 'chooseEvent', faction: 'f0', event: 'e2', choice: 1 }, ruleset);
  assert.equal(r.state.cities[mine.id].pop, 1);
  const units = Object.keys(r.state.units).length;
  r.state.events.pending.f0 = { id: 'e3', event: 'veteran_mercenaries', city: mine.id, turn: s.turn };
  r = applyCommand(r.state, { type: 'chooseEvent', faction: 'f0', event: 'e3', choice: 0 }, ruleset);
  assert.equal(Object.keys(r.state.units).length, units + 1);
});

test('the AI answers events with a choice it can make', () => {
  const { s, mine } = game();
  s.events.pending.f0 = { id: 'e1', event: 'festival', city: mine.id, turn: s.turn };
  const ranked = chooseEventChoice(view(s, 'f0', ruleset), ruleset, { path: 'score' });
  assert.equal(ranked.length, 2);
  assert.equal(applyCommand(s, ranked[0].cmd, ruleset).error, undefined);
});

test('influence: wonders, buildings with influence and policy cards add up each turn', () => {
  const { s, mine } = game();
  mine.buildings = ['palace'];
  assert.equal(influencePerTurn(s, ruleset, 'f0'), 0);
  mine.buildings.push('monument', 'amphitheatre');
  assert.equal(influencePerTurn(s, ruleset, 'f0'), 3);
  s.wondersBuilt = { oracle: mine.id };
  assert.equal(influencePerTurn(s, ruleset, 'f0'), 3 + ruleset.tuning.culture.influencePerWonder);
});

test("culture victory: influence must pass the minimum and every living rival's lifetime culture", () => {
  const { s } = game({ victories: ['culture'] });
  const f0 = s.factions.find((f) => f.id === 'f0');
  const f1 = s.factions.find((f) => f.id === 'f1');
  const min = ruleset.victories.culture.params.minInfluence;
  f1.lifetimeCulture = 50;
  f0.influence = min - 1;
  assert.equal(winner(s), null);
  f0.influence = min;
  assert.equal(winner(s), 'f0');
  f1.lifetimeCulture = min;
  assert.equal(winner(s), null, 'equal is not enough');
  f0.influence = min + 1;
  assert.equal(winner(s), 'f0');
});
