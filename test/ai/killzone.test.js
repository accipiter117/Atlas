// Phase 19: computer-only Killzone games on the Corinth front play 100 turns
// with no refused commands, and the front moves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal } from '../data/helpers.js';
import { createGame, frontShares } from '../../src/sim/index.js';
import { createSeatRunner } from '../../src/ai/index.js';

const rs = (await loadReal(['base-ancient', 'killzone'])).ruleset;

for (const seed of [21, 22]) {
  test(`Killzone seed ${seed}: 100 AI turns, 0 refusals, the front moves`, () => {
    let state = createGame(rs, { seed, players: [{ kind: 'ai' }, { kind: 'ai' }], map: { preset: 'corinth_front' }, speed: 'quick', events: 'occasional' });
    const ids = state.factions.map((f) => f.id);
    const runner = createSeatRunner(rs, ids, { recordOff: true });
    const start = frontShares(state, rs);
    const refusals = [];
    let battles = 0;
    let moved = false;
    while (!state.winner && state.turn <= 100) {
      const r = runner.play(state, { maxSeats: ids.length });
      state = r.state;
      refusals.push(...r.refusals);
      battles += r.events.filter((e) => e.type === 'battle').length;
      if (JSON.stringify(frontShares(state, rs)) !== JSON.stringify(start)) moved = true;
    }
    assert.deepEqual(refusals, []);
    assert.ok(battles > 5, `${battles} battles`);
    assert.ok(moved, 'the front moved');
    assert.equal(Object.values(state.units).filter((u) => u.type === 'settler').length, 0);
  });
}
