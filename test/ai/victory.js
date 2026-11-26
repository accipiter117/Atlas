// Shared by victory-a and victory-b (split in two so the test runner plays them in parallel).
// Phase 9: a full Small game, AI on every seat, at Quick speed, plays to a victory with
// no refused commands, no NaN, and sensible numbers along the way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset } from '../sim/fixtures.js';
import { aiGame } from './harness.js';
import { turnLimit } from '../../src/sim/index.js';

export function victoryGames(seeds) {
  for (const seed of seeds) {
    test(`seed ${seed}: a full Small Quick AI game ends in a victory with no refused commands`, () => {
      const g = aiGame(ruleset, { seed, speed: 'quick', turns: 10_000 });
      const s = g.state;
      assert.ok(s.winner, 'the game was won');
      assert.ok(['conquest', 'science', 'score', 'religious', 'culture'].includes(s.winner.victory));
      assert.ok(s.winner.turn <= turnLimit(s, ruleset), `won on turn ${s.winner.turn}`);
      assert.deepEqual(g.refusals, [], JSON.stringify(g.refusals.slice(0, 3)));
      const cities = Object.values(s.cities);
      assert.ok(cities.length >= 6, `only ${cities.length} cities on the map`);
      for (const f of s.factions) {
        for (const [k, v] of Object.entries(f.stocks ?? {})) assert.ok(Number.isFinite(v), `${f.id} ${k} is ${v}`);
      }
      for (const c of cities) assert.ok(Number.isFinite(c.pop) && c.pop >= 1, `${c.id} population ${c.pop}`);
      assert.ok(s.factions.some((f) => f.research.known.length >= 20), 'nobody researched much');
    });
  }
}
