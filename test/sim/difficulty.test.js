// Phase 10: difficulty levels come only from difficulty.json, are labelled, and
// Prince is level ground.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset } from './fixtures.js';
import { createGame, effectsFor } from '../../src/sim/index.js';

const game = (difficulty) => createGame(ruleset, { seed: 1, ...(difficulty ? { difficulty } : {}), players: [{ kind: 'human' }, { kind: 'ai' }], map: { size: 'small', type: 'continents' } });
const fromDifficulty = (s, f) => effectsFor(s, ruleset, f).filter((e) => e.source.kind === 'difficulty');
const units = (s, f) => Object.values(s.units).filter((u) => u.faction === f).map((u) => u.type).sort();

test('Prince (the default) gives nobody anything', () => {
  for (const s of [game(null), game('prince')]) {
    assert.deepEqual(fromDifficulty(s, 'f0'), []);
    assert.deepEqual(fromDifficulty(s, 'f1'), []);
    assert.deepEqual(units(s, 'f0'), units(s, 'f1'));
  }
});

test('higher levels help the computer only, with exactly the listed bonuses', () => {
  const s = game('emperor');
  const level = ruleset.difficulty.emperor;
  assert.deepEqual(fromDifficulty(s, 'f0'), []);
  assert.equal(fromDifficulty(s, 'f1').length, level.aiEffects.length);
  assert.ok(fromDifficulty(s, 'f1').every((e) => e.effect === 'yieldPercent' && e.amount === 20));
  assert.deepEqual(units(s, 'f1'), [...units(s, 'f0'), ...level.aiStartUnits].sort());
});

test('lower levels help you instead', () => {
  const s = game('settler');
  assert.equal(fromDifficulty(s, 'f0').length, 4);
  assert.deepEqual(fromDifficulty(s, 'f1'), []);
});

test('every level has a summary for the setup screen, and they climb in order', () => {
  const levels = Object.values(ruleset.difficulty).sort((a, b) => a.index - b.index);
  assert.equal(levels.length, 8);
  assert.equal(levels.filter((d) => d.default).map((d) => d.id).join(), 'prince');
  for (const d of levels) assert.ok(ruleset.text[d.summaryKey]);
  const aiBonus = (d) => (d.aiEffects ?? []).reduce((n, e) => n + e.amount, 0) - (d.humanEffects ?? []).reduce((n, e) => n + e.amount, 0);
  for (let i = 1; i < levels.length; i += 1) assert.ok(aiBonus(levels[i]) > aiBonus(levels[i - 1]), levels[i].id);
});
