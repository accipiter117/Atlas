// Phase 8: over five full games of 150 turns, the AI never sends a command the
// rules refuse, and its factions grow (healthy ranges: no NaN, cities founded).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset } from '../sim/fixtures.js';
import { aiGame } from './harness.js';

for (const seed of [1, 2, 3, 4, 5]) {
  test(`seed ${seed}: 150 turns of AI play with no refused commands`, () => {
    const g = aiGame(ruleset, { seed, turns: 150 });
    assert.deepEqual(g.refusals, [], JSON.stringify(g.refusals.slice(0, 3)));
    const cities = Object.values(g.state.cities);
    assert.ok(cities.length >= 6, `only ${cities.length} cities on the map`);
    for (const f of g.state.factions) {
      for (const [k, v] of Object.entries(f.stocks ?? {})) assert.ok(Number.isFinite(v), `${f.id} ${k} is ${v}`);
    }
    for (const c of cities) assert.ok(Number.isFinite(c.pop) && c.pop >= 1, `${c.id} population ${c.pop}`);
    assert.ok(g.state.factions.some((f) => f.research.known.length >= 8), 'nobody researched much');
  });
}
