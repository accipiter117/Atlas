// Phase 8: on a Large map with eight factions, no AI turn takes 2 seconds or more
// in Node, all the way to turn 150. Also: the same seed plays the same game.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset } from '../sim/fixtures.js';
import { aiGame } from './harness.js';
import { fingerprint } from '../../src/sim/index.js';

test('Large map, 8 factions: every AI turn under 2 s to turn 150', () => {
  const g = aiGame(ruleset, { seed: 5, players: 8, size: 'large', turns: 150 });
  const slowest = g.times.reduce((a, b) => (b.ms > a.ms ? b : a));
  assert.ok(slowest.ms < 2000, `turn ${slowest.turn} ${slowest.faction} took ${Math.round(slowest.ms)} ms`);
  assert.deepEqual(g.refusals, []);
});

test('the same seed plays the same AI game', () => {
  const a = aiGame(ruleset, { seed: 9, turns: 40 });
  const b = aiGame(ruleset, { seed: 9, turns: 40 });
  assert.equal(fingerprint(a.state), fingerprint(b.state));
  assert.deepEqual(a.log, b.log);
});
